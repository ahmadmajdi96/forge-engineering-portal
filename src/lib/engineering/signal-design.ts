import { signalSchema, type EngineeringModel } from "./model";

export type Signal = EngineeringModel["signals"][number];
export function stationSignals(model: EngineeringModel, stationId: string, unassigned = false) {
  return model.signals.filter((signal) =>
    unassigned ? !signal.stationId : signal.stationId === stationId,
  );
}

export function putStationSignal(
  model: EngineeringModel,
  signal: Signal,
  previous?: string,
): EngineeringModel {
  const next = signalSchema.parse(signal);
  if (!model.stations.some((s) => s.id === next.stationId))
    throw Error("Choose an active station.");
  if (previous && (previous !== next.key || !model.signals.some((s) => s.key === previous)))
    throw Error("The original signal identity is unavailable.");
  if (!previous && model.signals.some((s) => s.key === next.key))
    throw Error("This signal key already exists.");
  if (
    next.equipmentId &&
    !model.records.some(
      (r) =>
        r.id === next.equipmentId &&
        r.parent === next.stationId &&
        !r.archived &&
        ["equipment", "terminal"].includes(r.kind),
    )
  )
    throw Error("Select equipment belonging to this station.");
  return {
    ...model,
    signals: previous
      ? model.signals.map((s) => (s.key === previous ? next : s))
      : [...model.signals, next],
  };
}

export function signalTransitionError(previous: EngineeringModel | null, next: EngineeringModel) {
  const prior = new Map(previous?.signals.map((s) => [s.key, s]));
  const existingCounts = new Map<string, number>();
  for (const signal of previous?.signals ?? [])
    existingCounts.set(signal.key, (existingCounts.get(signal.key) ?? 0) + 1);
  const counts = new Map<string, number>();
  const stations = new Set(next.stations.map((s) => s.id));
  const equipment = new Set(
    next.records
      .filter((r) => !r.archived && ["equipment", "terminal"].includes(r.kind))
      .map((r) => JSON.stringify([r.parent, r.id])),
  );
  for (const signal of next.signals) {
    const count = (counts.get(signal.key) ?? 0) + 1;
    counts.set(signal.key, count);
    if (count > 1 && count > (existingCounts.get(signal.key) ?? 0))
      return "Signal keys must be unique within a factory.";
    const old = prior.get(signal.key);
    if (
      signal.stationId &&
      !stations.has(signal.stationId) &&
      (old?.stationId !== signal.stationId ||
        previous?.stations.some((s) => s.id === signal.stationId))
    )
      return "A signal refers to an unavailable station.";
    if (
      signal.equipmentId &&
      !equipment.has(JSON.stringify([signal.stationId, signal.equipmentId])) &&
      (old?.equipmentId !== signal.equipmentId ||
        old?.stationId !== signal.stationId ||
        previous?.records.some(
          (r) => r.id === signal.equipmentId && r.parent === signal.stationId && !r.archived,
        ))
    )
      return "A signal refers to hardware outside its station.";
  }
  const referenced = new Set(
    [...next.steps, ...Object.values(next.appWorkflows ?? {}).flatMap((flow) => flow.steps)]
      .map((s) => s.signal)
      .filter(Boolean),
  );
  for (const r of next.records)
    if (
      !r.archived &&
      ["equipment", "terminal", "mapping", "command"].includes(r.kind) &&
      r.binding
    )
      referenced.add(r.binding);
  for (const key of prior.keys())
    if (!counts.has(key) && referenced.has(key))
      return "Reassign references before removing a signal mapping.";
  return undefined;
}
