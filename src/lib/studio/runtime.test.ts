import { expect, test } from "vitest";
import {
  blankNode,
  compileApplication,
  makeWidget,
  newStudioApplication,
  studioWorkspaceSchema,
  type StudioDefinition,
} from "./model";
import { advanceRun, recoverInterruptedRun, setInput, startRun } from "./runtime";

function measurementApp(): StudioDefinition {
  const initial = newStudioApplication("inspection", "Valve inspection", "operator");
  const variable = {
    id: "pressure",
    name: "Pressure",
    type: "number",
    scope: "step",
    initial: null,
    unit: "kPa",
    minimum: 0,
    maximum: 200,
  } as const;
  const measurement = {
    ...makeWidget("measurement", "number", 3),
    variableId: variable.id,
    unit: variable.unit,
    target: 100,
    tolerance: 0.2,
  };
  return {
    ...initial,
    variables: [variable],
    evidenceIds: ["inspection-reading"],
    connectorIds: ["record-measurement"],
    screens: [{ ...initial.screens[0]!, widgets: [...initial.screens[0]!.widgets, measurement] }],
    nodes: [
      ...initial.nodes.map((node) =>
        node.id === "done" ? { ...node, requiredEvidence: ["inspection-reading"] } : node,
      ),
      {
        ...blankNode("record", "Record measurement", "connector"),
        connectorId: "record-measurement",
        timeoutMs: 500,
        inputVariableIds: [variable.id],
      },
      { ...blankNode("reject", "Pressure outside tolerance", "terminal"), outcome: "failed" },
    ],
    transitions: [
      {
        id: "within",
        from: "start",
        to: "record",
        event: "submit",
        guard: { operator: "withinTolerance", variableId: variable.id, widgetId: measurement.id },
        effects: [{ kind: "capture", evidenceId: "inspection-reading", variableId: variable.id }],
      },
      { ...initial.transitions[0]!, to: "reject" },
      initial.transitions[1]!,
      { id: "recorded", from: "record", to: "done", event: "success", guard: null, effects: [] },
      {
        id: "record-rejected",
        from: "record",
        to: "reject",
        event: "failure",
        guard: null,
        effects: [],
      },
    ],
  };
}

test("preserves exact per-app breakpoints, measurements and bindings within a revision", () => {
  const measurement = measurementApp();
  const hmi = newStudioApplication("status", "Cell status", "hmi");
  measurement.screens[0]!.widgets[1]!.layouts.tablet.width = 7;
  const loaded = studioWorkspaceSchema.parse(
    JSON.parse(JSON.stringify({ version: 1, applications: [measurement, hmi] })),
  );
  expect(loaded.applications[0]!.screens[0]!.widgets[1]).toMatchObject({
    target: 100,
    tolerance: 0.2,
    layouts: { tablet: { width: 7 }, portrait: { width: 4 } },
    variableId: "pressure",
  });
  expect(loaded.applications[1]).toEqual(hmi);
  expect(compileApplication(loaded.applications[0])).toMatchObject({ ok: true });
  expect(compileApplication(loaded.applications[1])).toMatchObject({ ok: true });
});

test("requires resolved bindings, matching units, reachable steps and a conditional fallback", () => {
  const app = measurementApp();
  app.screens[0]!.widgets[1]!.unit = "bar";
  app.nodes.push(blankNode("detached", "Detached", "terminal"));
  app.transitions = app.transitions.filter((link) => link.id !== "complete-run");
  const compiled = compileApplication(app);
  expect(compiled.ok).toBe(false);
  if (compiled.ok) return;
  expect(compiled.issues.map((issue) => issue.message).join(" ")).toMatch(
    /units must match.*unconditional destination.*unreachable/,
  );
});

test("rejects cycles, unreachable success evidence and structurally invalid commands", () => {
  const cycle = measurementApp();
  cycle.transitions.find((link) => link.id === "recorded")!.to = "start";
  expect(compileApplication(cycle)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining([
      { path: "nodes.start", message: expect.stringContaining("cycle") },
    ]),
  });

  const noCapture = measurementApp();
  noCapture.transitions[0]!.effects = [];
  expect(compileApplication(noCapture)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining([
      { path: "nodes.done", message: expect.stringContaining("not captured") },
    ]),
  });

  expect(
    compileApplication({ ...measurementApp(), javascript: "await fetch('/api/actions')" }),
  ).toMatchObject({ ok: false });
});

test("evaluates inclusive decimal tolerance and snapshots step inputs before reset", () => {
  const app = measurementApp();
  const first = startRun(app, "run-1", 1000);
  expect(setInput(app, first, "pressure", "invalid").detail).toMatch(/valid value/);
  const run = setInput(app, first, "pressure", 100.2);
  const request = advanceRun(app, run, { kind: "submit", sequence: 0, now: 1001 });
  expect(request.nodeId).toBe("record");
  expect(request.values["pressure"]).toBeNull();
  expect(request.evidence["inspection-reading"]?.value).toBe(100.2);
  expect(request.pending?.inputs["pressure"]).toBe(100.2);
  expect(request.pending?.id).toBe("run-1:1:record");
  expect(advanceRun(app, request, { kind: "submit", sequence: 0, now: 1002 })).toBe(request);
  const complete = advanceRun(app, request, {
    kind: "connector",
    sequence: 1,
    now: 1002,
    result: { requestId: request.pending!.id, outcome: "accepted" },
  });
  expect(complete.outcome).toBe("complete");

  const invalid = setInput(app, run, "pressure", 500);
  expect(advanceRun(app, invalid, { kind: "submit", sequence: 0, now: 1001 })).toMatchObject({
    nodeId: "start",
    pending: null,
    detail: "Correct the invalid inputs before continuing.",
  });
  const outside = setInput(app, first, "pressure", 100.20000000000002);
  expect(advanceRun(app, outside, { kind: "submit", sequence: 0, now: 1001 }).outcome).toBe(
    "failed",
  );
});

test("ignores unrelated acknowledgements and blocks timed-out or interrupted external outcomes", () => {
  const app = measurementApp();
  const run = setInput(app, startRun(app, "run-2", 1000), "pressure", 100);
  const awaiting = advanceRun(app, run, { kind: "submit", sequence: 0, now: 1001 });
  expect(
    advanceRun(app, awaiting, {
      kind: "connector",
      sequence: 1,
      now: 1002,
      result: { requestId: "another", outcome: "accepted" },
    }),
  ).toBe(awaiting);
  const expired = advanceRun(app, awaiting, {
    kind: "connector",
    sequence: 1,
    now: awaiting.pending!.expiresAt,
    result: { requestId: awaiting.pending!.id, outcome: "accepted" },
  });
  expect(expired).toMatchObject({
    outcome: "blocked",
    pending: null,
    lastConnectorOutcome: "unknown",
  });
  expect(recoverInterruptedRun(awaiting)).toMatchObject({
    outcome: "blocked",
    pending: null,
    lastConnectorOutcome: "unknown",
  });

  const rejected = advanceRun(app, awaiting, {
    kind: "connector",
    sequence: 1,
    now: 1002,
    result: { requestId: awaiting.pending!.id, outcome: "rejected" },
  });
  expect(rejected).toMatchObject({
    outcome: "failed",
    pending: null,
    lastConnectorOutcome: "rejected",
  });
});

test("requires declared timer routes and ignores timer events before due time", () => {
  const app = measurementApp();
  app.nodes.find((node) => node.id === "start")!.timeoutMs = 750;
  expect(compileApplication(app).ok).toBe(false);
  app.transitions.push({
    id: "timed-out",
    from: "start",
    to: "reject",
    event: "timer",
    guard: null,
    effects: [],
  });
  expect(compileApplication(app).ok).toBe(true);
  const run = startRun(app, "run-3", 1000);
  expect(advanceRun(app, run, { kind: "timer", sequence: 0, now: 1749 })).toBe(run);
  expect(advanceRun(app, run, { kind: "timer", sequence: 0, now: 1750 }).outcome).toBe("failed");
});
