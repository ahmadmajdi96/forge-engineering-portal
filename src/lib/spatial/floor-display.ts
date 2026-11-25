import type { SpaceNode, SpatialDocument } from "./model";
import { templateKey } from "./model";
import { occurrenceBounds } from "./validation";

export type DisplayArea = SpaceNode & { estimated: boolean };
export type DisplayLevel = {
  node: SpaceNode;
  areas: DisplayArea[];
  offset: { x: number; y: number; z: number };
};

// Design boundaries take precedence. An equipment envelope is calculated for display only.
export function buildingLevels(doc: SpatialDocument, selected: SpaceNode): DisplayLevel[] {
  const floors = doc.spaces
    .filter((n) => n.kind === "floor" && n.parentId === selected.parentId && n.floor)
    .sort((a, b) => a.floor!.origin.y - b.floor!.origin.y);
  const spaces = new Map(doc.spaces.map((n) => [n.id, n])),
    catalog = new Map(doc.catalog.map((t) => [templateKey(t), t]));
  const envelopes = new Map<string, { minX: number; minZ: number; maxX: number; maxZ: number }>();
  for (const o of doc.occurrences) {
    const station = spaces.get(o.stationId),
      line = spaces.get(station?.parentId ?? ""),
      area = spaces.get(line?.parentId ?? "");
    const template = catalog.get(templateKey({ id: o.templateId, revision: o.templateRevision }));
    if (!area || area.kind !== "area" || area.boundary || !template) continue;
    const { min, max } = occurrenceBounds(o, template);
    const b = envelopes.get(area.id) ?? {
      minX: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxZ: -Infinity,
    };
    b.minX = Math.min(b.minX, min.x);
    b.minZ = Math.min(b.minZ, min.z);
    b.maxX = Math.max(b.maxX, max.x);
    b.maxZ = Math.max(b.maxZ, max.z);
    envelopes.set(area.id, b);
  }
  let previousTop = -Infinity;
  const levels = floors.map((node) => {
    const floor = node.floor!;
    const y = Math.max(floor.origin.y, previousTop);
    previousTop = y + Math.max(floor.size.y, Math.min(floor.size.x, floor.size.z) * 0.18);
    const areas = doc.spaces
      .filter((n) => n.kind === "area" && n.parentId === node.id)
      .map((area) => {
        const b = envelopes.get(area.id);
        if (!b || area.boundary) return { ...area, estimated: false };
        const x = Math.max(0, b.minX),
          z = Math.max(0, b.minZ),
          width = Math.min(floor.size.x, b.maxX) - x,
          depth = Math.min(floor.size.z, b.maxZ) - z;
        return width > 0 && depth > 0
          ? { ...area, estimated: true, boundary: { x, z, width, depth } }
          : { ...area, estimated: false };
      });
    return { node, areas, offset: { x: floor.origin.x, y, z: floor.origin.z } };
  });
  const anchor = levels.find((l) => l.node.id === selected.id)?.offset;
  if (!anchor) return [];
  return levels.map((l) => ({
    ...l,
    offset: { x: l.offset.x - anchor.x, y: l.offset.y - anchor.y, z: l.offset.z - anchor.z },
  }));
}
