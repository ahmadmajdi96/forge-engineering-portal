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
      expect(workspaceForPath(path)?.group).toBe("Studio");
    for (const path of ["/process-routes", "/asset-steps", "/step-templates"])
      expect(workspaceForPath(path)?.group).toBe("Process Design");
    expect(workspaceForPath("/stations/ST-2")?.group).toBe("Assets");
    expect(workspaceGroups().some((group) => group.label === "Operations")).toBe(false);
    for (const path of ["/live", "/operator", "/operator/ST-101", "/hmi", "/hmi/ST-101"])
      expect(workspaceForPath(path)).toBeUndefined();
    const actions = ["ems.engineering.view"];
    expect(allowedWorkspace("/operator-app", actions)).toBe(false);
    expect(
      workspaceGroups({ key: "north", name: "North", actions }).find((g) => g.label === "Studio")
        ?.items,
    ).toHaveLength(0);
    expect(allowedWorkspace("/application-studio", ["ems.application_studio.view"])).toBe(true);
  });
  it("applies independent grants to release, assignment and technical pages", () => {
    for (const [path, grant] of [
      ["/approvals", "ems.factory_releases.view"],
      ["/integrations", "ems.factory_releases.view"],
      ["/factory-assignment", "ems.factory_assignments.view"],
      ["/admin/qa", "ems.admin_qa.view"],
    ]) {
      expect(allowedWorkspace(path!, ["ems.engineering.view"])).toBe(false);
      expect(allowedWorkspace(path!, [grant!])).toBe(true);
    }
    expect(allowedWorkspace("/screen-editor", ["ems.application_studio.view"])).toBe(false);
    expect(
      allowedWorkspace("/screen-editor", ["ems.application_studio.view", "ems.engineering.view"]),
    ).toBe(true);
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
