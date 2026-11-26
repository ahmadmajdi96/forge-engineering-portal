import type { EngineeringModel } from "@/lib/engineering/model";
import type { StudioWorkspace } from "@/lib/studio/model";
import type { SpatialDocument } from "@/lib/spatial/model";
import type { ProcessDocument } from "./process";

export function processLinkProblems(
  document: ProcessDocument,
  design: EngineeringModel | null,
  spaces: SpatialDocument["spaces"],
  studio?: StudioWorkspace | null,
) {
  const findings = new Map<string, string>();
  const stations = new Map((design?.stations ?? []).map((s) => [s.id, s]));
  const operations = new Map(
    (design?.records ?? [])
      .filter((r) => !r.archived && r.kind === "operation")
      .map((r) => [r.id, r]),
  );
  const lines = new Set((design?.lines ?? []).filter((l) => !l.archived).map((l) => l.id));
  const locations = new Map(spaces.map((s) => [s.id, s]));
  for (const route of document.routes) {
    const context = [route.id, route.lineId ?? ""];
    if (route.lineId && !lines.has(route.lineId))
      findings.set(
        JSON.stringify([...context, "line"]),
        `Process ${route.name} refers to an unavailable production line.`,
      );
    for (const step of route.steps) {
      const assigned = new Set(step.engineeringStationIds ?? []);
      for (const id of assigned) {
        const station = stations.get(id);
        if (!station || (route.lineId && station.lineId !== route.lineId))
          findings.set(
            JSON.stringify([...context, step.id, "engineeringStation", id]),
            `Step ${step.name} uses an unavailable engineering station on this line.`,
          );
        if (step.stationIds.some((space) => locations.get(space)?.engineeringId === id))
          findings.set(
            JSON.stringify([...context, step.id, "duplicate", id]),
            `Step ${step.name} assigns the same station twice.`,
          );
      }
      if (step.completionSignal) {
        const signal = design?.signals.find((s) => s.key === step.completionSignal);
        const ids = [...assigned, ...step.stationIds.map((id) => locations.get(id)?.engineeringId)];
        if (!signal?.stationId || !ids.includes(signal.stationId) || signal.access !== "Read")
          findings.set(
            JSON.stringify([...context, step.id, "completion", step.completionSignal]),
            `Step ${step.name} requires a read signal owned by an assigned station.`,
          );
      }
      for (const consumer of step.consumers ?? []) {
        const source = design?.signals.find((s) => s.key === step.completionSignal);
        const key = JSON.stringify([
          ...context,
          step.id,
          "consumer",
          consumer,
          step.completionSignal,
        ]);
        if (consumer.kind === "mes") {
          const mapping = design?.records.find(
            (r) => r.kind === "mapping" && r.id === consumer.mappingId && !r.archived,
          );
          if (!mapping?.binding || !source?.stationId || mapping.parent !== source.stationId)
            findings.set(key, `Step ${step.name} requires a MES mapping for its source station.`);
        } else {
          const app = studio?.applications.find((a) => a.id === consumer.appId);
          const signal = app?.signals.find((s) => s.id === consumer.signalId);
          const type =
            source?.type === "Boolean" ? "boolean" : source?.type === "Enum" ? "text" : "number";
          if (!source || !signal || signal.type !== type || signal.unit !== source.unit)
            findings.set(
              key,
              `Step ${step.name} requires a compatible Studio signal with matching type and unit.`,
            );
        }
      }
      if (step.operationId) {
        const operation = operations.get(step.operationId);
        if (
          !operation ||
          (route.lineId &&
            operation.parent !== route.lineId &&
            stations.get(operation.parent)?.lineId !== route.lineId)
        )
          findings.set(
            JSON.stringify([...context, step.id, "operation", step.operationId]),
            `Step ${step.name} refers to an unavailable manufacturing operation on this line.`,
          );
      }
      if (route.lineId)
        for (const id of step.stationIds) {
          const space = locations.get(id);
          if (
            space?.kind !== "station" ||
            locations.get(space.parentId ?? "")?.engineeringId !== route.lineId
          )
            findings.set(
              JSON.stringify([...context, step.id, "station", id]),
              `Step ${step.name} uses a station outside the selected line layout.`,
            );
        }
    }
  }
  return findings;
}

// A draft can be incomplete. Apply handoff requirements when checking readiness or submitting a release.
export function stationHandoffIssues(
  route: ProcessDocument["routes"][number],
  design: EngineeringModel,
) {
  const issues: string[] = [];
  for (const step of route.steps) {
    if (step.outcome !== "operation" || !step.engineeringStationIds?.length) continue;
    const assigned = design.stations.filter((s) => step.engineeringStationIds!.includes(s.id));
    if (assigned.some((s) => s.mode !== "automatic") && !step.operatorRole?.trim())
      issues.push(step.name + " needs a responsible operator role.");
    if (
      assigned.some((s) => s.mode === "semi_auto") &&
      (!step.handoff?.trim() || !step.completionSignal)
    )
      issues.push(step.name + " needs a human-to-machine handoff and completion signal.");
    if (
      assigned.some((s) => s.mode === "automatic") &&
      !step.completionSignal &&
      !step.evidence.length
    )
      issues.push(step.name + " needs machine completion evidence.");
  }
  return issues;
}
