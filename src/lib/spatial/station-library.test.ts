// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptySpatialDocument, origin, spatialDocumentSchema, stationModels } from "./model";
import { placeLibraryTemplate, placementLibrary } from "./station-library";
describe("factory viewer station assemblies", () => {
  it("offers every assembly to existing layouts without modifying a saved revision", () => {
    const saved = emptySpatialDocument("training-north");
    const catalog = placementLibrary(saved.catalog);
    expect(catalog.filter((t) => t.stationModel).map((t) => t.stationModel)).toEqual(stationModels);
    expect(saved.catalog.some((t) => t.stationModel)).toBe(false);
  });
  it("persists the exact template once across repeated placements without copying hardware identities", () => {
    const base = emptySpatialDocument("training-north"),
      assembly = placementLibrary([])[0]!;
    const first = placeLibraryTemplate(base, assembly, "station-1", origin);
    const next = placeLibraryTemplate(
      spatialDocumentSchema.parse(first.document),
      assembly,
      "station-2",
      { x: 2, y: 0, z: 3 },
    );
    expect(next.document.catalog.length).toBe(base.catalog.length + 1);
    expect(next.record.id).not.toBe(first.record.id);
    expect(next.record).toMatchObject({
      stationId: "station-2",
      asset: null,
      terminalId: null,
      processStepIds: [],
    });
    expect(
      placementLibrary(next.document.catalog).filter((t) => t.id === assembly.id),
    ).toHaveLength(1);
  });
});
