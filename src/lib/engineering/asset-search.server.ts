import { database, EmsError } from "../production/db.server";
import { requirePermission } from "../production/auth.server";
import { buildRegistry, pageRegistry, type RegistryQuery, type RegistryRow } from "./asset-search";
import { modelSchema } from "./model";

// Only keep public registry columns from a few immutable snapshots. Every call rechecks AMS.
const snapshots = new Map<string, RegistryRow[]>();
const maximumCachedSnapshots = 3;
export async function searchRevision(
  request: Request,
  data: RegistryQuery & { site: string; revision: number },
) {
  await requirePermission(request, data.site, "ems.engineering.view");
  const key = data.site + ":" + data.revision;
  let rows = snapshots.get(key);
  if (!rows) {
    const [result] = await database()<{ model: unknown }[]>`
      select payload->'model' as model from ems.revisions
      where site=${data.site} and workspace='engineering' and revision=${data.revision}`;
    if (!result) throw new EmsError(404, "This factory revision could not be found.");
    rows = buildRegistry(modelSchema.parse(result.model));
  }
  snapshots.delete(key);
  snapshots.set(key, rows);
  if (snapshots.size > maximumCachedSnapshots) {
    const oldest = snapshots.keys().next().value;
    if (oldest) snapshots.delete(oldest);
  }
  return pageRegistry(rows, data, data.site);
}
