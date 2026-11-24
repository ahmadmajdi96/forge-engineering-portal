import type { EngineeringModel } from "@/lib/engineering/model";
import type { SpatialDocument } from "./model";

export type LayoutTarget = {
  traceRoute?: string | undefined;
  traceStep?: string | undefined;
  space?: string | undefined;
  occurrence?: string | undefined;
  line?: string | undefined;
  station?: string | undefined;
  asset?: string | undefined;
  assetKind?: "terminal" | "equipment" | undefined;
};
export type EngineeringLink = {
  layoutId: string;
  kind: "line" | "station" | "asset";
  assetKind?: "terminal" | "equipment" | undefined;
  engineeringId: string;
  parentEngineeringId?: string | undefined;
};
export function engineeringLinks(
  document: Pick<SpatialDocument, "spaces" | "occurrences">,
): EngineeringLink[] {
  const spaces = new Map(document.spaces.map((space) => [space.id, space]));
  const links: EngineeringLink[] = [];
  for (const space of document.spaces) {
    if (space.engineeringId && (space.kind === "line" || space.kind === "station"))
      links.push({
        layoutId: space.id,
        kind: space.kind,
        engineeringId: space.engineeringId,
        parentEngineeringId:
          space.kind === "station" ? spaces.get(space.parentId ?? "")?.engineeringId : undefined,
      });
  }
  for (const occurrence of document.occurrences) {
    if (occurrence.asset?.system === "EMS")
      links.push({
        layoutId: occurrence.id,
        kind: "asset",
        engineeringId: occurrence.asset.id,
        assetKind: occurrence.asset.kind,
        parentEngineeringId: spaces.get(occurrence.stationId)?.engineeringId,
      });
  }
  return links;
}

export function changedEngineeringLinks(previous: SpatialDocument | null, next: SpatialDocument) {
  const prior = new Map(
    (previous ? engineeringLinks(previous) : []).map((link) => [
      link.kind + "/" + link.layoutId,
      link,
    ]),
  );
  return engineeringLinks(next).filter((link) => {
    const old = prior.get(link.kind + "/" + link.layoutId);
    return (
      !old ||
      old.engineeringId !== link.engineeringId ||
      old.assetKind !== link.assetKind ||
      old.parentEngineeringId !== link.parentEngineeringId
    );
  });
}

export function invalidEngineeringLinks(links: EngineeringLink[], model: EngineeringModel) {
  const lines = new Set(model.lines.filter((line) => !line.archived).map((line) => line.id));
  const stations = new Map(
    model.stations
      .filter((station) => lines.has(station.lineId))
      .map((station) => [station.id, station.lineId]),
  );
  const assets = new Map<string, typeof model.records>();
  for (const record of model.records) {
    if (
      record.archived ||
      !["terminal", "equipment"].includes(record.kind) ||
      !stations.has(record.parent)
    )
      continue;
    const sameId = assets.get(record.id) ?? [];
    sameId.push(record);
    assets.set(record.id, sameId);
  }
  return links.filter((link) => {
    if (link.kind === "line") return !lines.has(link.engineeringId);
    if (link.kind === "station")
      return (
        !link.parentEngineeringId || stations.get(link.engineeringId) !== link.parentEngineeringId
      );
    const matches = (assets.get(link.engineeringId) ?? []).filter(
      (record) =>
        record.parent === link.parentEngineeringId &&
        (!link.assetKind || record.kind === link.assetKind),
    );
    return matches.length !== 1;
  });
}

export function brokenByEngineeringEdit(
  links: EngineeringLink[],
  previous: EngineeringModel,
  next: EngineeringModel,
) {
  const previouslyInvalid = new Set(invalidEngineeringLinks(links, previous));
  return invalidEngineeringLinks(links, next).find((link) => !previouslyInvalid.has(link));
}

export function resolveLayoutTarget(document: SpatialDocument, target: LayoutTarget) {
  const space = target.space && document.spaces.find((item) => item.id === target.space);
  const line =
    target.line &&
    document.spaces.find((item) => item.kind === "line" && item.engineeringId === target.line);
  const station =
    target.station &&
    document.spaces.find(
      (item) =>
        item.kind === "station" &&
        item.engineeringId === target.station &&
        (!target.line || (line && item.parentId === line.id)),
    );
  const matches =
    target.occurrence || target.asset
      ? document.occurrences.filter((item) => {
          if (target.assetKind && item.asset?.kind && item.asset.kind !== target.assetKind)
            return false;
          if (target.occurrence && item.id !== target.occurrence) return false;
          if (target.asset && !(item.asset?.system === "EMS" && item.asset.id === target.asset))
            return false;
          if (target.station) return !!station && item.stationId === station.id;
          if (target.line)
            return (
              !!line &&
              document.spaces.some((s) => s.id === item.stationId && s.parentId === line.id)
            );
          return true;
        })
      : [];
  const occurrence = matches.length === 1 ? matches[0] : undefined;
  const requested =
    target.occurrence ?? target.asset ?? target.station ?? target.line ?? target.space;
  const exact =
    target.occurrence || target.asset
      ? occurrence
      : target.station
        ? station
        : target.line
          ? line
          : space;
  return {
    scope:
      occurrence?.stationId ??
      (station ? station.id : undefined) ??
      (line ? line.id : undefined) ??
      (space ? space.id : undefined),
    occurrence,
    missing: requested && !exact ? requested : undefined,
  };
}
