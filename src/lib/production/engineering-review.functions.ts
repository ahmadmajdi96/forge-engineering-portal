import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { reasonSchema, revisionNumber, siteScope } from "./contracts";

export const reviewEngineering = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    siteScope
      .extend({
        revision: revisionNumber,
        decision: z.enum(["Approved", "Rejected"]),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { requirePermission, sameOrigin } = await import("./auth.server");
    const { database, EmsError } = await import("./db.server");
    const request = getRequest();
    sameOrigin(request);
    const { actor } = await requirePermission(request, data.site, "ems.engineering.review");
    await database().begin(async (tx) => {
      const [revision] = await tx<
        { actor: string; digest: string; lifecycle: string }[]
      >`select r.actor, r.digest, r.payload->>'lifecycle' as lifecycle
        from ems.workspaces w join ems.revisions r on r.site=w.site and r.workspace=w.key and r.revision=w.head
        where w.site=${data.site} and w.key='engineering' and r.revision=${data.revision} for update of w`;
      if (!revision || revision.lifecycle !== "In Review")
        throw new EmsError(409, "Choose the current revision submitted for review.");
      if (revision.actor === actor)
        throw new EmsError(403, "An independent reviewer must record the decision.");
      const [existing] =
        await tx`select id from ems.audit where site=${data.site} and object_key='engineering'
        and revision=${data.revision} and action in ('Approved','Rejected')`;
      if (existing) throw new EmsError(409, "A reviewer has already recorded a decision.");
      await tx`insert into ems.audit(site,actor,action,object_key,revision,digest,reason)
        values(${data.site},${actor},${data.decision},'engineering',${data.revision},${revision.digest},${data.reason})`;
    });
    return { ok: true };
  });
