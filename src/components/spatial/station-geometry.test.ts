import { describe, expect, it } from "vitest";
import { equipmentKinds, stationModels } from "@/lib/spatial/model";
import { createStationGeometry } from "./station-geometry";

describe("factory station schematics", () => {
  it.each([...equipmentKinds, ...stationModels])(
    "%s fits the same floor-anchored envelope at either detail level",
    (shape) => {
      const full = createStationGeometry(shape, false);
      const low = createStationGeometry(shape, true);
      try {
        for (const axis of ["x", "y", "z"] as const) {
          expect(full.boundingBox!.min[axis]).toBeCloseTo(-0.5, 5);
          expect(full.boundingBox!.max[axis]).toBeCloseTo(0.5, 5);
          expect(low.boundingBox!.min[axis]).toBeGreaterThanOrEqual(-0.500001);
          expect(low.boundingBox!.max[axis]).toBeLessThanOrEqual(0.500001);
        }
        // Simplification can remove recessed trim but must not translate the support off the floor.
        expect(low.boundingBox!.min.y).toBeCloseTo(-0.5, 5);
        expect(low.index!.count).toBeLessThanOrEqual(full.index!.count);
        expect(full.getAttribute("color").count).toBe(full.getAttribute("position").count);
        expect(full.index!.count / 3).toBeLessThan(500);
      } finally {
        full.dispose();
        low.dispose();
      }
    },
  );
});
