import { z } from "zod";
import type { EngineeringModel } from "./model";

export const assetKinds = ["line", "station", "equipment", "terminal", "node", "buffer"] as const;
export type AssetKind = (typeof assetKinds)[number];
export const registryQuery = z.object({
  locate: z.string().max(250).optional(),
  q: z.string().max(160),
  line: z.string().max(160),
  kind: z.enum(["all", ...assetKinds]),
  state: z.enum(["active", "archived", "all"]),
  sort: z.enum(["name", "id", "kind"]),
  direction: z.enum(["asc", "desc"]),
  page: z.number().int().min(1).max(1000000),
  size: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
});
export type RegistryQuery = z.infer<typeof registryQuery>;
export type RegistryRow = {
  key: string;
  id: string;
  name: string;
  kind: AssetKind;
  line: string;
  parent: string;
  station: string;
  archived: boolean;
  version: string;
  identifiers: string[];
  uses: string[];
  category: string;
};
export function buildRegistry(model: EngineeringModel): RegistryRow[] {
  const lines = new Map(model.lines.map((line) => [line.id, line]));
  const stations = new Map(
    [...(model.archivedStations ?? []), ...model.stations].map((s) => [s.id, s]),
  );
  const references = new Map<string, string[]>(),
    identifiers = new Map<string, string[]>();
  for (const record of model.records) {
    if (record.archived) continue;
    for (const id of new Set(
      [record.parent, ...record.binding.split(",").map((v) => v.trim())].filter(Boolean),
    )) {
      if (record.kind === "operation") {
        const list = references.get(id) ?? [];
        list.push(record.id + " · " + record.name);
        references.set(id, list);
      }
    }
    if (record.kind === "mapping") {
      const list = identifiers.get(record.parent) ?? [];
      list.push(...[record.name, record.binding, record.value].filter(Boolean));
      identifiers.set(record.parent, list);
    }
  }
  const rows: RegistryRow[] = [];
  function add(
    kind: AssetKind,
    id: string,
    name: string,
    line: string,
    parent: string,
    station: string,
    archived: boolean,
    version = "",
    category = "",
    extra: string[] = [],
  ) {
    rows.push({
      key: kind + ":" + id,
      kind,
      id,
      name,
      line,
      parent,
      station,
      archived,
      version,
      category,
      identifiers: [...new Set([...extra, ...(identifiers.get(id) ?? [])].filter(Boolean))],
      uses: references.get(id) ?? [],
    });
  }
  for (const line of model.lines)
    add("line", line.id, line.name, line.id, line.plant, "", line.archived);
  const archivedIds = new Set((model.archivedStations ?? []).map((s) => s.id));
  for (const s of stations.values())
    add("station", s.id, s.name, s.lineId, s.lineId, s.id, archivedIds.has(s.id), "", s.mode);
  for (const r of model.records) {
    if (r.kind !== "equipment" && r.kind !== "terminal" && r.kind !== "node" && r.kind !== "buffer")
      continue;
    const station = stations.get(r.parent);
    add(
      r.kind,
      r.id,
      r.name,
      station?.lineId ?? (lines.has(r.parent) ? r.parent : ""),
      r.parent,
      station?.id ?? "",
      r.archived,
      r.version,
      r.hardware?.category,
      [
        r.kind === "equipment" ? r.value : "",
        r.hardware?.modelNumber ?? "",
        r.machine?.model ?? "",
        r.hardware?.manufacturer ?? "",
      ],
    );
  }
  return rows;
}
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export function pageRegistry(rows: RegistryRow[], query: RegistryQuery, site: string) {
  const words = query.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = rows
    .filter((row) => {
      if (
        (query.line && row.line !== query.line) ||
        (query.kind !== "all" && row.kind !== query.kind) ||
        (query.state !== "all" && row.archived !== (query.state === "archived"))
      )
        return false;
      const text = [
        site,
        row.id,
        row.name,
        row.kind,
        row.line,
        row.station,
        row.parent,
        row.category,
        ...row.identifiers,
        ...row.uses,
      ]
        .join(" ")
        .toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((left, right) => {
      const order =
        collator.compare(left[query.sort], right[query.sort]) ||
        collator.compare(left.key, right.key) ||
        (left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
      return query.direction === "desc" ? -order : order;
    });
  const total = matches.length,
    pages = Math.max(1, Math.ceil(total / query.size));
  const located = query.locate
    ? matches.findIndex((r) => r.key === query.locate || r.id === query.locate)
    : -1;
  const page = located >= 0 ? 1 + Math.floor(located / query.size) : Math.min(query.page, pages);
  return { rows: matches.slice((page - 1) * query.size, page * query.size), total, page, pages };
}
