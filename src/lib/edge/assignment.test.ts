import { describe, expect, it } from "vitest";
import {
  conflictingAssignments,
  resolveAssignment,
  type Assignment,
  type NodeCapabilities,
} from "./assignment";

const releaseDigest = "a".repeat(64);
const common = {
  siteId: "site-a",
  nodeId: "node-a",
  kind: "operator",
  releaseId: "release-1",
  releaseDigest,
  configRevision: "config-one",
  configuration: {},
  secretReferences: [],
  effectiveFrom: 0,
  effectiveUntil: 10,
} as const;
const assignment = (
  id: string,
  selector: Assignment["selector"],
  rest: Partial<Assignment> = {},
): Assignment => ({ ...common, secretReferences: [], id, selector, ...rest });
const context = {
  siteId: "site-a",
  lineId: "line-a",
  stationId: "station-a",
  terminalId: "terminal-a",
  nodeId: "node-a",
  stepId: "step-a",
};
const node: NodeCapabilities = {
  nodeId: "node-a",
  architecture: "amd64",
  os: "linux",
  runtime: 1,
  displays: ["panel"],
  peripherals: [],
  signals: [],
  commandPolicies: [],
};
const release = {
  manifest: {
    id: "release-1",
    siteId: "site-a",
    kind: "operator" as const,
    compatibility: {
      os: "linux" as const,
      runtime: 1,
      architectures: ["amd64" as const],
      displays: ["panel"],
      peripherals: [],
      signals: [],
      commandPolicies: [],
    },
  },
  contentDigest: releaseDigest,
};

describe("effective assignment resolution", () => {
  it("explains strict step and terminal refinement without depending on array order", () => {
    const base = assignment("station", { stationId: "station-a" });
    const terminal = assignment("terminal", { stationId: "station-a", terminalId: "terminal-a" });
    const step = assignment("step", {
      stationId: "station-a",
      terminalId: "terminal-a",
      stepId: "step-a",
    });
    const assignments = [step, base, terminal];
    expect(conflictingAssignments(assignments)).toEqual([]);
    expect(
      resolveAssignment({
        assignments,
        releases: [release],
        context,
        node,
        kind: "operator",
        at: 0,
      }),
    ).toEqual({ status: "resolved", assignment: step, overridden: ["station", "terminal"] });
    expect(
      resolveAssignment({
        assignments,
        releases: [release],
        context,
        node,
        kind: "operator",
        at: 10,
      }).status,
    ).toBe("unassigned");
  });

  it("reports incomparable overlapping selectors, and permits a later nonoverlapping version", () => {
    const a = assignment("station", { stationId: "station-a" });
    const b = assignment("terminal", { terminalId: "terminal-a", stepId: "step-a" });
    expect(conflictingAssignments([a, b])).toHaveLength(1);
    expect(conflictingAssignments([a, { ...b, effectiveFrom: 10, effectiveUntil: null }])).toEqual(
      [],
    );
    expect(
      resolveAssignment({
        assignments: [a, b],
        releases: [release],
        context,
        node,
        kind: "operator",
        at: 9,
      }).status,
    ).toBe("ambiguous");
  });

  it("fails closed on winning incompatible assignment and exact scoped release mismatch", () => {
    const base = assignment("site", {});
    const override = assignment(
      "override",
      { terminalId: "terminal-a" },
      { releaseDigest: "b".repeat(64) },
    );
    expect(
      resolveAssignment({
        assignments: [base, override],
        releases: [release],
        context,
        node,
        kind: "operator",
        at: 0,
      }),
    ).toMatchObject({ status: "incompatible", candidates: ["override"] });
    expect(
      resolveAssignment({
        assignments: [base],
        releases: [release],
        context,
        node: { ...node, architecture: "arm64" },
        kind: "operator",
        at: 0,
      }),
    ).toMatchObject({ status: "incompatible", issues: ["Unsupported platform"] });
  });
});
