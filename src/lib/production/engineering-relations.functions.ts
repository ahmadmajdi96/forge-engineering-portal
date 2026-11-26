import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { siteScope } from "./contracts";
export const entityField = z.enum(["stationId", "machineId", "terminalId", "stepId"]);
export const relationScope = siteScope.extend({
  field: entityField,
  id: z.string().trim().min(1).max(180),
  after: z.string().uuid().optional(),
});
export const getEngineeringAssignments = createServerFn({ method: "GET" })
  .inputValidator((value) => relationScope.parse(value))
  .handler(async ({ data }) => {
    const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("cache-control", "private, no-store");
    const { engineeringAssignments } = await import("./assignment.server");
    return engineeringAssignments(getRequest(), data);
  });
export const getFactoryStructure = createServerFn({ method: "GET" })
  .inputValidator((value) => siteScope.parse(value))
  .handler(async ({ data }) => {
    const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("cache-control", "private, no-store");
    const { requirePermission } = await import("./auth.server");
    const { database } = await import("./db.server");
    await requirePermission(getRequest(), data.site, "ems.factory_layout.view");
    const [row] = await database()<
      {
        revision: number;
        spaces: {
          id: string;
          kind: string;
          label: string;
          parentId: string | null;
          engineeringId: string | null;
        }[];
        placements: number;
      }[]
    >`
      select r.revision, (select coalesce(jsonb_agg(jsonb_build_object('id',s->>'id','label',s->>'label','kind',s->>'kind','parentId',s->>'parentId','engineeringId',s->>'engineeringId') order by ord),'[]'::jsonb)
      from jsonb_array_elements(r.payload->'spaces') with ordinality as item(s,ord)) as spaces,
      jsonb_array_length(r.payload->'occurrences') as placements from ems.workspaces w
      join ems.revisions r on r.site=w.site and r.workspace=w.key and r.revision=w.head
      where w.site=${data.site} and w.key='spatial'`;
    return row ?? { revision: 0, spaces: [], placements: 0 };
  });
