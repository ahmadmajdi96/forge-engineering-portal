import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { reasonSchema, workspaceScope } from "./contracts";

export const loadFactoryWorkspace = createServerFn({ method: "POST", strict: { output: false } })
  .inputValidator((input) => workspaceScope.parse(input))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { readWorkspace } = await import("./workspace.server");
    return readWorkspace(getRequest(), data);
  });

export const saveFactoryWorkspace = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    workspaceScope
      .extend({
        expected: z.number().int().min(0).max(2147483646),
        payload: z.unknown(),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { writeWorkspace } = await import("./workspace.server");
    return writeWorkspace(getRequest(), data);
  });

export const engineeringHistory = createServerFn({ method: "POST" })
  .inputValidator((input) => workspaceScope.pick({ site: true }).parse(input))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { requirePermission } = await import("./auth.server");
    const { database } = await import("./db.server");
    await requirePermission(getRequest(), data.site, "ems.engineering.view");
    const rows = await database()<
      {
        id: string;
        revision: number;
        lifecycle: string;
        actor_id: string;
        reason: string;
        created_at: string;
      }[]
    >`
      select a.id::text, r.revision, coalesce(d.action,r.payload->>'lifecycle') as lifecycle, r.actor::text as actor_id,
        a.reason, r.created_at::text as created_at
      from ems.revisions r join ems.audit a on a.site=r.site and a.object_key=r.workspace
        and a.revision=r.revision and a.action='save'
      left join ems.audit d on d.site=r.site and d.object_key=r.workspace and d.revision=r.revision
        and d.action in ('Approved','Rejected')
      where r.workspace='engineering' and r.site=${data.site} order by r.revision desc limit 100`;
    return [...rows];
  });
