import { describe, it, expect } from "vitest";
import example from "../../../docs/factory-engineering/packaging-training.json";
import { spatialDocumentSchema } from "./model";
import { buildingLevels } from "./floor-display";

describe("floor and section presentation", () => {
  it("uses an equipment extent until an engineer saves a boundary, without modifying source data", () => {
    const doc = spatialDocumentSchema.parse(example.spatial),
      floor = doc.spaces.find((n) => n.kind === "floor")!,
      area = doc.spaces.find((n) => n.kind === "area")!;
    let display = buildingLevels(doc, floor)[0]!.areas[0]!;
    expect(display.estimated).toBe(true);
    expect(display.boundary!.width).toBeGreaterThan(0);
    expect(area.boundary).toBeUndefined();
    doc.occurrences = [];
    expect(buildingLevels(doc, floor)[0]!.areas[0]!.boundary).toBeUndefined();
    area.boundary = { x: 1, z: 2, width: 3, depth: 4 };
    display = buildingLevels(doc, floor)[0]!.areas[0]!;
    expect(display.boundary).toEqual(area.boundary);
    expect(display.estimated).toBe(false);
  });
  it("separates coincident storeys for viewing and excludes floors belonging to another building", () => {
    const doc = spatialDocumentSchema.parse(example.spatial),
      floor = doc.spaces.find((n) => n.kind === "floor")!;
    doc.spaces.push({ ...floor, id: "upper" }, { ...floor, id: "unrelated", parentId: "other" });
    const levels = buildingLevels(doc, floor);
    expect(levels.map((l) => l.node.id)).toEqual([floor.id, "upper"]);
    expect(levels[1]!.offset.y).toBeGreaterThan(levels[0]!.offset.y);
    expect(levels[1]!.node.floor!.origin).toEqual(floor.floor!.origin);
  });
});
