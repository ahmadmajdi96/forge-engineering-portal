import { hardwareTransitionError, placedHardware } from "@/lib/engineering/hardware-lifecycle";
import { legacyStudioFields } from "@/lib/engineering/studio-fields";
import { modelSchema, validateModel, type EngineeringModel } from "@/lib/engineering/model";
import { z } from "zod";
import { canonical } from "@/lib/integrations/adapters";
import {
  brokenByEngineeringEdit,
  changedEngineeringLinks,
  engineeringLinks,
  invalidEngineeringLinks,
} from "@/lib/spatial/engineering-links";
import { spatialDocumentSchema, type SpatialDocument } from "@/lib/spatial/model";
import { studioWorkspaceSchema } from "@/lib/studio/model";
import { requirePermission, sameOrigin } from "./auth.server";
import { editPermission, viewPermission, workspaceScope } from "./contracts";
import { database, EmsError, hash } from "./db.server";
import { processDocumentSchema, type ProcessDocument } from "./process";
import { processLinkProblems } from "./process-links";
import { signalTransitionError } from "@/lib/engineering/signal-design";

type Scope = z.infer<typeof workspaceScope>;
const maximumDocumentBytes = 8 * 1024 * 1024;

export async function readWorkspace(request: Request, input: Scope) {
  await requirePermission(request, input.site, viewPermission[input.workspace]);
  const [row] = await database()<{ revision: number; payload: unknown }[]>`
    select revision, payload from ems.revisions r
    join ems.workspaces w on w.site = r.site and w.key = r.workspace and w.head = r.revision
    where r.site = ${input.site} and r.workspace = ${input.workspace}`;
  return row ?? { revision: 0, payload: null };
}

async function validateWorkspace(input: Scope, payload: unknown) {
  let raw: string;
  try {
    raw = JSON.stringify(payload);
  } catch {
    throw new EmsError(400, "Workspace document could not be serialized.");
  }
  if (!raw || Buffer.byteLength(raw) > maximumDocumentBytes)
    throw new EmsError(413, "Workspace document exceeds its size limit.");
  if (input.workspace === "engineering") {
    const document = z
      .object({ model: modelSchema, lifecycle: z.enum(["Draft", "In Review"]) })
      .parse(payload);
    if (document.lifecycle === "In Review" && validateModel(document.model).length)
      throw new EmsError(400, "Resolve engineering validation blockers before review.");
    return document;
  }
  if (input.workspace === "spatial") {
    const model = spatialDocumentSchema.parse(payload);
    if (model.siteCode !== input.site)
      throw new EmsError(400, "Factory scope does not match the spatial document.");
    const { verifySpatialArtifactContent } = await import("@/lib/spatial/artifacts");
    const { validateSpatialRelationships } = await import("@/lib/spatial/validation");
    const issues = validateSpatialRelationships(model);
    if (issues[0]) throw new EmsError(400, issues[0].message);
    await verifySpatialArtifactContent(model);
    return model;
  }
  if (input.workspace === "studio") return studioWorkspaceSchema.parse(payload);
  return processDocumentSchema.parse(payload);
}

export async function writeWorkspace(
  request: Request,
  input: Scope & { expected: number; payload?: unknown; reason: string },
) {
  sameOrigin(request);
  const { actor } = await requirePermission(request, input.site, editPermission[input.workspace]);
  let payload: object;
  try {
    payload = await validateWorkspace(input, input.payload);
  } catch (error) {
    if (error instanceof EmsError) throw error;
    if (error instanceof z.ZodError)
      throw new EmsError(400, "Invalid workspace document. " + error.issues[0]?.message);
    throw new EmsError(400, "Workspace content failed verification.");
  }
  if (input.workspace === "engineering") {
    const [previous] = await database()<{ payload: { model: EngineeringModel } }[]>`
      select payload from ems.revisions where site=${input.site} and workspace='engineering' and revision=${input.expected}`;
    if (
      canonical(legacyStudioFields(previous?.payload.model)) !==
      canonical(legacyStudioFields((payload as { model: EngineeringModel }).model))
    )
      await requirePermission(request, input.site, editPermission.studio);
  }
  const serialized = canonical(JSON.parse(JSON.stringify(payload)));
  const digest = hash(serialized);
  // The expected revision is immutable. Checking grants before locking the head also
  // keeps identity-provider latency outside the layout write transaction.
  let links: ReturnType<typeof changedEngineeringLinks> = [];
  if (input.workspace === "spatial" && engineeringLinks(payload as SpatialDocument).length) {
    const [last] = await database()<{ payload: SpatialDocument }[]>`
      select payload from ems.revisions where site = ${input.site} and workspace = 'spatial' and revision = ${input.expected}`;
    links = changedEngineeringLinks(last?.payload ?? null, payload as SpatialDocument);
    if (links.length) await requirePermission(request, input.site, viewPermission.engineering);
  }
  return database().begin(async (tx) => {
    // Take the cross-workspace lock before either head so simultaneous edits cannot
    // validate against different versions of the same physical relationship.
    if (["spatial", "engineering", "process"].includes(input.workspace))
      await tx`select pg_advisory_xact_lock(hashtext('ems/spatial-engineering'), hashtext(${input.site}))`;
    await tx`insert into ems.workspaces (site, key) values (${input.site}, ${input.workspace}) on conflict do nothing`;
    const [current] = await tx<
      { head: number }[]
    >`select head from ems.workspaces where site = ${input.site} and key = ${input.workspace} for update`;
    if (!current) throw new EmsError(503, "Workspace could not be initialized.");
    if (current.head !== input.expected)
      throw new EmsError(
        409,
        "Someone saved a newer revision. Preserve your draft and reload before merging.",
      );
    if (links.length) {
      const [engineering] = await tx<{ payload: { model: unknown } }[]>`
          select r.payload from ems.workspaces w
          join ems.revisions r on w.site=r.site and w.key=r.workspace and w.head=r.revision
          where w.site=${input.site} and w.key='engineering' for share of w`;
      if (!engineering)
        throw new EmsError(400, "Save the engineering records before linking them to the layout.");
      const [invalid] = invalidEngineeringLinks(
        links,
        modelSchema.parse(engineering.payload.model),
      );
      if (invalid)
        throw new EmsError(
          400,
          `Engineering record ${invalid.engineeringId} is unavailable in the selected site or parent. Check its assignment before saving.`,
        );
    }
    if (input.workspace === "engineering") {
      const [old] = await tx<
        { model: unknown }[]
      >`select payload->'model' as model from ems.revisions
        where site=${input.site} and workspace='engineering' and revision=${current.head}`;
      const previous = old ? modelSchema.parse(old.model) : null;
      const next = (payload as { model: EngineeringModel }).model;
      const violation =
        hardwareTransitionError(previous, next) ?? signalTransitionError(previous, next);
      if (violation) throw new EmsError(400, violation);
      if (previous) {
        const [layout] = await tx<Pick<SpatialDocument, "spaces" | "occurrences">[]>`
          select r.payload->'spaces' as spaces, r.payload->'occurrences' as occurrences
          from ems.workspaces w join ems.revisions r on r.site=w.site and r.workspace=w.key and r.revision=w.head
          where w.site=${input.site} and w.key='spatial'`;
        if (layout && brokenByEngineeringEdit(engineeringLinks(layout), previous, next))
          throw new EmsError(
            409,
            "A saved layout placement still references a record you changed. Unlink its layout placement before changing its station, line or archive status.",
          );
      }
      if (previous) {
        const currentStations = new Set(next.stations.map((station) => station.id));
        const currentHardware = new Map(
          next.records.map((record) => [record.kind + ":" + record.id, record]),
        );
        const activeLines = new Set(next.lines.filter((l) => !l.archived).map((l) => l.id));
        const protectedIds = [
          ...previous.lines
            .filter((l) => !l.archived && !activeLines.has(l.id))
            .map((l) => ({ field: "lineId", id: l.id })),
          ...previous.records
            .filter(
              (r) =>
                r.kind === "operation" &&
                !r.archived &&
                (!currentHardware.has("operation:" + r.id) ||
                  currentHardware.get("operation:" + r.id)?.archived),
            )
            .flatMap((r) => [
              { field: "stepId", id: r.id },
              { field: "operationId", id: r.id },
            ]),
          ...previous.stations
            .filter((station) => !currentStations.has(station.id))
            .map((station) => ({ field: "stationId", id: station.id })),
          ...previous.records
            .filter((record) => {
              if (record.archived || !placedHardware(record)) return false;
              const changed = currentHardware.get(record.kind + ":" + record.id);
              return changed?.archived || changed?.parent !== record.parent;
            })
            .map((record) => ({
              field: record.kind === "terminal" ? "terminalId" : "machineId",
              id: record.id,
            })),
        ];
        if (protectedIds.length) {
          const [reference] = await tx`select 1 from ems.assignments a
            cross join jsonb_to_recordset(${JSON.stringify(protectedIds)}::jsonb) as target(field text, id text)
            where a.site=${input.site} and (a.definition->'selector'->>target.field=target.id or exists (
              select 1 from ems.assignment_targets t where t.site=a.site and t.node_id=a.node_id
              and t.provenance='enrolled' and t.revoked_at is null and t.context @> (a.definition->'selector')
              and t.context->>target.field=target.id))
              and (a.effective_until is null or a.effective_until > now()) limit 1`;
          if (reference)
            throw new EmsError(
              409,
              "An application release targets this record. Review its active assignment before changing ownership or archiving it.",
            );
        }
      }
    }
    if (["process", "spatial", "engineering"].includes(input.workspace)) {
      // Compare against the saved relationships so legacy drafts can still be corrected incrementally.
      const [processRow] = await tx<{ payload: ProcessDocument }[]>`
        select r.payload from ems.workspaces w join ems.revisions r on w.site=r.site and w.key=r.workspace and w.head=r.revision
        where w.site=${input.site} and w.key='process'`;
      const beforeProcess = processRow?.payload ?? { version: 1 as const, routes: [] };
      const afterProcess =
        input.workspace === "process" ? (payload as ProcessDocument) : beforeProcess;
      if (
        afterProcess.routes.some(
          (route) => route.lineId || route.steps.some((step) => step.operationId),
        )
      ) {
        const [designRow] = await tx<{ model: unknown }[]>`
          select r.payload->'model' as model from ems.workspaces w join ems.revisions r on w.site=r.site and w.key=r.workspace and w.head=r.revision
          where w.site=${input.site} and w.key='engineering'`;
        const [layoutRow] = await tx<{ spaces: SpatialDocument["spaces"] }[]>`
          select r.payload->'spaces' as spaces from ems.workspaces w join ems.revisions r on w.site=r.site and w.key=r.workspace and w.head=r.revision
          where w.site=${input.site} and w.key='spatial'`;
        const beforeDesign = designRow ? modelSchema.parse(designRow.model) : null;
        const beforeSpaces = layoutRow?.spaces ?? [];
        const known = processLinkProblems(beforeProcess, beforeDesign, beforeSpaces);
        const problems = processLinkProblems(
          afterProcess,
          input.workspace === "engineering"
            ? (payload as { model: EngineeringModel }).model
            : beforeDesign,
          input.workspace === "spatial" ? (payload as SpatialDocument).spaces : beforeSpaces,
        );
        for (const [key, message] of problems)
          if (!known.has(key)) throw new EmsError(409, message);
      }
    }
    const revision = current.head + 1;
    await tx`insert into ems.revisions (site, workspace, revision, payload, digest, actor)
      values (${input.site}, ${input.workspace}, ${revision}, ${serialized}::text::jsonb, ${digest}, ${actor})`;
    await tx`update ems.workspaces set head = ${revision} where site = ${input.site} and key = ${input.workspace}`;
    await tx`insert into ems.audit (site, actor, action, object_key, revision, digest, reason)
      values (${input.site}, ${actor}, 'save', ${input.workspace}, ${revision}, ${digest}, ${input.reason})`;
    return { revision };
  });
}
