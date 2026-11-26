import { describe, expect, it } from "vitest";
import example from "../../docs/factory-engineering/packaging-training.json";
import {
  resolveSetupItem,
  setupStages,
  setupJourney,
  setupSearch,
  setupUnavailable,
} from "@/components/engineering/setup-wizard-state";

const spatial = example.spatial;
const model = example.engineering.model;
const scale = spatial.occurrences.find((item) => item.asset.id === "PACK-SCALE")!;
const selected = { site: spatial.siteCode, id: scale.id, type: "occurrence" } as const;

describe("item-scoped engineering setup", () => {
  it("guides a scale through the actual equipment, signal, MES and readiness pages", () => {
    const scope = resolveSetupItem(selected, spatial, model)!;
    expect(setupJourney(scope).map((stage) => stage.path)).toEqual([
      "/factory-layout",
      "/machines",
      "/station-connectivity",
      "/mes-integration",
      "/release-readiness",
    ]);
    expect(scope).toMatchObject({ line: "PACK-A", station: "CHECK", asset: "PACK-SCALE" });
  });

  it("uses separate journeys for physical spaces, lines, stations and terminals", () => {
    const paths = (id: string, type: "space" | "occurrence") => {
      const scope = resolveSetupItem({ site: spatial.siteCode, id, type }, spatial, model)!;
      return setupJourney(scope).map((stage) => stage.path);
    };
    for (const space of spatial.spaces.filter((s) =>
      ["building", "floor", "area"].includes(s.kind),
    )) {
      expect(paths(space.id, "space")).toEqual(["/factory-layout"]);
    }
    expect(paths(spatial.spaces.find((s) => s.kind === "line")!.id, "space")).toContain(
      "/factory-process",
    );
    expect(paths(spatial.spaces.find((s) => s.kind === "station")!.id, "space")).toContain(
      "/workstations",
    );
    const terminal = spatial.occurrences.find((o) => o.terminalId === "PACK-HMI")!;
    expect(paths(terminal.id, "occurrence")).toContain("/application-studio");
  });

  it("checks each declared grant, and does not offer a command policy for a read-only scale", () => {
    const scope = resolveSetupItem(selected, spatial, model)!;
    for (const stage of setupStages) {
      if ("action" in stage) expect(setupUnavailable(stage, scope, [])).toMatch(/authorized/);
    }
    expect(
      setupUnavailable(
        setupStages.find((stage) => stage.path === "/command-policy")!,
        scope,
        ["ems.engineering.view"],
      ),
    ).toMatch(/writable/);
  });
  it("uses the signal's exact MES consumer and rejects a command at another station", () => {
    const signal = model.signals.find((s) => s.equipmentId === scale.asset.id)!;
    const modified = {
      ...model,
      signals: [
        ...model.signals,
        { ...signal, key: "wrong_station", access: "Command", stationId: "LOAD" },
      ],
    };
    const process = { siteCode: spatial.siteCode, routes: example.process.routes };
    const scope = resolveSetupItem(selected, spatial, modified, process)!;
    expect(scope.writable).toBe(false);
    expect(setupSearch(scope, "/station-connectivity")["signal"]).toBe("inspection_weight");
    expect(setupSearch(scope, "/mes-integration")["mapping"]).toBe("PACK-WEIGHT");
    const foreign = resolveSetupItem(selected, spatial, model, {
      ...process,
      siteCode: "another-site",
    })!;
    expect(setupSearch(foreign, "/mes-integration")["mapping"]).toBeUndefined();
  });
  it("never binds an archived asset or a station that moved to a different line", () => {
    expect(
      resolveSetupItem(selected, spatial, {
        ...model,
        records: model.records.map((r) => (r.id === scale.asset.id ? { ...r, archived: true } : r)),
      }),
    ).toMatchObject({ station: "CHECK", asset: undefined });
    expect(
      resolveSetupItem(selected, spatial, {
        ...model,
        stations: model.stations.map((s) =>
          s.id === "CHECK" ? { ...s, lineId: "other-line" } : s,
        ),
      }),
    ).toMatchObject({ line: "PACK-A", station: undefined, asset: undefined });
  });
});
