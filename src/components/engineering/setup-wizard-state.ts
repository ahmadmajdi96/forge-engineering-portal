/** URL-only, item-scoped setup. No records or progress are persisted here. */
export type SetupItemType = "space" | "occurrence";
export type SetupItem = { site: string; id: string; type: SetupItemType };
export type SetupSpace = {
  id: string;
  label: string;
  kind: string;
  parentId: string | null;
  engineeringId?: string | undefined;
  size?: { x: number; y: number; z: number } | null | undefined;
};
export type SetupOccurrence = {
  id: string;
  label: string;
  stationId: string;
  templateId?: string | undefined;
  templateRevision?: number | undefined;
  terminalId?: string | null | undefined;
  authoringAppId?: string | null | undefined;
  asset: { system: string; id: string; kind?: string | undefined } | null;
};
export type SetupDocument = {
  siteCode: string;
  spaces: readonly SetupSpace[];
  occurrences: readonly SetupOccurrence[];
  catalog?: readonly { id: string; revision: number; kind: string; label?: string }[];
};
export type SetupProcessDocument = {
  siteCode: string;
  routes: readonly {
    lineId?: string | undefined;
    steps: readonly {
      completionSignal?: string | undefined;
      consumers?: readonly { kind: string; mappingId?: string | undefined }[] | undefined;
    }[];
  }[];
};
export type SetupModel = {
  lines: readonly { id: string; name: string; archived?: boolean | undefined }[];
  stations: readonly { id: string; name: string; lineId?: string | undefined }[];
  records: readonly {
    id: string;
    kind: string;
    parent: string;
    archived?: boolean | undefined;
    hardware?: { category?: string | undefined } | undefined;
  }[];
  signals?: readonly {
    key?: string | undefined;
    stationId?: string | undefined;
    equipmentId?: string | undefined;
    access: string;
  }[];
};
export type SetupScope = SetupItem & {
  label: string;
  /** Physical or equipment kind, never a guessed engineering record type. */
  kind: string;
  line?: string | undefined;
  station?: string | undefined;
  asset?: string | undefined;
  assetKind?: string | undefined;
  terminalId?: string | undefined;
  app?: string | undefined;
  writable?: boolean | undefined;
  reason?: string | undefined;
  signalKeys?: readonly string[] | undefined;
  mappingIds?: readonly string[] | undefined;
  mappingReason?: string | undefined;
  hierarchy?: readonly { id: string; label: string; kind: string }[] | undefined;
  size?: { x: number; y: number; z: number } | null | undefined;
};
export type SetupStage = {
  path: string;
  name: string;
  need: "item" | "line" | "station" | "studio";
  action?: string;
  requiresEngineering?: boolean;
  params?: Record<string, string>;
};

export const setupKeys = ["setup", "setupSite", "setupItem", "setupType"] as const;

/** Optional destinations. The guided sequence is derived separately from the selected item. */
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
  {
    path: "/mes-integration",
    name: "MES resource mapping",
    need: "station",
    action: "ems.engineering.view",
  },
  { path: "/registry", name: "Assets & registry", need: "item", action: "ems.engineering.view" },
  {
    path: "/application-studio",
    name: "Assigned application in Studio",
    need: "studio",
    action: "ems.application_studio.view",
    requiresEngineering: true,
  },
  {
    path: "/edge-app-studio",
    name: "Edge App Studio",
    need: "item",
    action: "ems.application_studio.view",
    requiresEngineering: true,
  },
  {
    path: "/operator-apps",
    name: "Operator app workflows",
    need: "item",
    action: "ems.application_studio.view",
    requiresEngineering: true,
  },
  {
    path: "/procedure-designer",
    name: "Procedure designer",
    need: "item",
    action: "ems.application_studio.view",
    requiresEngineering: true,
  },
  {
    path: "/screen-editor",
    name: "Screen Editor",
    need: "item",
    action: "ems.application_studio.view",
    requiresEngineering: true,
  },
  {
    path: "/hmi-layouts",
    name: "HMI Designer",
    need: "item",
    action: "ems.application_studio.view",
    requiresEngineering: true,
  },
  {
    path: "/factory-releases",
    name: "Factory releases",
    need: "item",
    action: "ems.factory_releases.view",
  },
  {
    path: "/factory-assignment",
    name: "Factory assignments",
    need: "item",
    action: "ems.factory_assignments.view",
  },
  {
    path: "/release-readiness",
    name: "Readiness & validation",
    need: "item",
    action: "ems.engineering.view",
  },
  { path: "/diagnostics", action: "ems.engineering.view", name: "Diagnostics", need: "item" },
  {
    path: "/commissioning",
    action: "ems.engineering.view",
    name: "Commissioning evidence",
    need: "item",
  },
  { path: "/approvals", action: "ems.factory_releases.view", name: "Approval Chain", need: "item" },
  { path: "/changes", action: "ems.engineering.view", name: "Change Management", need: "item" },
  { path: "/deployments", action: "ems.factory_releases.view", name: "Deployments", need: "item" },
] as const satisfies readonly SetupStage[];

export function setupStageAtPath(path: string, stages: readonly SetupStage[] = setupStages) {
  if (/^\/lines\/[^/]+\/?$/.test(path))
    return stages.find((stage) => stage.path === "/line-engineering");
  if (/^\/stations\/[^/]+\/?$/.test(path))
    return stages.find((stage) => stage.path === "/workstations");
  const canonical =
    path === "/operator-app"
      ? "/operator-apps"
      : path === "/analytics"
        ? "/diagnostics"
        : path === "/reports"
          ? "/registry"
          : path;
  return stages.find((stage) => stage.path === canonical);
}
export function setupStageIndex(path: string) {
  const stage = setupStageAtPath(path);
  return stage ? setupStages.findIndex((candidate) => candidate.path === stage.path) : -1;
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
    "app",
    "terminal",
    "source",
    "entity",
    "profile",
    "kind",
    "view",
    "revision",
    "mapping",
    "layoutId",
    "layoutType",
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
  processes?: SetupProcessDocument | undefined,
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
  const template =
    occurrence &&
    document.catalog?.find(
      (entry) =>
        entry.id === occurrence.templateId &&
        (occurrence.templateRevision === undefined ||
          entry.revision === occurrence.templateRevision),
    );
  const physicalKind = occurrence
    ? asset?.kind === "terminal" || template?.kind === "terminal" || template?.kind === "hmi"
      ? "terminal"
      : (asset?.hardware?.category ?? template?.kind ?? asset?.kind ?? "occurrence")
    : node.kind;
  // A station match alone must never make unrelated hardware writable.
  const signals = (model.signals ?? []).filter(
    (signal) =>
      station &&
      signal.stationId === station.id &&
      (asset ? signal.equipmentId === asset.id : !occurrence),
  );
  const writable = signals.some((signal) => signal.access === "Command");
  const signalKeys = signals.flatMap((signal) => (signal.key ? [signal.key] : []));
  const mappingIds =
    processes?.siteCode === item.site && line && station
      ? [
          ...new Set(
            processes.routes
              .filter((route) => route.lineId === line.id)
              .flatMap((route) =>
                route.steps
                  .filter(
                    (step) => step.completionSignal && signalKeys.includes(step.completionSignal),
                  )
                  .flatMap((step) =>
                    (step.consumers ?? []).flatMap((consumer) =>
                      consumer.kind === "mes" &&
                      consumer.mappingId &&
                      model.records.some(
                        (record) =>
                          !record.archived &&
                          record.kind === "mapping" &&
                          record.id === consumer.mappingId &&
                          record.parent === station.id,
                      )
                        ? [consumer.mappingId]
                        : [],
                    ),
                  ),
              ),
          ),
        ]
      : [];
  const mappingReason = !processes
    ? "Saved process signal-to-MES relationships are unavailable or require process access. No unrelated mapping is selected."
    : !mappingIds.length
      ? "No verified MES mapping consumes this item's configured signal in its saved line process."
      : undefined;
  const terminalId = occurrence?.terminalId ?? undefined;
  const app = occurrence?.authoringAppId ?? undefined;
  const nonAssetSpace =
    !occurrence && ["organization", "site", "building", "floor", "area"].includes(node.kind);
  const reason = nonAssetSpace
    ? undefined
    : !line
      ? "Link the physical line to a saved engineering line in Properties. No unrelated line has been selected."
      : !station
        ? "Link this item's physical station to a saved station on its linked line in Properties."
        : occurrence && !asset
          ? "Link this occurrence to its saved equipment or terminal record in Properties. No other hardware record has been selected."
          : physicalKind === "terminal" && (!terminalId || !app)
            ? "Review this terminal's exact native target and application assignment. Studio resolves the kind from the real definition or relationship."
            : undefined;
  return {
    ...item,
    label: occurrence?.label ?? node.label,
    kind: physicalKind,
    line: line?.id,
    station: station?.id,
    asset: asset?.id,
    assetKind: asset?.kind,
    terminalId,
    app,
    writable,
    signalKeys,
    mappingIds,
    mappingReason,
    hierarchy: ancestors
      .slice()
      .reverse()
      .map((space) => ({ id: space.id, label: space.label, kind: space.kind })),
    size: node.size,
    reason,
  };
}

export function setupSearch(scope: SetupScope, path?: string) {
  const base: Record<string, string | undefined> = {
    site: scope.site,
    setup: "guided",
    setupSite: scope.site,
    setupItem: scope.id,
    setupType: scope.type,
    layoutId: scope.id,
    layoutType: scope.type,
    engLine: scope.line,
    engStation: scope.station,
    engAsset: scope.asset,
  };
  if (path === "/factory-layout")
    return {
      ...base,
      ...(scope.type === "space" ? { space: scope.id } : { occurrence: scope.id }),
    };
  if (path === "/application-studio" && scope.terminalId) {
    return {
      ...base,
      source: "terminalId",
      entity: scope.terminalId,
      terminal: scope.terminalId,
      app: scope.app,
      view: "preview",
    };
  }
  if (path === "/factory-assignment") return { ...base, terminal: scope.terminalId };
  if (path === "/station-connectivity")
    return { ...base, signal: scope.signalKeys?.length === 1 ? scope.signalKeys[0] : undefined };
  if (path === "/mes-integration")
    return { ...base, mapping: scope.mappingIds?.length === 1 ? scope.mappingIds[0] : undefined };
  return base;
}
export function setupLayoutSearch(scope: SetupScope) {
  return {
    ...setupSearch(scope),
    ...(scope.type === "space" ? { space: scope.id } : { occurrence: scope.id }),
  };
}

export function setupAuthorized(stage: SetupStage, actions: readonly string[]) {
  return (
    (!stage.action || actions.includes(stage.action)) &&
    (!stage.requiresEngineering || actions.includes("ems.engineering.view"))
  );
}
export function setupUnavailable(stage: SetupStage, scope: SetupScope, actions: readonly string[]) {
  if (!setupAuthorized(stage, actions)) return "Not authorized for this factory";
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
  if (stage.path === "/command-policy" && !scope.writable)
    return "No writable command signal is recorded for this item";
  if (stage.need === "studio" && (!scope.terminalId || scope.assetKind !== "terminal"))
    return "Link the exact native terminal first; Studio resolves its real assigned application kind";
  if (stage.path === "/factory-assignment" && scope.kind === "terminal" && !scope.terminalId)
    return "Link the exact enrolled terminal in Properties first";
  if (stage.path === "/mes-integration" && !scope.mappingIds?.length)
    return scope.mappingReason ?? "No verified signal-to-MES mapping for this item";
  if (stage.path === "/release-readiness") {
    if (scope.type === "occurrence" && !scope.asset)
      return "Link the selected hardware before item validation";
    if (scope.kind === "line" && !scope.line)
      return "Link the saved engineering line before validation";
    if (scope.kind === "station" && !scope.station)
      return "Link the saved engineering station before validation";
  }
  return undefined;
}

const stage = (path: string): SetupStage => {
  const found = setupStages.find((entry) => entry.path === path);
  if (!found) throw new Error(`Unknown setup destination: ${path}`);
  return found;
};

/** Relevant ordered work only; unrelated editors remain available in the optional catalog. */
export function setupJourney(scope: SetupStageScope): SetupStage[] {
  const layout = stage("/factory-layout");
  if (
    scope.type === "space" &&
    ["organization", "site", "building", "floor", "area"].includes(scope.kind)
  )
    return [layout];
  if (scope.kind === "line")
    return [
      layout,
      stage("/line-engineering"),
      stage("/stations"),
      stage("/factory-process"),
      stage("/release-readiness"),
    ];
  if (scope.kind === "station") {
    return [
      layout,
      stage("/workstations"),
      stage("/asset-steps"),
      stage("/station-connectivity"),
      ...(scope.writable ? [stage("/command-policy")] : []),
      stage("/release-readiness"),
    ];
  }
  if (scope.kind === "terminal") {
    return [
      layout,
      stage("/terminals"),
      stage("/factory-assignment"),
      {
        ...stage("/application-studio"),
        name: scope.app ? "Current authoring definition" : "Assigned application versions",
      },
      ...(scope.writable ? [stage("/command-policy")] : []),
      stage("/release-readiness"),
    ];
  }
  if (scope.type === "occurrence" && scope.kind !== "occurrence") {
    return [
      layout,
      stage("/machines"),
      stage("/station-connectivity"),
      ...(scope.writable ? [stage("/command-policy")] : []),
      stage("/mes-integration"),
      stage("/release-readiness"),
    ];
  }
  return [layout];
}
type SetupStageScope = SetupScope;
