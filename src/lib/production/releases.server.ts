import { processLinkProblems, stationHandoffIssues } from "./process-links";
import { createPrivateKey, randomUUID } from "node:crypto";
import {
  compileApplication,
  studioWorkspaceSchema,
  type StudioDefinition,
} from "@/lib/studio/model";
import {
  maximumReleaseBytes,
  releaseManifestSchema,
  type ReleaseManifest,
} from "@/lib/edge/protocol";
import { hashContent, signEnvelope, type Signed } from "@/lib/edge/signature.server";
import { requirePermission, sameOrigin } from "./auth.server";
import { releasePermission } from "./contracts";
import { database, EmsError, mode } from "./db.server";
import { configuredConsumers } from "./delivery.server";
import { processDocumentSchema, validateRoute } from "./process";

type ReleaseStatus = "submitted" | "approved" | "published";
export type ReleaseSummary = {
  id: string;
  workspace_revision: number;
  application_id: string;
  content_hash: string;
  status: ReleaseStatus;
  published_at: Date | null;
  created_at: Date;
};

export async function listReleases(request: Request, site: string): Promise<ReleaseSummary[]> {
  await requirePermission(request, site, releasePermission.view);
  return database()<
    ReleaseSummary[]
  >`select id, workspace_revision, application_id, content_hash, status, published_at, created_at
    from ems.releases where site = ${site} order by created_at desc limit 100`;
}

function appForRelease(payload: unknown, id: string) {
  const definition = studioWorkspaceSchema.parse(payload).applications.find((app) => app.id === id);
  if (!definition) throw new EmsError(404, "Application does not exist at this revision.");
  const compiled = compileApplication(definition);
  if (!compiled.ok)
    throw new EmsError(400, "App validation failed. " + compiled.issues[0]?.message);
  if (compiled.app.kind === "procedure")
    throw new EmsError(400, "Choose an operator app or HMI for an edge release.");
  return compiled.app as StudioDefinition & { kind: "operator" | "hmi" };
}

type BaselineRef = Omit<ReleaseManifest["dependencies"][number], "system">;
type ReleaseFields = {
  id: string;
  site: string;
  revision: number;
  digest: string;
  baseline: BaselineRef[];
};

function fixtureManifest(
  app: ReturnType<typeof appForRelease>,
  release: ReleaseFields,
  evidence: string,
  publishedAt: number,
) {
  if (
    app.offlinePolicy === "bounded-offline" ||
    app.dependencies.length ||
    app.media.length ||
    app.connectorIds.length ||
    app.signals.length ||
    app.capabilities.length
  )
    throw new EmsError(
      409,
      "Fixture publication requires a self-contained app without bounded offline operation, external media, hardware, or connectors.",
    );
  return releaseManifestSchema.parse({
    version: 1,
    id: release.id,
    siteId: release.site,
    kind: app.kind,
    studio: { workspace: "studio", revision: release.revision, appId: app.id },
    compatibility: {
      runtime: 1,
      os: "linux",
      architectures: ["amd64", "arm64"],
      displays: [],
      peripherals: [],
      signals: [],
      commandPolicies: [],
    },
    dependencies: release.baseline.map((ref) => ({ ...ref, system: "EMS" })),
    validationDigest: release.digest,
    approvalEvidence: [evidence],
    publishedAt,
    stateSchema: "studio-v1",
    rollbackFromSchemas: ["studio-v1"],
    offlinePolicy: app.offlinePolicy,
    maximumOfflineMs: 0,
    application: app,
  });
}

function serializePackage(artifact: Signed<ReleaseManifest>) {
  const body = JSON.stringify(artifact);
  if (Buffer.byteLength(body) > maximumReleaseBytes)
    throw new EmsError(413, "Application package exceeds the edge runtime size limit.");
  return body;
}

export async function submitRelease(
  request: Request,
  input: { site: string; revision: number; app: string; reason: string },
) {
  sameOrigin(request);
  const { actor } = await requirePermission(request, input.site, releasePermission.submit);
  return database().begin(async (tx) => {
    const [revision] = await tx<
      { payload: unknown; actor: string }[]
    >`select payload, actor from ems.revisions
      where site = ${input.site} and workspace = 'studio' and revision = ${input.revision}`;
    if (!revision) throw new EmsError(404, "Studio revision was not found in this factory.");
    if (revision.actor !== actor)
      throw new EmsError(403, "Only the author can submit this studio revision.");
    const app = appForRelease(revision.payload, input.app);
    const digest = hashContent(app);
    const baselines = await tx<(BaselineRef & { details: unknown })[]>`
      select r.workspace as object, r.revision::text, r.digest,
        case when r.workspace = 'spatial' then r.payload->'spaces' else r.payload end as details
      from ems.revisions r join ems.workspaces w on w.site = r.site and w.key = r.workspace and w.head = r.revision
      where r.site = ${input.site} and r.workspace in ('spatial','process') order by r.workspace`;
    const spatial = baselines.find((baseline) => baseline.object === "spatial")?.details;
    const processDesign = baselines.find((baseline) => baseline.object === "process")?.details;
    if (processDesign) {
      const process = processDocumentSchema.parse(processDesign);
      if (
        process.routes.some(
          (route) =>
            route.lineId ||
            route.steps.some(
              (step) =>
                step.operationId || step.engineeringStationIds?.length || step.completionSignal,
            ),
        )
      ) {
        const [engineering] = await tx<(BaselineRef & { details: unknown })[]>`
          select r.workspace as object, r.revision::text, r.digest, r.payload->'model' as details
          from ems.revisions r join ems.workspaces w on w.site = r.site and w.key = r.workspace and w.head = r.revision
          where r.site = ${input.site} and r.workspace = 'engineering'`;
        if (!engineering)
          throw new EmsError(409, "The linked engineering revision is unavailable.");
        const { modelSchema } = await import("@/lib/engineering/model");
        const model = modelSchema.parse(engineering.details);
        const issues = processLinkProblems(
          process,
          model,
          Array.isArray(spatial) ? spatial : [],
          studioWorkspaceSchema.parse(revision.payload),
        );
        const [problem] = issues.values();
        if (problem) throw new EmsError(409, problem);
        for (const route of process.routes) {
          const issue = stationHandoffIssues(route, model)[0];
          if (issue) throw new EmsError(409, issue);
        }
        baselines.push(engineering);
      }
      const stations = new Set<string>();
      if (Array.isArray(spatial)) {
        for (const item of spatial)
          if (item?.kind === "station" && typeof item.id === "string") stations.add(item.id);
      }
      for (const route of process.routes) {
        const issue = validateRoute(route)[0];
        if (issue) throw new EmsError(409, `Process ${route.name} needs revision. ${issue}`);
        if (route.steps.some((step) => step.stationIds.some((station) => !stations.has(station))))
          throw new EmsError(
            409,
            `Process ${route.name} refers to a station outside this layout revision.`,
          );
      }
    }
    const refs = baselines.map(({ object, revision, digest }) => ({ object, revision, digest }));
    const id = randomUUID();
    if (mode() === "local") {
      const value = fixtureManifest(
        app,
        { id, site: input.site, revision: input.revision, digest, baseline: refs },
        randomUUID(),
        Date.now(),
      );
      serializePackage({
        keyId: process.env["EMS_RELEASE_KEY_ID"] ?? "ems-fixture",
        contentDigest: "0".repeat(64),
        signature: "A".repeat(86),
        value,
      });
    }
    const [release] = await tx<{ id: string }[]>`insert into ems.releases
      (id, site, workspace_revision, application_id, baseline_refs, content_hash, author)
      values (${id}, ${input.site}, ${input.revision}, ${input.app}, ${JSON.stringify(refs)}::text::jsonb, ${digest}, ${actor})
      on conflict (site, workspace_revision, application_id) do nothing returning id`;
    if (!release)
      throw new EmsError(409, "This application revision already has a release request.");
    await tx`insert into ems.audit (site, actor, action, object_key, revision, digest, reason)
      values (${input.site}, ${actor}, 'submit', ${release.id}, ${input.revision}, ${digest}, ${input.reason})`;
    return release;
  });
}

export async function transitionRelease(
  request: Request,
  input: {
    site: string;
    id: string;
    action: "approve" | "publish";
    expected: "submitted" | "approved";
    reason: string;
  },
) {
  sameOrigin(request);
  const { actor } = await requirePermission(request, input.site, releasePermission[input.action]);
  if (mode() !== "local")
    throw new EmsError(
      503,
      "Live publication requires verified, decision-bound AMS step-up and approved peer contracts.",
    );

  return database().begin(async (tx) => {
    const [release] = await tx<
      (ReleaseSummary & {
        author: string;
        approval_evidence: string | null;
        baseline_refs: Omit<ReleaseManifest["dependencies"][number], "system">[];
      })[]
    >`select * from ems.releases where id = ${input.id} and site = ${input.site} for update`;
    if (!release) throw new EmsError(404, "Release was not found.");
    if (release.status !== input.expected || actor === release.author)
      throw new EmsError(
        409,
        "This transition requires the current stage and a separate reviewer.",
      );
    const digest = release.content_hash;
    if (input.action === "approve" && release.status === "submitted") {
      await tx`update ems.releases set status = 'approved', reviewer = ${actor}, approval_evidence = ${randomUUID()}
        where site = ${input.site} and id = ${input.id}`;
    } else if (
      input.action === "publish" &&
      release.status === "approved" &&
      release.approval_evidence
    ) {
      const [revision] = await tx<{ payload: unknown }[]>`select payload from ems.revisions
        where site = ${input.site} and workspace = 'studio' and revision = ${release.workspace_revision}`;
      if (!revision) throw new EmsError(409, "Pinned studio revision is missing.");
      const app = appForRelease(revision.payload, release.application_id);
      if (hashContent(app) !== digest)
        throw new EmsError(409, "Studio content does not match the reviewed digest.");
      const key = process.env["EMS_RELEASE_KEY_BASE64"];
      if (!key) throw new EmsError(503, "A fixture release signing key is required.");
      const publishedAt = Date.now();
      const manifest = fixtureManifest(
        app,
        {
          id: release.id,
          site: input.site,
          revision: release.workspace_revision,
          digest,
          baseline: release.baseline_refs,
        },
        release.approval_evidence,
        publishedAt,
      );
      const artifact = signEnvelope(
        "release",
        process.env["EMS_RELEASE_KEY_ID"] ?? "ems-fixture",
        createPrivateKey(Buffer.from(key, "base64")),
        manifest,
      );
      await tx`update ems.releases set status = 'published', artifact = ${serializePackage(artifact)}::text::jsonb,
        published_at = ${new Date(publishedAt)} where site = ${input.site} and id = ${input.id}`;
      for (const consumer of configuredConsumers()) {
        await tx`insert into ems.outbox (consumer, site, release_id, content_hash)
          values (${consumer}, ${input.site}, ${input.id}, ${artifact.contentDigest})`;
      }
    } else {
      throw new EmsError(409, "This action does not match the release stage.");
    }
    await tx`insert into ems.audit (site, actor, action, object_key, revision, digest, reason)
      values (${input.site}, ${actor}, ${input.action}, ${input.id}, ${release.workspace_revision}, ${digest}, ${input.reason})`;
    return { id: input.id };
  });
}

export async function releaseArtifact(request: Request, site: string, id: string) {
  await requirePermission(request, site, releasePermission.view);
  const [release] = await database()<{ artifact: Signed<ReleaseManifest> }[]>`
    select artifact from ems.releases where site = ${site} and id = ${id} and status = 'published'`;
  if (!release) throw new EmsError(404, "Published artifact not found.");
  return release.artifact;
}
