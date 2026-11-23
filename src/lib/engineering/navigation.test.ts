import { describe, expect, it } from "vitest";
import { workspaceGroups, workspaceForPath, allowedWorkspace } from "./navigation";
import { makeModel } from "./model";
import { legacyStudioFields } from "./studio-fields";

describe("engineering and studio ownership", () => {
  it("keeps direct links, aliases and independent entitlements aligned with the sidebar", () => {
    for (const path of [
      "/screen-editor",
      "/operator-app",
      "/operator-apps",
      "/procedure-designer",
      "/hmi-layouts",
      "/edge-app-studio",
    ])
      expect(workspaceForPath(path)?.group).toBe("Application Studio");
    for (const path of ["/process-routes", "/asset-steps", "/stations/ST-2", "/step-templates"])
      expect(workspaceForPath(path)?.group).toBe("Factory Engineering");
    expect(workspaceForPath("/hmi")?.group).toBe("Operations");
    const actions = ["ems.engineering.view"];
    expect(allowedWorkspace("/operator-app", actions)).toBe(false);
    expect(
      workspaceGroups({ key: "north", name: "North", actions }).find(
        (g) => g.label === "Application Studio",
      )?.items,
    ).toHaveLength(0);
    expect(allowedWorkspace("/application-studio", ["ems.application_studio.view"])).toBe(true);
  });
  it("recognizes legacy app definition changes independently of a physical edit", () => {
    const original = makeModel();
    const modified = {
      ...original,
      reason: "Physical inventory",
      records: [...original.records].reverse(),
    };
    expect(legacyStudioFields(modified)).toEqual(legacyStudioFields(original));
    modified.records = modified.records.map((record) =>
      record.kind === "app" ? { ...record, name: record.name + " revised" } : record,
    );
    expect(legacyStudioFields(modified)).not.toEqual(legacyStudioFields(original));
  });
});
