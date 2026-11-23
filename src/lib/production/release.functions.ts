import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { reasonSchema, revisionNumber, siteScope } from "./contracts";

export const getFactoryReleases = createServerFn({ method: "POST" })
  .inputValidator((data) => siteScope.parse(data))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { listReleases } = await import("./releases.server");
    return listReleases(getRequest(), data.site);
  });

export const submitFactoryRelease = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    siteScope
      .extend({ app: z.string().min(1).max(96), revision: revisionNumber, reason: reasonSchema })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { submitRelease } = await import("./releases.server");
    return submitRelease(getRequest(), data);
  });

export const updateFactoryRelease = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    siteScope
      .extend({
        id: z.string().uuid(),
        action: z.enum(["approve", "publish"]),
        expected: z.enum(["submitted", "approved"]),
        reason: reasonSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { transitionRelease } = await import("./releases.server");
    return transitionRelease(getRequest(), data);
  });

export const deliveryHistory = createServerFn({method:"POST"})
  .inputValidator(input => siteScope.parse(input))
  .handler(async ({data}) => {
    const {getRequest}=await import("@tanstack/react-start/server");
    const {requirePermission}=await import("./auth.server");
    const {database}=await import("./db.server");
    await requirePermission(getRequest(),data.site,"ems.factory_releases.view");
    const rows=await database()<{event_id:string; consumer:string;release_id:string;send_state:string;business_state:string;attempts:number}[]>`
      select event_id,consumer,release_id,send_state,business_state,attempts from ems.outbox
      where site=${data.site} order by created_at desc,event_id limit 100`;
    return [...rows];
  });
