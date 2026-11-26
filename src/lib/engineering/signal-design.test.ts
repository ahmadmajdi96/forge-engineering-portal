import { describe, expect, it } from "vitest";
import { makeModel, modelSchema, signalSchema, validateModel } from "./model";
import { stationSignals, putStationSignal, signalTransitionError } from "./signal-design";
import { stationsForStep } from "./asset-flow";

describe("station engineering relationships", () => {
  it("explicitly claims an unassigned legacy mapping and preserves all identities and assignments after revision parsing", () => {
    const model = makeModel(),
      fixture = model.signals[0]!;
    const { stationId: _id, equipmentId: _equipment, ...legacy } = fixture;
    model.signals = [legacy, ...model.signals.slice(1)];
    expect(stationSignals(model, "ST-101")).toHaveLength(0);
    expect(stationSignals(model, "ST-101", true)).toEqual([legacy]);
    const result = modelSchema.parse(
      putStationSignal(
        model,
        {
          ...legacy,
          stationId: "ST-101",
          equipmentId: "TERM-101",
          protocol: "MQTT",
          interfaceRef: "measurement",
          scale: 0.1,
          offset: -1,
          requiredCapability: "weigh",
        },
        legacy.key,
      ),
    );
    expect(stationSignals(result, "ST-101")).toEqual([
      expect.objectContaining({ key: legacy.key, scale: 0.1, offset: -1 }),
    ]);
    expect(stationSignals(result, "ST-104")).toEqual(model.signals.slice(1));
    expect(result.records).toEqual(model.records);
    expect(result.steps).toEqual(model.steps);
    expect(result.desired).toEqual(model.desired);
  });
  it("rejects duplicate keys, zero scale, credentials and cross-station hardware", () => {
    const model = makeModel(),
      signal = model.signals[0]!;
    expect(() => putStationSignal(model, signal)).toThrow(/already exists/);
    expect(() =>
      putStationSignal(model, { ...signal, equipmentId: "TERM-101" }, signal.key),
    ).toThrow(/belonging/);
    expect(signalSchema.safeParse({ ...signal, scale: 0 }).success).toBe(false);
    expect(signalSchema.safeParse({ ...signal, address: "https://a:b@plc.example/" }).success).toBe(
      false,
    );
    expect(
      signalSchema.safeParse({ ...signal, interfaceRef: "/measure?token=private" }).success,
    ).toBe(false);
    expect(
      validateModel({ ...model, signals: [{ ...signal, equipmentId: "missing" }] }),
    ).toContainEqual(
      expect.objectContaining({
        object: signal.key,
        message: "Source equipment is unavailable at this station",
      }),
    );
  });
  it("rejects invalid newly introduced ownership at the shared save boundary", () => {
    const model = makeModel(),
      signal = model.signals[0]!;
    expect(signalTransitionError(model, { ...model, signals: [...model.signals, signal] })).toMatch(
      /unique/,
    );
    expect(
      signalTransitionError(model, {
        ...model,
        signals: [{ ...signal, stationId: "other" }, ...model.signals.slice(1)],
      }),
    ).toMatch(/station/);
    const referenced = { ...model, steps: [{ ...model.steps[0]!, signal: signal.key }] };
    expect(
      signalTransitionError(referenced, { ...referenced, signals: model.signals.slice(1) }),
    ).toMatch(/Reassign references/);
  });
  it("preserves primary-before-alternative order independently of registry and physical positions", () => {
    const model = makeModel(),
      step = model.records.find((r) => r.kind === "operation")!;
    expect(
      stationsForStep(model, { ...step, parent: "ST-104", binding: "ST-101, ST-104" }).map(
        (s) => s.id,
      ),
    ).toEqual(["ST-104", "ST-101"]);
  });
});
