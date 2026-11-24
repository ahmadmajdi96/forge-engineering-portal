import type { EngineeringModel } from "@/lib/engineering/model";
import type { ProcessRoute } from "@/lib/production/process";
import type { SpatialDocument } from "./model";

export type SignalPath = { from: string; to: string };

export function processTrace(
  route: ProcessRoute,
  stepId: string,
  sectionId: string,
  spatial: SpatialDocument,
  design?: EngineeringModel,
) {
  const steps = route.steps.filter(
    (step) => (!sectionId || step.sectionId === sectionId) && (!stepId || step.id === stepId),
  );
  const stations = new Set<string>();
  const findings = new Set<string>();
  const paths = new Map<string, SignalPath>();
  const spaces = new Map(spatial.spaces.map((space) => [space.id, space]));
  const placements = new Map<string, string[]>();
  for (const space of spatial.spaces) {
    if (space.kind !== "station" || !space.engineeringId) continue;
    const line = spaces.get(space.parentId ?? "")?.engineeringId;
    if (route.lineId && line !== route.lineId) continue;
    const ids = placements.get(space.engineeringId) ?? [];
    ids.push(space.id);
    placements.set(space.engineeringId, ids);
  }
  const signals = new Map(design?.signals.map((signal) => [signal.key, signal]));
  const equipment = new Map<string, string[]>(),
    terminals = new Map<string, string[]>();
  function index(map: Map<string, string[]>, station: string, id: string, occurrence: string) {
    const key = JSON.stringify([station, id]);
    const list = map.get(key) ?? [];
    list.push(occurrence);
    map.set(key, list);
  }
  for (const occurrence of spatial.occurrences) {
    if (occurrence.asset?.system === "EMS")
      index(equipment, occurrence.stationId, occurrence.asset.id, occurrence.id);
    if (occurrence.authoringAppId)
      index(terminals, occurrence.stationId, occurrence.authoringAppId, occurrence.id);
  }
  for (const step of steps) {
    const ids = new Set(step.stationIds);
    for (const id of step.engineeringStationIds ?? []) {
      const placed = placements.get(id) ?? [];
      for (const place of placed) ids.add(place);
      if (!placed.length) findings.add(step.name + " · No layout station for " + id);
    }
    for (const id of ids) stations.add(id);
    if (!step.completionSignal) continue;
    const source = signals.get(step.completionSignal);
    const sources = Array.from(ids)
      .filter((id) => source?.stationId && spaces.get(id)?.engineeringId === source.stationId)
      .flatMap((id) => equipment.get(JSON.stringify([id, source?.equipmentId])) ?? []);
    if (!sources.length) findings.add(step.name + " · Source equipment placement unresolved");
    for (const consumer of step.consumers ?? []) {
      if (consumer.kind !== "studio") continue;
      const sinks = Array.from(ids).flatMap(
        (id) => terminals.get(JSON.stringify([id, consumer.appId])) ?? [],
      );
      if (!sinks.length)
        findings.add(step.name + " · No placed terminal linked to " + consumer.appId);
      for (const from of sources) {
        if (paths.size >= 1000) {
          findings.add("First 1,000 configured paths shown. Select a step to narrow the trace.");
          break;
        }
        for (const to of sinks) {
          if (paths.size >= 1000) break;
          if (from !== to) paths.set(JSON.stringify([from, to]), { from, to });
        }
      }
    }
  }
  return { steps, stations, paths: [...paths.values()], findings: [...findings] };
}
