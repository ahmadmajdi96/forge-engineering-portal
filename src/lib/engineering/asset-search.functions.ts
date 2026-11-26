import { createServerFn } from "@tanstack/react-start";
import { siteKey, revisionNumber } from "../production/contracts";
import { registryQuery } from "./asset-search";

export const searchSavedAssets = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    registryQuery.extend({ site: siteKey, revision: revisionNumber }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { searchRevision } = await import("./asset-search.server");
    return searchRevision(getRequest(), data);
  });
