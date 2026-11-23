// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Box3, Euler, Vector3 } from "three";
import {
  digestArtifact,
  encodeArtifact,
  inspectGltf,
  verifySpatialArtifactContent,
} from "./artifacts";
import { draftReducer, mergeSpatialDocuments, moveSelection, startDraft } from "./draft";
import {
  createOccurrence,
  createSpace,
  duplicateOccurrences,
  emptySpatialDocument,
  origin,
  portPosition,
  rotate,
  snapToPort,
  spatialDocumentSchema,
  type Connection,
  type SpatialDocument,
} from "./model";
import { inspectModelFile, loadModelArtifact, disposeTree } from "./model-asset";
import {
  comparePlacements,
  validateSpatialGeometry,
  validateSpatialRelationships,
} from "./validation";

function layout(site = "north-factory") {
  const document = emptySpatialDocument(site);
  const building = createSpace(document.spaces[1]!, "Production building");
  const floor = createSpace(building, "Filling floor");
  const area = createSpace(floor, "Bottling");
  const line = createSpace(area, "Line 2");
  const station = createSpace(line, "Feeder");
  const template = document.catalog.find((item) => item.kind === "conveyor")!;
  const a = createOccurrence(template, station.id, { x: 5, y: 0, z: 6 });
  const b = createOccurrence(template, station.id, { x: 8.4, y: 0, z: 6 });
  const connection: Connection = {
    id: "material-run",
    kind: "material",
    from: { occurrenceId: a.id, portId: "exit" },
    to: { occurrenceId: b.id, portId: "feed" },
  };
  document.spaces.push(building, floor, area, line, station);
  document.occurrences.push(a, b);
  document.connections.push(connection);
  return { document, a, b, template, connection };
}

function modelFixture(millimetres: boolean, binary: boolean) {
  const scale = millimetres ? 1000 : 1;
  // Sparse vertices give exact dimensions even with an off-origin nested transform.
  const vertices = new Float32Array([0, 0, 0, 0.5 * scale, 2 * scale, 3 * scale, scale, 0, 0]);
  const data = new Uint8Array(vertices.buffer);
  const document = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { translation: [-3 * scale, scale, 2 * scale], children: [1] },
      { translation: [scale, scale, scale], mesh: 0 },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [
      binary
        ? { byteLength: data.length }
        : {
            byteLength: data.length,
            uri: `data:application/octet-stream;base64,${encodeArtifact(data)}`,
          },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: data.length }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [scale, 2 * scale, 3 * scale],
      },
    ],
  };
  if (!binary) return new File([JSON.stringify(document)], "fixture.gltf");
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const bytes = new Uint8Array(28 + jsonLength + data.length);
  bytes.fill(0x20, 20, 20 + jsonLength);
  const view = new DataView(bytes.buffer);
  [
    [0, 0x46546c67],
    [4, 2],
    [8, bytes.length],
    [12, jsonLength],
    [16, 0x4e4f534a],
    [20 + jsonLength, data.length],
    [24 + jsonLength, 0x004e4942],
  ].forEach(([offset, value]) => view.setUint32(offset!, value!, true));
  bytes.set(encoded, 20);
  bytes.set(data, 28 + jsonLength);
  return new File([bytes], "fixture.glb");
}

describe("spatial document", () => {
  it("keeps independent placements on exact template revisions and clears hard links on duplication", () => {
    const { document, a, b, template } = layout();
    const revised = { ...template, revision: 2, size: { ...template.size, x: 5 } };
    document.catalog.push(revised);
    expect(spatialDocumentSchema.safeParse(document).success).toBe(true);
    const duplicate = duplicateOccurrences(
      [
        {
          ...a,
          asset: { system: "CMMS", id: "asset-one", exclusive: true },
          processStepIds: ["inspect"],
        },
        b,
      ],
      { x: 1, y: 0, z: 0 },
    );
    expect(duplicate.map((record) => record.templateRevision)).toEqual([1, 1]);
    expect(duplicate.map((record) => record.id)).not.toContain(a.id);
    expect(duplicate[0]).toMatchObject({
      asset: null,
      processStepIds: [],
      terminalId: null,
      position: { x: 6 },
    });
    expect(a.position.x).toBe(5);
  });

  it("rejects cross-floor wiring, unresolved revisions and duplicate exclusive assets", () => {
    const { document, a, b } = layout();
    const asset = { system: "CMMS", id: "asset-a", exclusive: true };
    a.asset = asset;
    b.asset = asset;
    const building = document.spaces.find((item) => item.kind === "building")!;
    const anotherFloor = createSpace(building, "Separate floor");
    const secondary = createSpace(
      createSpace(createSpace(anotherFloor, "Area"), "Line"),
      "Station",
    );
    b.stationId = secondary.id;
    b.templateRevision = 98;
    document.spaces.push(anotherFloor, secondary);
    const errors = validateSpatialRelationships(document);
    expect(errors.map((issue) => issue.rule)).toEqual(
      expect.arrayContaining([
        "exclusive-asset@1",
        "connection-endpoint@1",
        "occurrence-reference@1",
      ]),
    );
    expect(errors.some((issue) => issue.ids.includes(a.id))).toBe(true);
  });

  it("matches Three Euler XYZ semantics and checks port and clearance geometry", () => {
    const specimen = { x: 1, y: 3, z: 2 };
    const angles = { x: 30, y: 60, z: -90 };
    const result = rotate(specimen, angles);
    const reference = new Vector3(1, 3, 2).applyEuler(
      new Euler(Math.PI / 6, Math.PI / 3, -Math.PI / 2, "XYZ"),
    );
    expect(result.x).toBeCloseTo(reference.x);
    expect(result.y).toBeCloseTo(reference.y);
    expect(result.z).toBeCloseTo(reference.z);
    const { document, a, b, template, connection } = layout();
    a.clearance = { distance: 0.3, ruleReference: "SITE-RULE-39" };
    expect(validateSpatialGeometry(document).map((issue) => issue.rule)).toEqual([
      "configured-clearance@1",
      "material-port-gap@1",
    ]);
    const snapped = snapToPort(document, connection);
    const sender = portPosition(snapped[0]!, template, template.ports[1]!);
    const receiver = portPosition(b, template, template.ports[0]!);
    expect(sender.x).toBeCloseTo(receiver.x);
    expect(sender.y).toBe(receiver.y);
    expect(
      validateSpatialGeometry({ ...document, occurrences: snapped }).map((issue) => issue.rule),
    ).toEqual(["configured-clearance@1"]);
    b.position.x -= 1;
    expect(
      validateSpatialGeometry(document).some((issue) => issue.rule === "overlapping-envelope@1"),
    ).toBe(true);
  });

  it("undoes a group translation as one operation and merges only nonoverlapping revisions", () => {
    const { document, a, b } = layout();
    const grouped = document.occurrences.map((item) => ({ ...item, group: "group-one" }));
    const baseline: SpatialDocument = { ...document, occurrences: grouped };
    const changed = draftReducer(startDraft(baseline), {
      type: "edit",
      apply: (current) => ({
        ...current,
        occurrences: moveSelection(current.occurrences, [a.id], grouped[0]!, { x: 9, y: 0, z: 6 }),
      }),
    });
    expect(changed.current.occurrences.map((item) => item.position.x)).toEqual([9, 12.4]);
    const undo = draftReducer(changed, { type: "undo" });
    expect(undo.current).toBe(baseline);
    expect(draftReducer(undo, { type: "redo" }).current).toBe(changed.current);
    expect(comparePlacements(changed.current, baseline)).toEqual([
      { id: a.id, label: a.label, kinds: ["moved"] },
      { id: b.id, label: b.label, kinds: ["moved"] },
    ]);

    const noteOnA = {
      ...baseline,
      occurrences: [{ ...grouped[0]!, notes: "Internal" }, grouped[1]!],
    };
    const noteOnB = {
      ...baseline,
      occurrences: [grouped[0]!, { ...grouped[1]!, notes: "Vendor" }],
    };
    const first = mergeSpatialDocuments(baseline, noteOnA, noteOnB);
    expect(first.conflicts).toEqual([]);
    expect(first.merged.occurrences.map((item) => item.notes)).toEqual(["Internal", "Vendor"]);
    expect(mergeSpatialDocuments(baseline, noteOnA, changed.current).conflicts).toEqual([
      `Occurrence ${a.id}`,
    ]);
  });
});

describe("static model import", () => {
  it.each([
    [false, true],
    [true, true],
    [false, false],
  ])(
    "normalizes actual nested source bounds to metres (millimetres %s, binary %s)",
    async (millimetres, binary) => {
      // Node implements fetch but its DOM-free runtime does not define ProgressEvent.
      if (!binary && typeof ProgressEvent === "undefined")
        vi.stubGlobal("ProgressEvent", class extends Event {});
      try {
        const file = modelFixture(millimetres, binary);
        const result = await inspectModelFile(
          file,
          millimetres ? "mm" : "m",
          "Inspection fixture",
          "Test-owned",
        );
        const scale = millimetres ? 1000 : 1;
        expect(result.min).toEqual({ x: -2 * scale, y: 2 * scale, z: 3 * scale });
        expect(result.max).toEqual({ x: -scale, y: 4 * scale, z: 6 * scale });
        expect(result.size).toEqual({ x: 1, y: 2, z: 3 });
        expect(result.sha256).toEqual(
          await digestArtifact(new Uint8Array(await file.arrayBuffer())),
        );
        const model = await loadModelArtifact(result);
        model.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(model, true);
        expect(bounds.min.x).toBeCloseTo(-0.5);
        expect(bounds.min.y).toBeCloseTo(0);
        expect(bounds.max.z).toBeCloseTo(1.5);
        disposeTree(model);
        const document = emptySpatialDocument("fixture");
        document.artifacts.push(result);
        await expect(verifySpatialArtifactContent(document)).resolves.toBeUndefined();
        await expect(
          verifySpatialArtifactContent({
            ...document,
            artifacts: [{ ...result, sha256: "0".repeat(64) }],
          }),
        ).rejects.toThrow("SHA-256");
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("rejects external resources and cyclic nodes before the renderer", async () => {
    const text = await modelFixture(false, false).text();
    const data = JSON.parse(text);
    data.buffers[0].uri = "https://example.invalid/source.bin";
    expect(() => inspectGltf(new TextEncoder().encode(JSON.stringify(data)), "gltf")).toThrow(
      "External",
    );
    const cycle = JSON.parse(text);
    cycle.nodes[1].children = [0];
    expect(() => inspectGltf(new TextEncoder().encode(JSON.stringify(cycle)), "gltf")).toThrow(
      "cycle",
    );
    expect(origin).toEqual({ x: 0, y: 0, z: 0 });
  });
});
