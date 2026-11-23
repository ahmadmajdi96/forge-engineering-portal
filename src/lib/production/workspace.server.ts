import { modelSchema, validateModel } from "@/lib/engineering/model";
import { z } from "zod";
import { canonical } from "@/lib/integrations/adapters";
import { spatialDocumentSchema } from "@/lib/spatial/model";
import { studioWorkspaceSchema } from "@/lib/studio/model";
import { requirePermission, sameOrigin } from "./auth.server";
import { editPermission, viewPermission, workspaceScope } from "./contracts";
import { database, EmsError, hash } from "./db.server";
import { processDocumentSchema } from "./process";

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
    const document = z.object({model: modelSchema, lifecycle: z.enum(["Draft", "In Review"])}).parse(payload);
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
  const serialized = canonical(JSON.parse(JSON.stringify(payload)));
  const digest = hash(serialized);
  return database().begin(async (tx) => {
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
    const revision = current.head + 1;
    await tx`insert into ems.revisions (site, workspace, revision, payload, digest, actor)
      values (${input.site}, ${input.workspace}, ${revision}, ${serialized}::text::jsonb, ${digest}, ${actor})`;
    await tx`update ems.workspaces set head = ${revision} where site = ${input.site} and key = ${input.workspace}`;
    await tx`insert into ems.audit (site, actor, action, object_key, revision, digest, reason)
      values (${input.site}, ${actor}, 'save', ${input.workspace}, ${revision}, ${digest}, ${input.reason})`;
    return { revision };
  });
}
