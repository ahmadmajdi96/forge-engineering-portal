import { describe, expect, it } from "vitest";
import example from "../../docs/factory-engineering/packaging-training.json";
import { allWorkspaceGroups } from "@/lib/engineering/navigation";
import {
  resolveSetupItem,
  setupStages,
  setupUnavailable,
} from "@/components/engineering/setup-wizard-state";

const spatial = example.spatial;
const model = example.engineering.model;
const scale = spatial.occurrences.find((item) => item.asset.id === "PACK-SCALE")!;
const selected = { site: spatial.siteCode, id: scale.id, type: "occurrence" } as const;

describe("item-scoped engineering setup", () => {
  it("covers each Factory Engineering page once, excluding the overview", () => {
    const pages = allWorkspaceGroups.find((g) => g.label === "Factory Engineering")!.items;
    expect(setupStages.map((s) => s.path).sort()).toEqual(
      pages
        .map((p) => p.url)
        .filter((url) => url !== "/")
        .sort(),
    );
  });
  it("requires each stage's own grant even for a fully linked item", () => {
    const scope = resolveSetupItem(selected, spatial, model)!;
    for (const stage of setupStages)
      expect(setupUnavailable(stage, scope, [])).toMatch(/authorized/);
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
