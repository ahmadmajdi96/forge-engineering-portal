import {
  validValue,
  type StudioDefinition,
  type StudioEvent,
  type StudioTransition,
  type StudioValue,
} from "./model";

export type SignalObservation = {
  value: StudioValue | null;
  quality: "good" | "bad" | "unavailable";
  observedAt: number;
  receivedAt: number;
  samples?: { time: number; value: number }[];
};

export type ConnectorRequest = {
  id: string;
  runId: string;
  appId: string;
  nodeId: string;
  connectorId: string;
  expiresAt: number;
  inputs: Record<string, StudioValue | null>;
};
export type ConnectorResult = { requestId: string; outcome: "accepted" | "rejected" | "unknown" };

export type RuntimeEvent =
  | { kind: "submit" | "cancel" | "timer"; sequence: number; now: number }
  | { kind: "connector"; sequence: number; now: number; result: ConnectorResult };

type Evidence = { value: StudioValue; capturedAt: number; transition: string };
type RuntimeOutcome = "complete" | "failed" | "cancelled" | "blocked";

export type RunSnapshot = {
  id: string;
  appId: string;
  nodeId: string;
  sequence: number;
  enteredAt: number;
  values: Record<string, StudioValue | null>;
  invalidInputs: string[];
  evidence: Record<string, Evidence>;
  pending: ConnectorRequest | null;
  outcome: RuntimeOutcome | null;
  lastConnectorOutcome: ConnectorResult["outcome"] | null;
  lastConnectorRequestId: string | null;
  detail: string | null;
};

export function startRun(app: StudioDefinition, id: string, now: number): RunSnapshot {
  if (!app.entry) throw new Error("Workflow entry is missing");
  return {
    id,
    appId: app.id,
    nodeId: app.entry,
    sequence: 0,
    enteredAt: now,
    values: Object.fromEntries(app.variables.map((variable) => [variable.id, variable.initial])),
    invalidInputs: [],
    evidence: {},
    pending: null,
    outcome: null,
    detail: null,
    lastConnectorOutcome: null,
    lastConnectorRequestId: null,
  };
}

export function setInput(
  app: StudioDefinition,
  run: RunSnapshot,
  key: string,
  value: StudioValue | null,
): RunSnapshot {
  if (run.appId !== app.id || run.outcome || run.pending) return run;
  const node = app.nodes.find((item) => item.id === run.nodeId);
  const screen = app.screens.find((item) => item.id === node?.screenId);
  const variable = app.variables.find((item) => item.id === key);
  if (!variable || !screen?.widgets.some((item) => item.variableId === key)) return run;
  if (value !== null && !validValue(variable, value)) {
    return {
      ...run,
      values: { ...run.values, [key]: null },
      invalidInputs: run.invalidInputs.includes(key)
        ? run.invalidInputs
        : [...run.invalidInputs, key],
      detail: `Enter a valid value for ${variable.name}.`,
    };
  }
  return {
    ...run,
    detail: null,
    values: { ...run.values, [key]: value },
    invalidInputs: run.invalidInputs.filter((item) => item !== key),
  };
}

// Compare the serialized decimals so a measurement on the stated tolerance
// boundary does not fail due to binary floating-point subtraction.
function withinTolerance(value: number, target: number, tolerance: number): boolean {
  function decimal(number: number) {
    const [mantissa = "", exponent = "0"] = number.toString().split("e");
    const [whole = "", fraction = ""] = mantissa.split(".");
    return { digits: BigInt(whole + fraction), power: Number(exponent) - fraction.length };
  }
  const [measured, reference, limit] = [decimal(value), decimal(target), decimal(tolerance)];
  const power = Math.min(measured.power, reference.power, limit.power);
  const scale = (item: ReturnType<typeof decimal>) =>
    item.digits * 10n ** BigInt(item.power - power);
  const difference = scale(measured) - scale(reference);
  const allowed = scale(limit);
  return difference >= -allowed && difference <= allowed;
}

function passes(
  app: StudioDefinition,
  input: RunSnapshot["values"],
  guard: StudioTransition["guard"],
): boolean {
  if (!guard) return true;
  const value = input[guard.variableId];
  if (guard.operator === "present") return value !== null && value !== undefined && value !== "";
  if (guard.operator === "equals") return value === guard.value;
  if (typeof value !== "number") return false;
  if (guard.operator === "atLeast") return value >= guard.value;
  if (guard.operator === "atMost") return value <= guard.value;
  if (guard.operator === "withinTolerance") {
    const widget = app.screens
      .flatMap((screen) => screen.widgets)
      .find((widget) => widget.id === guard.widgetId);
    return (
      widget?.target != null &&
      widget.tolerance != null &&
      withinTolerance(value, widget.target, widget.tolerance)
    );
  }
  return false;
}

function block(run: RunSnapshot, detail: string): RunSnapshot {
  return { ...run, detail, outcome: "blocked", pending: null };
}

export function advanceRun(
  app: StudioDefinition,
  run: RunSnapshot,
  event: RuntimeEvent,
): RunSnapshot {
  if (run.appId !== app.id || run.outcome || event.sequence !== run.sequence) return run;
  if (event.kind === "connector" && event.result.requestId !== run.pending?.id) return run;
  if (!Number.isFinite(event.now) || event.now < run.enteredAt) {
    const interrupted = run.pending
      ? { ...run, lastConnectorOutcome: "unknown" as const, lastConnectorRequestId: run.pending.id }
      : run;
    return block(
      interrupted,
      "The local clock changed. Check the clock and reconcile pending requests.",
    );
  }
  const source = app.nodes.find((node) => node.id === run.nodeId);
  if (!source) return block(run, "Workflow step is unavailable.");

  let trigger: StudioEvent;
  let lastConnectorOutcome = run.lastConnectorOutcome;
  let lastConnectorRequestId = run.lastConnectorRequestId;
  if (event.kind === "connector") {
    if (!run.pending || event.result.requestId !== run.pending.id) return run;
    lastConnectorRequestId = run.pending.id;
    lastConnectorOutcome = event.now >= run.pending.expiresAt ? "unknown" : event.result.outcome;
    // An unresolved physical or external effect cannot progress through a retry path.
    if (lastConnectorOutcome === "unknown") {
      return block(
        { ...run, lastConnectorOutcome, lastConnectorRequestId },
        "Connector outcome is unknown. Reconcile the original request before resuming.",
      );
    }
    trigger = lastConnectorOutcome === "accepted" ? "success" : "failure";
  } else {
    if (run.pending) return run;
    if (event.kind === "submit" && run.invalidInputs.length) {
      return { ...run, detail: "Correct the invalid inputs before continuing." };
    }
    if (
      event.kind === "timer" &&
      (source.timeoutMs === null || event.now - run.enteredAt < source.timeoutMs)
    )
      return run;
    trigger = event.kind;
  }

  const inputs = run.values;
  const transition = app.transitions.find(
    (link) => link.from === source.id && link.event === trigger && passes(app, inputs, link.guard),
  );
  const target = app.nodes.find((node) => node.id === transition?.to);
  if (!target || !transition) return run;
  const evidence = { ...run.evidence };
  const values = { ...inputs };
  for (const operation of transition.effects) {
    if (operation.kind === "set") values[operation.variableId] = operation.value;
    else {
      const value = inputs[operation.variableId];
      if (value === null || value === undefined || value === "") {
        const detail = `Provide a value for evidence “${operation.evidenceId}”.`;
        return source.kind === "screen" && trigger === "submit"
          ? { ...run, detail }
          : block(run, detail);
      }
      evidence[operation.evidenceId] = { value, capturedAt: event.now, transition: transition.id };
    }
  }
  if (target.requiredEvidence.some((key) => !Object.hasOwn(evidence, key))) {
    return block(run, "A required evidence capture is missing.");
  }
  const sequence = run.sequence + 1;
  const pending =
    target.kind === "connector" && target.connectorId && target.timeoutMs !== null
      ? {
          id: `${run.id}:${sequence}:${target.id}`,
          runId: run.id,
          appId: app.id,
          nodeId: target.id,
          connectorId: target.connectorId,
          expiresAt: event.now + target.timeoutMs,
          inputs: Object.fromEntries(
            target.inputVariableIds.map((key) => [
              key,
              Object.hasOwn(values, key) ? (values[key] ?? null) : null,
            ]),
          ),
        }
      : null;
  for (const variable of app.variables) {
    if (variable.scope === "step") values[variable.id] = variable.initial;
  }
  return {
    ...run,
    nodeId: target.id,
    sequence,
    enteredAt: event.now,
    values,
    invalidInputs: [],
    evidence,
    pending,
    outcome: target.outcome,
    detail: null,
    lastConnectorOutcome,
    lastConnectorRequestId,
  };
}

export function recoverInterruptedRun(run: RunSnapshot): RunSnapshot {
  if (!run.pending) return run;
  return block(
    { ...run, lastConnectorOutcome: "unknown", lastConnectorRequestId: run.pending.id },
    "An interrupted connector request requires reconciliation.",
  );
}
