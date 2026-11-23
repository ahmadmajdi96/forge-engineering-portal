import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { revisionNumber, siteScope } from "@/lib/production/contracts";
import { compileApplication, studioWorkspaceSchema } from "./model";

export const validateFactoryStudioDefinition = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    siteScope
      .extend({
        application: z.string().min(1).max(96),
        revision: revisionNumber,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { requirePermission, sameOrigin } = await import("@/lib/production/auth.server");
    const { database, EmsError } = await import("@/lib/production/db.server");
    const { hashContent } = await import("@/lib/edge/signature.server");
    const request = getRequest();
    sameOrigin(request);
    const { actor } = await requirePermission(
      request,
      data.site,
      "ems.application_studio.validate",
    );
    const [row] = await database()<{ payload: unknown }[]>`
      select payload from ems.revisions where site = ${data.site} and workspace = 'studio' and revision = ${data.revision}`;
    if (!row) throw new EmsError(404, "Saved Studio revision was not found.");
    const definition = studioWorkspaceSchema
      .parse(row.payload)
      .applications.find((app) => app.id === data.application);
    if (!definition) throw new EmsError(404, "Application was not found at this revision.");
    const result = compileApplication(definition);
    const issues = result.ok ? [] : result.issues;
    const digest = hashContent(definition);
    const reason = result.ok
      ? "Saved application passed workflow validation."
      : `Saved application failed workflow validation with ${issues.length} issues.`;
    await database()`insert into ems.audit (site, actor, action, object_key, revision, digest, reason)
      values (${data.site}, ${actor}, ${result.ok ? "validate_pass" : "validate_fail"}, ${data.application}, ${data.revision}, ${digest}, ${reason})`;
    return { revision: data.revision, digest, issues };
  });
