import type { EngineeringModel } from "@/lib/engineering/model";
import type { SpatialDocument } from "@/lib/spatial/model";
import type { ProcessDocument } from "./process";

export function processLinkProblems(
  document: ProcessDocument,
  design: EngineeringModel | null,
  spaces: SpatialDocument["spaces"],
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
