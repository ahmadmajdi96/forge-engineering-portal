/** URL-only, item-scoped setup. No records or progress are persisted here. */
export type SetupItemType = "space" | "occurrence";
export type SetupItem = { site: string; id: string; type: SetupItemType };
export type SetupSpace = {
  id: string;
  label: string;
  kind: string;
  parentId: string | null;
  engineeringId?: string | undefined;
};
export type SetupOccurrence = {
  id: string;
  label: string;
  stationId: string;
  asset: { system: string; id: string; kind?: string | undefined } | null;
};
export type SetupDocument = {
  siteCode: string;
  spaces: readonly SetupSpace[];
  occurrences: readonly SetupOccurrence[];
};
export type SetupModel = {
  lines: readonly { id: string; name: string; archived?: boolean | undefined }[];
  stations: readonly { id: string; name: string; lineId?: string | undefined }[];
  records: readonly { id: string; kind: string; parent: string; archived?: boolean | undefined }[];
};
export type SetupScope = SetupItem & {
  label: string;
  kind: string;
  line?: string | undefined;
  station?: string | undefined;
  asset?: string | undefined;
  assetKind?: string | undefined;
  reason?: string | undefined;
};
export const setupKeys = ["setup", "setupSite", "setupItem", "setupType"] as const;
export const setupStages = [
  {
    path: "/factory-layout",
    name: "Physical layout",
    need: "item",
    action: "ems.factory_layout.view",
  },
  { path: "/lines", name: "Production lines", need: "item", action: "ems.engineering.view" },
  { path: "/line-engineering", name: "Line design", need: "line", action: "ems.engineering.view" },
  {
    path: "/factory-process",
    name: "Sections & routes",
    need: "line",
    action: "ems.factory_process.view",
  },
  { path: "/process-routes", name: "Process design", need: "line", action: "ems.engineering.view" },
  { path: "/asset-steps", name: "Production steps", need: "line", action: "ems.engineering.view" },
  { path: "/step-templates", name: "Step templates", need: "item", action: "ems.engineering.view" },
  { path: "/stations", name: "Stations", need: "line", action: "ems.engineering.view" },
  {
    path: "/workstations",
    name: "Station composition",
    need: "station",
    action: "ems.engineering.view",
  },
  {
    path: "/machines",
    name: "Machines & equipment",
    need: "station",
    action: "ems.engineering.view",
  },
  {
    path: "/terminals",
    name: "Terminals & peripherals",
    need: "station",
    action: "ems.engineering.view",
  },
  {
    path: "/station-connectivity",
    name: "Signals & connectivity",
    need: "station",
    action: "ems.engineering.view",
  },
  {
    path: "/command-policy",
    name: "Command policy",
    need: "station",
    action: "ems.engineering.view",
  },
  { path: "/registry", name: "Asset registry", need: "item", action: "ems.engineering.view" },
] as const;
export function setupStageIndex(path: string) {
  if (/^\/lines\/[^/]+\/?$/.test(path)) return 1;
  if (/^\/stations\/[^/]+\/?$/.test(path)) return 7;
  return setupStages.findIndex((stage) => stage.path === path);
}
export const isSetupRoute = (path: string) => setupStageIndex(path) >= 0;
export function readSetup(search: Record<string, unknown>): SetupItem | undefined {
  const site = search["setupSite"],
    id = search["setupItem"],
    type = search["setupType"];
  if (
    search["setup"] !== "guided" ||
    typeof site !== "string" ||
    typeof id !== "string" ||
    !site ||
    !id ||
    site.length > 128 ||
    id.length > 180 ||
    (type !== "space" && type !== "occurrence")
  )
    return undefined;
  return { site, id, type };
}
export function stripSetup(search: Record<string, unknown>) {
  const copy = { ...search };
  // Explicit undefined prevents TanStack's retained-search middleware resurrecting a dismissal.
  for (const key of setupKeys) copy[key] = undefined;
  return copy;
}
export function clearSetupScope(search: Record<string, unknown>) {
  const copy = stripSetup(search);
  for (const key of [
    "engLine",
    "engStation",
    "engAsset",
    "line",
    "station",
    "asset",
    "assetKind",
    "space",
    "occurrence",
    "routeId",
    "stepId",
    "step",
    "signal",
    "traceRoute",
    "traceStep",
    "registryLine",
  ])
    copy[key] = undefined;
  return copy;
}
export function setupPickSearch(site: string | undefined) {
  return { ...clearSetupScope({ site }), setup: "pick" };
}
export function resolveSetupItem(
  item: SetupItem,
  document: SetupDocument,
  model: SetupModel,
): SetupScope | undefined {
  if (document.siteCode !== item.site) return undefined;
  const occurrence =
    item.type === "occurrence"
      ? document.occurrences.find((record) => record.id === item.id)
      : undefined;
  const node = document.spaces.find(
    (space) => space.id === (occurrence?.stationId ?? (item.type === "space" ? item.id : "")),
  );
  if (!node || (item.type === "occurrence" && !occurrence)) return undefined;
  const nodes = new Map(document.spaces.map((space) => [space.id, space]));
  const ancestors: SetupSpace[] = [];
  let current: SetupSpace | undefined = node;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) return undefined;
    visited.add(current.id);
    ancestors.push(current);
    if (current.parentId && !nodes.has(current.parentId)) return undefined;
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  if (!ancestors.some((space) => space.kind === "site")) return undefined;
  const physicalLine = ancestors.find((space) => space.kind === "line");
  const physicalStation = ancestors.find((space) => space.kind === "station");
  const line = model.lines.find(
    (record) => !record.archived && record.id === physicalLine?.engineeringId,
  );
  const station = line
    ? model.stations.find(
        (record) => record.id === physicalStation?.engineeringId && record.lineId === line.id,
      )
    : undefined;
  const linked = occurrence?.asset?.system === "EMS" ? occurrence.asset : undefined;
  const assets =
    station && linked
      ? model.records.filter(
          (record) =>
            !record.archived &&
            record.id === linked.id &&
            record.parent === station.id &&
            ["terminal", "equipment"].includes(record.kind) &&
            (!linked.kind || record.kind === linked.kind),
        )
      : [];
  const asset = assets.length === 1 ? assets[0] : undefined;
  return {
    ...item,
    label: occurrence?.label ?? node.label,
    kind: occurrence ? "occurrence" : node.kind,
    line: line?.id,
    station: station?.id,
    asset: asset?.id,
    assetKind: asset?.kind,
    reason: !line
      ? "Link the physical line to a saved engineering line in Properties. Non-asset spaces can use layout, line lists, templates and registry without a line link."
      : !station
        ? "Link this item's physical station to a saved station on its linked line in Properties."
        : occurrence && !asset
          ? "Link this occurrence to a saved equipment or terminal record in Properties. Station stages are available; no hardware record is selected."
          : undefined,
  };
}
export function setupSearch(scope: SetupScope) {
  return {
    site: scope.site,
    setup: "guided",
    setupSite: scope.site,
    setupItem: scope.id,
    setupType: scope.type,
    engLine: scope.line,
    engStation: scope.station,
    engAsset: scope.asset,
  };
}
export function setupLayoutSearch(scope: SetupScope) {
  // Exact physical ID takes precedence over all engineering lookup aliases.
  return {
    ...setupSearch(scope),
    ...(scope.type === "space" ? { space: scope.id } : { occurrence: scope.id }),
  };
}
export function setupUnavailable(
  stage: (typeof setupStages)[number],
  scope: SetupScope,
  actions: readonly string[],
) {
  if (!actions.includes(stage.action)) return "Not authorized for this factory";
  if (stage.need === "line" && !scope.line) return "Link a saved engineering line first";
  if (stage.need === "station" && !scope.station) return "Link a saved engineering station first";
  if (
    ["/machines", "/terminals"].includes(stage.path) &&
    scope.type === "occurrence" &&
    !scope.asset
  )
    return "Link this occurrence to a saved hardware record first";
  if (stage.path === "/machines" && scope.assetKind === "terminal")
    return "The selected occurrence is a terminal, not equipment";
  if (stage.path === "/terminals" && scope.assetKind === "equipment")
    return "The selected occurrence is equipment, not a terminal";
  return undefined;
}
