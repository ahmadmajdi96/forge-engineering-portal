import { archiveDesignRecord, upsertDesignRecord, type DesignRecord } from "./design-records";
import type { EngineeringModel } from "./model";

export function placedHardware(record: DesignRecord) {
  return record.kind === "equipment" || record.kind === "terminal";
}

export function updateHardware(model: EngineeringModel, record: DesignRecord) {
  const previous = model.records.find((r) => r.kind === record.kind && r.id === record.id);
  if (previous?.archived) throw Error("This hardware is archived.");
  if (
    record.parent &&
    previous?.parent !== record.parent &&
    !model.stations.some((s) => s.id === record.parent)
  )
    throw Error("Choose an existing station in this factory.");
  if (
    previous &&
    (record.parent !== previous.parent || record.archived) &&
    (model.signals.some((s) => s.equipmentId === record.id) ||
      (record.parent !== previous.parent && record.binding.trim()))
  )
    throw Error("Clear the signal binding before moving this hardware.");
  if (
    record.value.trim() &&
    record.kind === "equipment" &&
    previous?.value !== record.value &&
    model.records.some(
      (r) =>
        r.kind === "equipment" &&
        r.id !== record.id &&
        !r.archived &&
        r.value.trim() === record.value.trim(),
    )
  )
    throw Error("The serial identifier already belongs to another equipment record.");
  const records = upsertDesignRecord(model.records, record);
  if (previous?.parent === record.parent && previous.archived === record.archived)
    return { ...model, records };
  const stations = model.stations.map((station) => {
    const equipment = station.equipment.filter((id) => id !== record.id);
    // Historical identities can overlap across hardware types.
    const assigned = records.some(
      (r) => placedHardware(r) && !r.archived && r.id === record.id && r.parent === station.id,
    );
    if (assigned) equipment.push(record.id);
    return { ...station, equipment };
  });
  return { ...model, records, stations };
}

export function archiveHardware(model: EngineeringModel, record: DesignRecord) {
  const records = archiveDesignRecord(model.records, record.id, record.kind);
  if (!placedHardware(record)) return { ...model, records };
  return updateHardware(model, { ...record, archived: true });
}

/** Compare with the locked head so unaffected legacy identities remain editable. */
export function hardwareTransitionError(
  previous: EngineeringModel | null,
  next: EngineeringModel,
): string | undefined {
  function conflicts(model: EngineeringModel | null) {
    const counts = new Map<string, number>();
    if (!model) return counts;
    const count = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const line of model.lines) count("line identifier " + line.id);
    for (const station of [...model.stations, ...(model.archivedStations ?? [])])
      count("station identifier " + station.id);
    const owners = new Map<string, Set<string>>();
    const own = (id: string, parent: string) => {
      if (!parent) return;
      const set = owners.get(id) ?? new Set<string>();
      set.add(parent);
      owners.set(id, set);
    };
    for (const station of model.stations) for (const id of station.equipment) own(id, station.id);
    for (const r of model.records) {
      count(r.kind + " identifier " + r.id);
      if (r.archived || !placedHardware(r)) continue;
      if (r.kind === "equipment" && r.value.trim()) count("equipment serial " + r.value.trim());
      own(r.id, r.parent);
    }
    for (const [id, set] of owners) counts.set("physical owner of " + id, set.size);
    return counts;
  }
  const existing = conflicts(previous);
  for (const [key, count] of conflicts(next)) {
    if (count > 1 && count > (existing.get(key) ?? 0))
      return "Duplicate " + key + ". Review exclusive identities and assignments.";
  }
  const stations = new Set(next.stations.map((s) => s.id));
  const archivedStations = new Set((next.archivedStations ?? []).map((s) => s.id));
  const lines = new Map(next.lines.map((l) => [l.id, l]));
  const beforeLines = new Map(previous?.lines.map((l) => [l.id, l]));
  const archivedLines = next.lines.filter((l) => l.archived && !beforeLines.get(l.id)?.archived);
  for (const line of archivedLines) {
    if (
      next.stations.some((s) => s.lineId === line.id) ||
      next.records.some((r) => !r.archived && r.parent === line.id)
    )
      return "Reassign active dependencies before archiving line " + line.id + ".";
  }
  for (const old of previous?.lines ?? [])
    if (!lines.has(old.id)) return "Archive lines to preserve their identity.";
  for (const old of previous?.archivedStations ?? [])
    if (!archivedStations.has(old.id)) return "Archived station identities must be retained.";
  const previousStationLines = new Map(previous?.stations.map((s) => [s.id, s.lineId]));
  for (const station of next.stations) {
    if (
      previousStationLines.get(station.id) !== station.lineId &&
      (!lines.has(station.lineId) || lines.get(station.lineId)?.archived)
    )
      return "Choose an active line for station " + station.id + ".";
  }
  for (const old of previous?.stations ?? []) {
    if (stations.has(old.id)) continue;
    const archived = next.archivedStations?.find((s) => s.id === old.id);
    if (!archived) return "Archive stations to preserve their identity.";
    const refs = next.records.some(
      (r) =>
        !r.archived &&
        (r.parent === old.id || r.binding.split(",").some((v) => v.trim() === old.id)),
    );
    if (
      archived.equipment.length ||
      archived.app ||
      archived.operation ||
      refs ||
      next.signals.some((s) => s.stationId === old.id)
    )
      return "Reassign active dependencies before archiving station " + old.id + ".";
  }
  const key = (r: DesignRecord) => r.kind + ":" + r.id;
  const records = new Map(next.records.map((r) => [key(r), r]));
  const before = new Map(previous?.records.map((r) => [key(r), r]));
  for (const old of before.values())
    if (placedHardware(old) && !records.has(key(old)))
      return "Archive physical records to preserve their identity.";
  for (const r of records.values()) {
    if (!placedHardware(r)) continue;
    const old = before.get(key(r));
    if (old?.archived && !r.archived) return "Archived hardware identities cannot be reused.";
    if (old && r.archived === old.archived && r.parent === old.parent) continue;
    if (!r.archived && r.parent && !stations.has(r.parent))
      return "Choose an active station for " + r.id + ".";
    if (old && !old.archived && (r.archived || r.parent !== old.parent)) {
      if (next.signals.some((s) => s.equipmentId === r.id) || (r.binding.trim() && !r.archived))
        return "Rebind equipment signals before moving or archiving " + r.id + ".";
      if (
        r.archived &&
        next.records.some(
          (child) =>
            !child.archived &&
            (child.parent === r.id || child.binding.split(",").some((v) => v.trim() === r.id)),
        )
      )
        return "Reassign active references before archiving " + r.id + ".";
    }
  }
  return undefined;
}
