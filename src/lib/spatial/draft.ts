import {
  add,
  subtract,
  templateKey,
  type Occurrence,
  type SpatialDocument,
  type Vector,
} from "./model";

const distinctDocuments = 32;
export type DraftState = {
  current: SpatialDocument;
  before: SpatialDocument[];
  after: SpatialDocument[];
};
export type DraftEdit = (previous: SpatialDocument) => SpatialDocument;

export function startDraft(current: SpatialDocument): DraftState {
  return { current, before: [], after: [] };
}

export type DraftAction =
  | { type: "edit"; apply: DraftEdit }
  | { type: "reset"; document: SpatialDocument }
  | { type: "undo" }
  | { type: "redo" };

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "edit": {
      const next = action.apply(state.current);
      return next === state.current
        ? state
        : {
            current: next,
            before: [...state.before.slice(-distinctDocuments + 1), state.current],
            after: [],
          };
    }
    case "reset":
      return startDraft(action.document);
    case "undo": {
      const current = state.before.at(-1);
      return current
        ? { current, before: state.before.slice(0, -1), after: [state.current, ...state.after] }
        : state;
    }
    case "redo": {
      const [current, ...after] = state.after;
      return current ? { current, before: [...state.before, state.current], after } : state;
    }
  }
}

export function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = Object.entries(left),
    b = Object.entries(right),
    rb = right as Record<string, unknown>;
  return (
    a.length === b.length &&
    a.every(([key, item]) => Object.hasOwn(rb, key) && sameValue(item, rb[key]))
  );
}

export function mergeSpatialDocuments(
  base: SpatialDocument,
  draft: SpatialDocument,
  head: SpatialDocument,
) {
  const conflicts: string[] = [];
  const merge = <RecordType>(
    type: string,
    previous: RecordType[],
    local: RecordType[],
    latest: RecordType[],
    key: (record: RecordType) => string,
  ) => {
    const index = (records: RecordType[]) => new Map(records.map((item) => [key(item), item]));
    const before = index(previous),
      ours = index(local),
      theirs = index(latest);
    const keys = new Set([...theirs.keys(), ...ours.keys(), ...before.keys()]);
    const result: RecordType[] = [];
    for (const id of keys) {
      const original = before.get(id),
        mine = ours.get(id),
        remote = theirs.get(id);
      const changedLocally = !sameValue(original, mine);
      if (changedLocally && !sameValue(original, remote) && !sameValue(mine, remote))
        conflicts.push(`${type} ${id}`);
      const choice = changedLocally ? mine : remote;
      if (choice) result.push(choice);
    }
    return result;
  };
  const byId = (record: { id: string }) => record.id;
  const merged: SpatialDocument = {
    ...head,
    spaces: merge("Space", base.spaces, draft.spaces, head.spaces, byId),
    occurrences: merge("Occurrence", base.occurrences, draft.occurrences, head.occurrences, byId),
    catalog: merge("Template", base.catalog, draft.catalog, head.catalog, templateKey),
    connections: merge("Connection", base.connections, draft.connections, head.connections, byId),
    artifacts: merge("Artifact", base.artifacts, draft.artifacts, head.artifacts, byId),
    cameras: merge("Camera", base.cameras, draft.cameras, head.cameras, byId),
  };
  return { conflicts, merged };
}

export function changeSelection(
  records: Occurrence[],
  selection: string[],
  changes: (chosen: Occurrence[]) => Occurrence[],
) {
  const ids = new Set(selection);
  const editable = records.filter((record) => ids.has(record.id) && !record.locked);
  const replacements = new Map(changes(editable).map((record) => [record.id, record]));
  return records.map((record) => replacements.get(record.id) ?? record);
}

export function positionSelection(
  records: Occurrence[],
  selection: string[],
  axis: keyof Vector,
  action: "align" | "distribute",
) {
  return changeSelection(records, selection, (chosen) => {
    const sorted = [...chosen].sort((a, b) => a.position[axis] - b.position[axis]);
    const first = sorted[0],
      last = sorted.at(-1);
    if (!first || !last || chosen.length < (action === "align" ? 2 : 3)) return [];
    const start = first.position[axis];
    const spacing = action === "align" ? 0 : (last.position[axis] - start) / (chosen.length - 1);
    return sorted.map((record, index) => ({
      ...record,
      position: { ...record.position, [axis]: Number((start + index * spacing).toFixed(6)) },
    }));
  });
}

export function moveSelection(
  records: Occurrence[],
  selection: string[],
  anchor: Occurrence,
  to: Vector,
) {
  const shifted = new Set(selection);
  if (anchor.group)
    for (const record of records) if (record.group === anchor.group) shifted.add(record.id);
  shifted.add(anchor.id);
  const delta = subtract(to, anchor.position);
  return changeSelection(records, [...shifted], (chosen) =>
    chosen.map((record) => ({
      ...record,
      position: add(record.position, delta),
    })),
  );
}
