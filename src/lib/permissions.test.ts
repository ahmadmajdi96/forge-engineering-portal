import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("role permissions", () => {
  it("only Plant Engineers approve", () => {
    expect(can(["Plant Engineer"], [], "machines", "approve")).toBe(true);
    expect(can(["Automation Specialist"], [], "hmi", "approve")).toBe(false);
  });
  it("Automation Specialist edits HMI but not operator app", () => {
    expect(can(["Automation Specialist"], [], "hmi", "edit")).toBe(true);
    expect(can(["Automation Specialist"], [], "operator-app", "edit")).toBe(false);
  });
  it("Process Designer edits operator app", () => {
    expect(can(["Process Designer"], [], "operator-app", "edit")).toBe(true);
  });
  it("Viewer cannot edit but can view", () => {
    expect(can(["Viewer"], [], "lines", "edit")).toBe(false);
    expect(can(["Viewer"], [], "lines", "view")).toBe(true);
  });
  it("explicit hub permission grants access", () => {
    expect(can([], ["lines:edit"], "lines", "edit")).toBe(true);
  });
});
