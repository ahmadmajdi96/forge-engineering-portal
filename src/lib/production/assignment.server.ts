import { createPrivateKey, createPublicKey } from "node:crypto";
import { z } from "zod";
import {
  assignmentSchema,
  conflictingAssignments,
  nodeCapabilitiesSchema,
  resolveAssignment,
  targetContextSchema,
  type Assignment,
  type NodeCapabilities,
  type TargetContext,
} from "@/lib/edge/assignment";
import { releaseManifestSchema } from "@/lib/edge/protocol";
import { hashContent, verifyEnvelope } from "@/lib/edge/signature.server";
import { requirePermission, sameOrigin } from "./auth.server";
import { database, EmsError, mode } from "./db.server";
import {
  assignmentPermission,
  createAssignmentInput,
  listAssignmentInput,
  resolveAssignmentInput,
} from "./assignment.contracts";

const pageSize = 40;
const nodeMaximum = 1000;
type Target = {
  context: TargetContext;
  capabilities: NodeCapabilities;
  provenance: "fixture" | "enrolled";
  verifiedAt: Date | null;
};

function fixtureTarget(site: string): Target | null {
  if (mode() !== "local" || !["training-north", "training-south"].includes(site)) return null;
  const nodeId = "local-acceptance-node";
  return {
    context: {
      siteId: site,
      nodeId,
      lineId: "acceptance-line",
      stationId: "acceptance-station",
      terminalId: "acceptance-terminal",
    },
    capabilities: {
      nodeId,
      runtime: 1,
      os: "linux",
      architecture: process.arch === "arm64" ? "arm64" : "amd64",
      displays: ["panel", "portrait", "tablet"],
      peripherals: [],
      signals: [],
      commandPolicies: [],
    },
    provenance: "fixture",
    verifiedAt: null,
  };
}

async function targets(
  site: string,
  filter: { nodeId?: string | undefined; terminalId?: string | undefined } = {},
): Promise<Target[]> {
  const { nodeId = null, terminalId = null } = filter;
  const fixture = fixtureTarget(site);
  if (fixture)
    return (nodeId && fixture.context.nodeId !== nodeId) ||
      (terminalId && fixture.context.terminalId !== terminalId)
      ? []
      : [fixture];
  const data = await database()<{ context: unknown; capabilities: unknown; verified_at: Date }[]>`
    select context, capabilities, verified_at from ems.assignment_targets
    where site = ${site} and provenance = 'enrolled' and revoked_at is null
      and verified_at > now() - interval '2 minutes'
      and (${nodeId}::text is null or node_id = ${nodeId}::text)
      and (${terminalId}::text is null or context->>'terminalId' = ${terminalId}::text)
    order by node_id limit 100`;
  return data.map((target) => ({
    context: targetContextSchema.parse(target.context),
    capabilities: nodeCapabilitiesSchema.parse(target.capabilities),
    provenance: "enrolled",
    verifiedAt: target.verified_at,
  }));
}

function publishedArtifact(value: unknown) {
  if (mode() !== "local") throw new EmsError(503, "Production package trust is not provisioned.");
  const privatePem = process.env["EMS_RELEASE_KEY_BASE64"];
  if (!privatePem) throw new EmsError(503, "The local release signing key is unavailable.");
  const keyId = process.env["EMS_RELEASE_KEY_ID"] ?? "ems-fixture";
  const key = createPublicKey(createPrivateKey(Buffer.from(privatePem, "base64")));
  return verifyEnvelope("release", value, releaseManifestSchema, new Map([[keyId, key]]));
}

export async function listAssignments(
  request: Request,
  { site, after }: z.infer<typeof listAssignmentInput>,
) {
  await requirePermission(request, site, assignmentPermission.view);
  const db = database();
  const records = await db<{ definition: unknown }[]>`
    select definition from ems.assignments where site = ${site}
      and (${after ?? null}::uuid is null or id > ${after ?? null}::uuid)
    order by id limit ${pageSize + 1}`;
  const assignments = records
    .slice(0, pageSize)
    .map(({ definition }) => assignmentSchema.parse(definition));
  const available = await targets(site);
  const releases = await db<{ id: string; application_id: string; revision: number }[]>`
    select id, application_id, workspace_revision as revision from ems.releases
    where site = ${site} and status = 'published'
    order by published_at desc limit 100`;
  return {
    assignments,
    next: records.length > pageSize ? (assignments.at(-1)?.id ?? null) : null,
    targets: available,
    releases,
  };
}

export async function createAssignment(
  request: Request,
  input: z.infer<typeof createAssignmentInput>,
) {
  sameOrigin(request);
  const { actor } = await requirePermission(request, input.site, assignmentPermission.edit);
  if (mode() !== "local")
    throw new EmsError(
      503,
      "Production assignments require verified deployment and quality grants.",
    );
  const [target] = await targets(input.site, { nodeId: input.nodeId });
  if (!target) throw new EmsError(409, "A current scoped target is required.");
  const selector: Assignment["selector"] = {};
  for (const field of input.selectors) {
    const selected = target.context[field];
    if (!selected)
      throw new EmsError(409, "The selected dimension has no registered target identity.");
    selector[field] = selected;
  }
  return database().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.site, input.nodeId, input.kind])}, 0))`;
    const [row] = await tx<{ artifact: unknown }[]>`select artifact from ems.releases
      where site = ${input.site} and id = ${input.releaseId} and status = 'published'`;
    if (!row) throw new EmsError(404, "Published package not found in this factory.");
    const release = publishedArtifact(row.artifact);
    if (release.value.kind !== input.kind)
      throw new EmsError(409, "Package kind differs from the target slot.");
    const result = assignmentSchema.safeParse({
      id: input.id,
      siteId: input.site,
      nodeId: input.nodeId,
      kind: input.kind,
      selector,
      releaseId: input.releaseId,
      releaseDigest: release.contentDigest,
      configRevision: input.configRevision,
      configuration: {},
      secretReferences: [],
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil,
    });
    if (!result.success)
      throw new EmsError(400, result.error.issues[0]?.message ?? "Invalid assignment");
    const assignment = result.data;
    const eligible = resolveAssignment({
      assignments: [assignment],
      releases: [{ manifest: release.value, contentDigest: release.contentDigest }],
      context: target.context,
      node: target.capabilities,
      kind: input.kind,
      at: input.effectiveFrom,
    });
    if (eligible.status !== "resolved") throw new EmsError(409, eligible.issues.join(". "));

    const records = await tx<{ definition: unknown }[]>`select definition from ems.assignments
      where site = ${input.site} and node_id = ${input.nodeId} and kind = ${input.kind}
      order by id limit ${nodeMaximum + 1}`;
    const current = records.map(({ definition }) => assignmentSchema.parse(definition));
    const duplicate = current.find(({ id }) => id === assignment.id);
    if (duplicate && hashContent(duplicate) === hashContent(assignment))
      return { id: assignment.id };
    if (current.length >= nodeMaximum)
      throw new EmsError(409, "Assignment history requires administrative review.");
    const overlap = current
      .map((record) => conflictingAssignments([record, assignment])[0])
      .find((conflict) => conflict !== undefined);
    if (overlap) throw new EmsError(409, overlap.reason);
    await tx`insert into ems.assignments
      (site, id, node_id, kind, release_id, release_digest, effective_from, effective_until, definition, actor)
      values (${input.site}, ${input.id}, ${input.nodeId}, ${input.kind}, ${input.releaseId}, ${release.contentDigest},
        ${new Date(input.effectiveFrom)}, ${input.effectiveUntil === null ? null : new Date(input.effectiveUntil)},
        ${JSON.stringify(assignment)}::text::jsonb, ${actor})`;
    await tx`insert into ems.audit (site, actor, action, object_key, digest, reason)
      values (${input.site}, ${actor}, 'assign', ${input.id}, ${release.contentDigest}, ${input.reason})`;
    return { id: input.id };
  });
}

export async function inspectAssignment(
  request: Request,
  input: z.infer<typeof resolveAssignmentInput>,
) {
  await requirePermission(request, input.site, assignmentPermission.view);
  const [target, collision] = await targets(input.site, input);
  if (collision)
    throw new EmsError(409, "Terminal has more than one current node; choose the intended device.");
  if (!target) throw new EmsError(409, "Target enrollment is unavailable in this factory.");
  const at = input.at ?? Date.now();
  const rows = await database()<{ definition: unknown; artifact: unknown }[]>`
    select a.definition, r.artifact from ems.assignments a
    join ems.releases r on r.site = a.site and r.id = a.release_id
    where a.site = ${input.site} and a.node_id = ${target.context.nodeId} and a.kind = ${input.kind}
      and a.effective_from <= ${new Date(at)} and (a.effective_until is null or a.effective_until > ${new Date(at)})
      and r.status = 'published'
    order by a.id limit ${nodeMaximum + 1}`;
  if (rows.length > nodeMaximum)
    throw new EmsError(409, "Assignment history requires administrative review.");
  const matching = rows.map(({ artifact, definition }) => ({
    assignment: assignmentSchema.parse(definition),
    release: publishedArtifact(artifact),
  }));
  const result = resolveAssignment({
    assignments: matching.map(({ assignment }) => assignment),
    releases: matching.map(({ release }) => ({
      manifest: release.value,
      contentDigest: release.contentDigest,
    })),
    context: target.context,
    node: target.capabilities,
    kind: input.kind,
    at,
  });
  return {
    ...result,
    target: {
      nodeId: target.context.nodeId,
      terminalId: target.context.terminalId,
      provenance: target.provenance,
    },
  };
}

export async function engineeringAssignments(
  request: Request,
  {
    site,
    field,
    id,
    after,
  }: z.infer<typeof import("./engineering-relations.functions").relationScope>,
) {
  await requirePermission(request, site, assignmentPermission.view);
  const fixture = fixtureTarget(site);
  const alternate = field === "stepId" ? "operationId" : field;
  const result = await database()<
    {
      id: string;
      release: string;
      node: string;
      kind: "operator" | "hmi";
      config: string;
      application_id: string;
      revision: number;
      schedule: string;
    }[]
  >`
    with target as (
      select node_id,context from ems.assignment_targets where site=${site}
      and provenance='enrolled' and revoked_at is null and verified_at > now()-interval '2 minutes'
      union all select ${fixture?.context.nodeId ?? null}::text,${JSON.stringify(fixture?.context ?? {})}::jsonb where ${!!fixture}
    ) select a.id,a.release_id as release,a.node_id as node,a.kind,a.definition->>'configRevision' as config,
      r.application_id,r.workspace_revision as revision,
      case when a.effective_from>now() then 'Scheduled' when a.effective_until<=now() then 'Expired' else 'Within assignment interval' end as schedule
      from ems.assignments a join ems.releases r on r.site=a.site and r.id=a.release_id
      where a.site=${site} and (${after ?? null}::uuid is null or a.id>${after ?? null}::uuid) and
        (a.definition->'selector'->>${field}=${id} or a.definition->'selector'->>${alternate}=${id}
        or exists (select 1 from target t where t.node_id=a.node_id and t.context @> (a.definition->'selector')
          and (t.context->>${field}=${id} or t.context->>${alternate}=${id})))
      order by a.id limit 11`;
  const records = result.slice(0, 10);
  return { records, next: result.length > 10 ? records.at(-1)!.id : null };
}
