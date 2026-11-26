import { describe, expect, it } from "vitest";
import { validateRoute, type ProcessRoute } from "./process";

const end = {
  stationIds: [],
  capabilities: [],
  evidence: [],
  expectedSeconds: 0,
  waitTimeoutSeconds: null,
};
const route: ProcessRoute = {
  id: "fill",
  name: "Fill",
  start: "fill",
  product: null,
  recipe: null,
  steps: [
    { ...end, id: "fill", name: "Fill", stationIds: ["station"], outcome: "operation" },
    { ...end, id: "done", name: "Done", outcome: "complete" },
    { ...end, id: "bad", name: "Failed", outcome: "failed" },
  ],
  transitions: [
    { from: "fill", to: "done", outcome: "success", condition: null, maxAttempts: null },
    { from: "fill", to: "bad", outcome: "failure", condition: null, maxAttempts: null },
  ],
};

describe("factory process graph", () => {
  it("permits bounded rework with independent success and failure exits", () => {
    expect(
      validateRoute({
        ...route,
        transitions: [
          ...route.transitions,
          { from: "fill", to: "fill", outcome: "rework", condition: null, maxAttempts: 2 },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects an ordinary cycle, unbounded rework and an unreachable outcome", () => {
    expect(
      validateRoute({
        ...route,
        transitions: [
          { ...route.transitions[0]!, to: "fill" },
          ...route.transitions.slice(1),
          { from: "fill", to: "fill", outcome: "rework", condition: null, maxAttempts: null },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Rework must have an attempt limit.",
        "Normal and failure paths must be acyclic. Use a bounded rework transition.",
        "Every step must be reachable through a normal or failure path.",
      ]),
    );
  });
});
