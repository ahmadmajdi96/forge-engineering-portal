import { describe, expect, it } from "vitest";
import { archiveDesignRecord, duplicateDesignRecord, upsertDesignRecord } from "./design-records";
import { makeModel, modelSchema } from "./model";
import { archiveHardware, hardwareTransitionError, updateHardware } from "./hardware-lifecycle";
import { buildRegistry, pageRegistry, type RegistryQuery } from "./asset-search";
import { removeStation, putStation } from "./asset-registry";

const query: RegistryQuery = {
  q: "",
  line: "",
  kind: "all",
  state: "active",
  sort: "name",
  direction: "asc",
  page: 1,
  size: 25,
};

describe("physical identities and revision transitions", () => {
  it("accepts the initial illustrated model as a first engineering revision", () => {
    expect(hardwareTransitionError(null, makeModel())).toBeUndefined();
  });
  it("separates node and terminal sharing a legacy identifier", () => {
    const model = makeModel();
    const terminal = model.records.find((r) => r.kind === "terminal" && r.id === "EDGE-RUH-01")!;
    const node = model.records.find((r) => r.kind === "node" && r.id === terminal.id)!;
    expect(node).toBeDefined();
    expect(
      upsertDesignRecord(model.records, { ...terminal, name: "Panel" }).find(
        (r) => r.kind === "node" && r.id === node.id,
      ),
    ).toBe(node);
    expect(() => archiveDesignRecord(model.records, node.id)).toThrow("record type");
    expect(
      buildRegistry(model)
        .filter((r) => r.id === node.id)
        .map((r) => r.key)
        .sort(),
    ).toEqual(["node:" + node.id, "terminal:" + node.id]);
  });
  it("separates geometry specifications from exclusive physical and deployed identity on duplicate", () => {
    const model = makeModel(),
      base = model.records.find((r) => r.kind === "equipment")!;
    const source = {
      ...base,
      hardware: { category: "PLC", widthM: 0.21 },
      binding: "speed",
      machine: {
        model: "plc",
        vendor: "Vendor",
        ipAddress: "10.0.0.10",
        port: 502,
        protocol: "Modbus-TCP" as const,
        receivedDataTypes: "digital",
        sentDataTypes: "",
      },
    };
    const copy = duplicateDesignRecord(source, "EQ-NEW");
    expect(copy).toMatchObject({
      id: "EQ-NEW",
      hardware: { category: "PLC", widthM: 0.21 },
      value: "",
      parent: "",
      binding: "",
    });
    expect(copy.machine).toBeUndefined();
    const next = updateHardware(model, copy);
    expect(hardwareTransitionError(model, next)).toBeUndefined();
    expect(next.stations.some((s) => s.equipment.includes(copy.id))).toBe(false);
  });
  it("moves ownership atomically and protects active signals and duplicate serials", () => {
    const model = makeModel(),
      asset = model.records.find((r) => r.id === "PLC-104")!;
    const next = updateHardware(model, { ...asset, parent: "ST-101" });
    expect(next.stations.filter((s) => s.equipment.includes(asset.id)).map((s) => s.id)).toEqual([
      "ST-101",
    ]);
    expect(hardwareTransitionError(model, next)).toBeUndefined();
    const bad = { ...next, signals: next.signals.map((s) => ({ ...s, equipmentId: asset.id })) };
    expect(() => archiveHardware(bad, { ...asset, parent: "ST-101" })).toThrow("signal");
    expect(hardwareTransitionError(model, bad)).toMatch(/signal/);
    const serialized = model.records.find((r) => r.kind === "equipment" && r.value.trim())!;
    const duplicate = { ...serialized, id: "NEW", parent: "" };
    expect(() => updateHardware(model, duplicate)).toThrow("serial");
    expect(
      hardwareTransitionError(model, { ...model, records: [...model.records, duplicate] }),
    ).toMatch(/serial/);
  });
  it("preserves archived stations through serialization and prevents identifier reuse", () => {
    const model = putStation(makeModel(), {
      id: "ST-NEW",
      name: "Future",
      lineId: "L-01",
      type: "manual",
      sequence: 12,
      status: "idle",
      cycleTimeSec: 0,
    });
    const archived = modelSchema.parse(removeStation(model, "ST-NEW"));
    expect(archived.archivedStations?.[0]?.id).toBe("ST-NEW");
    expect(hardwareTransitionError(model, archived)).toBeUndefined();
    expect(
      pageRegistry(buildRegistry(archived), { ...query, q: "ST-NEW", state: "archived" }, "test")
        .total,
    ).toBe(1);
    expect(hardwareTransitionError(archived, { ...archived, archivedStations: [] })).toMatch(
      /retained/,
    );
  });
  it("paginates a filtered registry, resolves a deep link outside the first page and clamps after removal", () => {
    const model = makeModel(),
      item = model.records.find((r) => r.kind === "equipment")!;
    model.records = Array.from({ length: 130 }, (_, i) => ({
      ...item,
      id: "EQ-" + i,
      name: "Sorter " + i,
      value: "S-" + i,
      parent: i % 2 === 0 ? "ST-101" : "ST-104",
    }));
    const rows = buildRegistry(model);
    const result = pageRegistry(rows, { ...query, q: "ST-101 sorter", page: 8 }, "test");
    expect([result.total, result.pages, result.page, result.rows.length]).toEqual([65, 3, 3, 15]);
    expect(
      pageRegistry(rows, { ...query, kind: "equipment", locate: "equipment:EQ-125" }, "test").page,
    ).toBe(6);
    expect(
      pageRegistry(rows, { ...query, q: "S-105", kind: "equipment" }, "test").rows[0]?.id,
    ).toBe("EQ-105");
    expect(pageRegistry(rows, { ...query, line: "unknown", page: 20 }, "test")).toMatchObject({
      rows: [],
      page: 1,
      total: 0,
    });
  });
});
