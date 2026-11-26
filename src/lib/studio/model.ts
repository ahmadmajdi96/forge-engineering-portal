import { z } from "zod";

const id = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/)
  .refine((key) => !Object.hasOwn(Object.prototype, key), "Reserved identity");
const title = z.string().trim().min(1).max(120);
const text = z.string().max(4000);
const unit = z.string().trim().max(24);
const value = z.union([z.number().finite(), z.string().max(2048), z.boolean()]);
const kind = z.enum(["operator", "hmi", "procedure"]);
const datatype = z.enum(["number", "text", "boolean"]);

export const variants = ["panel", "tablet", "portrait"] as const;
export type Variant = (typeof variants)[number];

export const variantPixels: Record<Variant, number> = { panel: 1120, tablet: 760, portrait: 400 };
export const variantColumns: Record<Variant, number> = { panel: 12, tablet: 8, portrait: 4 };
export const variantForWidth = (width: number): Variant =>
  width >= 960 ? "panel" : width >= 600 ? "tablet" : "portrait";

const rect = z
  .object({
    column: z.number().int().min(1).max(12),
    row: z.number().int().min(1).max(96),
    width: z.number().int().min(1).max(12),
    height: z.number().int().min(1).max(24),
  })
  .strict();

const layouts = z.object({ panel: rect, tablet: rect, portrait: rect }).strict();
export type WidgetRect = z.infer<typeof rect>;

export const widgetKinds = [
  "instruction",
  "text",
  "number",
  "choice",
  "check",
  "scan",
  "action",
  "signal",
  "alarm",
  "trend",
  "equipment",
  "connection",
  "countdown",
  "evidence",
  "media",
  "table",
] as const;

const widgetContent = z
  .object({
    kind: z.enum(widgetKinds),
    title,
    content: text,
    variableId: id.nullable(),
    signalId: id.nullable(),
    mediaId: id.nullable(),
    event: z.enum(["submit", "cancel"]),
    choices: z.array(z.string().trim().min(1).max(120)).max(40),
    target: z.number().finite().nullable(),
    tolerance: z.number().finite().nonnegative().nullable(),
    unit,
  })
  .strict();

const widget = widgetContent.extend({ id, layouts }).strict();
const component = z.object({ id, name: title, widget: widgetContent }).strict();
const screen = z.object({ id, name: title, widgets: z.array(widget).max(100) }).strict();
const variable = z
  .object({
    id,
    name: title,
    type: datatype,
    scope: z.enum(["run", "step"]),
    initial: value.nullable(),
    unit,
    minimum: z.number().finite().nullable(),
    maximum: z.number().finite().nullable(),
  })
  .strict();
const signal = z
  .object({
    id,
    name: title,
    type: datatype,
    unit,
    freshnessMs: z.number().int().min(1).max(600_000),
  })
  .strict();
const media = z
  .object({
    id,
    name: title,
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    artifactId: id,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    alt: title,
  })
  .strict();
const dependency = z
  .object({ system: z.enum(["PLMS", "RMS", "QMS", "EMS"]), id, revision: id })
  .strict();

const node = z
  .object({
    id,
    name: title,
    kind: z.enum(["screen", "connector", "terminal"]),
    screenId: id.nullable(),
    timeoutMs: z.number().int().min(250).max(600_000).nullable(),
    connectorId: id.nullable(),
    inputVariableIds: z.array(id).max(30),
    outcome: z.enum(["complete", "failed", "cancelled"]).nullable(),
    requiredEvidence: z.array(id).max(20),
  })
  .strict();

const guard = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("present"), variableId: id }).strict(),
  z.object({ operator: z.literal("equals"), variableId: id, value, unit }).strict(),
  z
    .object({
      operator: z.enum(["atLeast", "atMost"]),
      variableId: id,
      value: z.number().finite(),
      unit,
    })
    .strict(),
  z.object({ operator: z.literal("withinTolerance"), variableId: id, widgetId: id }).strict(),
]);
const effect = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set"), variableId: id, value }).strict(),
  z.object({ kind: z.literal("capture"), evidenceId: id, variableId: id }).strict(),
]);

export const studioEvents = ["submit", "cancel", "timer", "success", "failure"] as const;
const transition = z
  .object({
    id,
    from: id,
    to: id,
    event: z.enum(studioEvents),
    guard: guard.nullable(),
    effects: z.array(effect).max(30),
  })
  .strict();

export const studioDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    runtimeVersion: z.literal(1),
    id,
    name: title,
    kind,
    theme: z.enum(["system", "light", "dark"]),
    offlinePolicy: z.enum(["online-required", "read-only-offline", "bounded-offline"]),
    capabilities: z.array(id).max(50),
    dependencies: z.array(dependency).max(100),
    connectorIds: z.array(id).max(20),
    evidenceIds: z.array(id).max(50),
    variables: z.array(variable).max(100),
    signals: z.array(signal).max(100),
    media: z.array(media).max(50),
    components: z.array(component).max(100),
    screens: z.array(screen).max(30),
    nodes: z.array(node).max(100),
    transitions: z.array(transition).max(400),
    entry: id.nullable(),
  })
  .strict();

export const studioWorkspaceSchema = z
  .object({
    version: z.literal(1),
    applications: z
      .array(studioDefinitionSchema)
      .max(100)
      .refine(
        (apps) => new Set(apps.map((app) => app.id)).size === apps.length,
        "Application identities must be unique in a site",
      ),
  })
  .strict();

export type StudioDefinition = z.infer<typeof studioDefinitionSchema>;
export type StudioWorkspace = z.infer<typeof studioWorkspaceSchema>;
export type StudioWidget = z.infer<typeof widget>;
export type StudioWidgetKind = StudioWidget["kind"];
export type StudioScreen = z.infer<typeof screen>;
export type StudioVariable = z.infer<typeof variable>;
export type StudioValue = z.infer<typeof value>;
export type StudioSignal = z.infer<typeof signal>;
export type StudioNode = z.infer<typeof node>;
export type StudioTransition = z.infer<typeof transition>;
export type StudioEvent = StudioTransition["event"];
export type StudioIssue = { path: string; message: string };

export const inputTypes: Partial<Record<StudioWidgetKind, StudioVariable["type"]>> = {
  text: "text",
  number: "number",
  check: "boolean",
  choice: "text",
  scan: "text",
  evidence: "text",
};

export function validValue(variable: StudioVariable, candidate: StudioValue): boolean {
  if (variable.type === "number") {
    return (
      typeof candidate === "number" &&
      Number.isFinite(candidate) &&
      (variable.minimum === null || candidate >= variable.minimum) &&
      (variable.maximum === null || candidate <= variable.maximum)
    );
  }
  return variable.type === "boolean"
    ? typeof candidate === "boolean"
    : typeof candidate === "string" && candidate.length <= 2048;
}

export function compileApplication(
  input: unknown,
): { ok: true; app: StudioDefinition } | { ok: false; issues: StudioIssue[] } {
  const parsed = studioDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  const app = parsed.data;
  const issues: StudioIssue[] = [];
  const issue = (path: string, message: string) => {
    issues.push({ path, message });
  };
  const keyed = <T extends { id: string }>(group: string, list: T[]) => {
    const index = new Map<string, T>();
    for (const item of list) {
      if (index.has(item.id)) issue(group, `Duplicate identity "${item.id}"`);
      index.set(item.id, item);
    }
    return index;
  };
  const screenIndex = keyed("screens", app.screens);
  const widgetIndex = keyed(
    "widgets",
    app.screens.flatMap((s) => s.widgets),
  );
  const variableIndex = keyed("variables", app.variables);
  const signalIndex = keyed("signals", app.signals);
  const mediaIndex = keyed("media", app.media);
  const nodeIndex = keyed("nodes", app.nodes);
  keyed("transitions", app.transitions);
  keyed("components", app.components);
  for (const [path, list] of Object.entries({
    capabilities: app.capabilities,
    connectorIds: app.connectorIds,
    evidenceIds: app.evidenceIds,
  })) {
    if (new Set(list).size !== list.length) issue(path, "Identities must be unique");
  }
  if (
    new Set(app.dependencies.map((item) => `${item.system}/${item.id}`)).size !==
    app.dependencies.length
  ) {
    issue("dependencies", "Pin one revision per dependency identity");
  }

  for (const item of app.variables) {
    const path = `variables.${item.id}`;
    if (item.type !== "number" && (item.unit || item.minimum !== null || item.maximum !== null)) {
      issue(path, "Only numeric variables support units or numeric bounds");
    }
    if (item.minimum !== null && item.maximum !== null && item.minimum > item.maximum) {
      issue(path, "Minimum exceeds maximum");
    }
    if (item.initial !== null && !validValue(item, item.initial))
      issue(path, "Initial value does not match the variable");
  }
  for (const item of app.signals) {
    if (item.type !== "number" && item.unit)
      issue(`signals.${item.id}`, "Only numeric signals support units");
  }

  const validateWidget = (item: z.infer<typeof widgetContent>, path: string) => {
    const expectedType = inputTypes[item.kind];
    const variable = item.variableId ? variableIndex.get(item.variableId) : undefined;
    if (expectedType && variable?.type !== expectedType)
      issue(path, `Select a ${expectedType} variable`);
    if (!expectedType && item.variableId)
      issue(path, "This component does not accept a variable binding");
    if (item.kind === "number" && item.unit !== (variable?.unit ?? ""))
      issue(path, "Widget and variable units must match");
    if ((item.target === null) !== (item.tolerance === null))
      issue(path, "Target and tolerance must be set together");
    if (item.kind !== "number" && (item.target !== null || item.tolerance !== null))
      issue(path, "Target and tolerance require a number widget");
    if (
      item.kind === "choice" &&
      (!item.choices.length || new Set(item.choices).size !== item.choices.length)
    ) {
      issue(path, "Add distinct options for the choice input");
    }
    const isSignal = ["signal", "alarm", "trend", "equipment"].includes(item.kind);
    const signal = item.signalId ? signalIndex.get(item.signalId) : undefined;
    if (isSignal && !signal) issue(path, "Select an existing semantic signal");
    if (!isSignal && item.signalId) issue(path, "This component does not accept a signal binding");
    if (signal && item.unit !== signal.unit) issue(path, "Widget and signal units must match");
    if (signal && item.kind === "trend" && signal.type !== "number")
      issue(path, "Trends require a numeric signal");
    if (signal && item.kind === "alarm" && signal.type !== "boolean")
      issue(path, "Alarms require a Boolean signal");
    if (item.kind === "media" && (!item.mediaId || !mediaIndex.has(item.mediaId)))
      issue(path, "Select a pinned media artifact");
    if (item.kind !== "media" && item.mediaId)
      issue(path, "This component does not accept a media binding");
  };
  for (const item of app.components) validateWidget(item.widget, `components.${item.id}`);
  for (const { id: screenId, widgets } of app.screens) {
    for (const item of widgets) {
      const path = `screens.${screenId}.${item.id}`;
      validateWidget(item, path);
      for (const variant of variants) {
        const bounds = item.layouts[variant];
        if (
          bounds.column + bounds.width - 1 > variantColumns[variant] ||
          bounds.row + bounds.height - 1 > 96
        ) {
          issue(`${path}.${variant}`, "Component extends outside the layout grid");
        }
      }
    }
    for (const variant of variants) {
      const occupied = new Set<string>();
      for (const item of widgets) {
        const bounds = item.layouts[variant];
        let overlaps = false;
        for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
          for (let column = bounds.column; column < bounds.column + bounds.width; column++) {
            const position = `${row}:${column}`;
            overlaps ||= occupied.has(position);
            occupied.add(position);
          }
        }
        if (overlaps)
          issue(
            `screens.${screenId}.${item.id}.${variant}`,
            "Component overlaps another component",
          );
      }
    }
  }

  if (!app.entry || !nodeIndex.has(app.entry)) issue("entry", "Select an existing entry step");
  if (app.entry && nodeIndex.get(app.entry)?.kind !== "screen")
    issue("entry", "The entry step must be an interactive screen");
  const outgoing = new Map<string, StudioTransition[]>();
  for (const link of app.transitions) {
    const path = `transitions.${link.id}`;
    const source = nodeIndex.get(link.from);
    if (!source || !nodeIndex.has(link.to)) {
      issue(path, "Transition points to a missing step");
      continue;
    }
    const list = outgoing.get(link.from) ?? [];
    list.push(link);
    outgoing.set(link.from, list);
    const permitted: StudioEvent[] =
      source.kind === "screen"
        ? ["submit", "cancel", "timer"]
        : source.kind === "connector"
          ? ["success", "failure"]
          : [];
    if (!permitted.includes(link.event)) issue(path, "Event is unavailable for this step type");
    const destination = nodeIndex.get(link.to);
    if (link.event === "cancel" && destination?.outcome !== "cancelled") {
      issue(path, "Cancel must end at a cancelled step");
    }
    if (link.event === "failure" && destination?.outcome === "complete") {
      issue(path, "Connector failure requires a failure or recovery step");
    }
    if (link.event === "timer" && source.timeoutMs === null)
      issue(path, "Set a time limit for the timer event");

    if (link.guard) {
      const condition = link.guard;
      const variable = variableIndex.get(condition.variableId);
      if (!variable) issue(path, "Guard references a missing variable");
      else if (condition.operator === "withinTolerance") {
        const measurement = widgetIndex.get(condition.widgetId);
        if (
          variable.type !== "number" ||
          measurement?.kind !== "number" ||
          measurement.variableId !== variable.id ||
          measurement.target === null ||
          measurement.tolerance === null ||
          measurement.unit !== variable.unit
        ) {
          issue(
            path,
            "Tolerance guard requires a matching numeric measurement with target, tolerance and unit",
          );
        }
      } else if (condition.operator !== "present") {
        if (!validValue(variable, condition.value) || variable.unit !== condition.unit)
          issue(path, "Guard type, bounds or units do not match the variable");
      }
    }
    for (const operation of link.effects) {
      const variable = variableIndex.get(operation.variableId);
      if (!variable) issue(path, "Effect references a missing variable");
      else if (operation.kind === "set" && !validValue(variable, operation.value))
        issue(path, "Set effect violates the variable type or bounds");
      if (operation.kind === "capture" && !app.evidenceIds.includes(operation.evidenceId)) {
        issue(path, "Capture effect references an undeclared evidence requirement");
      }
    }
  }

  for (const item of app.nodes) {
    const path = `nodes.${item.id}`;
    const links = outgoing.get(item.id) ?? [];
    const screen = item.screenId ? screenIndex.get(item.screenId) : undefined;
    if (item.kind === "screen" && !screen) issue(path, "Select an existing screen");
    if (item.kind !== "screen" && item.screenId && !screen)
      issue(path, "Select an existing display screen");
    if (item.kind === "terminal" && !item.outcome) issue(path, "Specify the terminal outcome");
    if (item.kind !== "terminal" && item.outcome) issue(path, "Only terminal steps set an outcome");
    if (
      item.kind === "connector" &&
      (!item.connectorId || !app.connectorIds.includes(item.connectorId) || item.timeoutMs === null)
    ) {
      issue(path, "Select an allowlisted connector and a finite timeout");
    }
    if (item.kind !== "connector" && (item.connectorId || item.inputVariableIds.length))
      issue(path, "Connector settings require a connector step");
    if (item.kind === "terminal" && item.timeoutMs !== null)
      issue(path, "Terminal steps cannot schedule a timer");
    for (const key of item.inputVariableIds)
      if (!variableIndex.has(key)) issue(path, `Missing connector input "${key}"`);
    for (const key of item.requiredEvidence)
      if (!app.evidenceIds.includes(key)) issue(path, `Missing evidence definition "${key}"`);

    const requiredEvents: StudioEvent[] =
      item.kind === "screen"
        ? item.timeoutMs === null
          ? ["submit", "cancel"]
          : ["submit", "cancel", "timer"]
        : item.kind === "connector"
          ? ["success", "failure"]
          : [];
    for (const event of requiredEvents) {
      const candidates = links.filter((link) => link.event === event);
      const fallbacks = candidates.filter((link) => link.guard === null);
      if (fallbacks.length !== 1 || candidates.at(-1)?.guard !== null) {
        issue(
          path,
          `"${event}" requires exactly one unconditional destination after all guarded branches`,
        );
      }
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const evidencePaths = new Map<string, Set<string>>();
  const visit = (id: string) => {
    if (active.has(id)) {
      issue(`nodes.${id}`, "A cycle is unbounded in runtime version 1");
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    active.add(id);
    for (const link of outgoing.get(id) ?? []) visit(link.to);
    active.delete(id);
  };
  if (app.entry) visit(app.entry);
  for (const item of app.nodes) {
    if (!visited.has(item.id)) issue(`nodes.${item.id}`, "Step is unreachable from the entry");
  }
  // Incoming paths must all have captured each required item. An unusable capture
  // (a missing value at run time) takes the workflow to an explicit blocked state.
  if (issues.length === 0 && app.entry) {
    const incoming = new Map<string, StudioTransition[]>();
    for (const link of app.transitions)
      incoming.set(link.to, [...(incoming.get(link.to) ?? []), link]);
    const capturedBefore = (nodeId: string): Set<string> => {
      const existing = evidencePaths.get(nodeId);
      if (existing) return existing;
      const paths = (incoming.get(nodeId) ?? []).map((link) => {
        const keys = new Set(capturedBefore(link.from));
        for (const effect of link.effects)
          if (effect.kind === "capture") keys.add(effect.evidenceId);
        return keys;
      });
      const shared = new Set(
        Array.from(paths[0] ?? []).filter((key) => paths.every((path) => path.has(key))),
      );
      evidencePaths.set(nodeId, shared);
      return shared;
    };
    for (const item of app.nodes) {
      for (const key of item.requiredEvidence) {
        if (!capturedBefore(item.id).has(key))
          issue(`nodes.${item.id}`, `Evidence "${key}" is not captured on every incoming path`);
      }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, app };
}

export function blankNode(id: string, name: string, kind: StudioNode["kind"]): StudioNode {
  return {
    id,
    name,
    kind,
    screenId: null,
    timeoutMs: null,
    connectorId: null,
    inputVariableIds: [],
    outcome: kind === "terminal" ? "complete" : null,
    requiredEvidence: [],
  };
}

export const widgetLabels: Record<StudioWidgetKind, string> = {
  instruction: "Instructions",
  text: "Text input",
  number: "Measurement",
  choice: "Choice",
  check: "Checklist item",
  scan: "Barcode input",
  action: "Action button",
  signal: "Signal display",
  alarm: "Alarm indicator",
  trend: "Signal trend",
  equipment: "Equipment status",
  connection: "Process link",
  countdown: "Countdown",
  evidence: "Evidence note",
  media: "Media",
  table: "Reference table",
};

export function makeWidget(id: string, kind: StudioWidgetKind, row: number): StudioWidget {
  return {
    id,
    kind,
    title: widgetLabels[kind],
    content: "",
    variableId: null,
    signalId: null,
    mediaId: null,
    event: "submit",
    choices: [],
    target: null,
    tolerance: null,
    unit: "",
    layouts: {
      panel: { column: 1, row, width: 6, height: 2 },
      tablet: { column: 1, row, width: 4, height: 2 },
      portrait: { column: 1, row, width: 4, height: 2 },
    },
  };
}

export function newStudioApplication(
  id: string,
  name: string,
  kind: StudioDefinition["kind"],
): StudioDefinition {
  const screenId = "welcome";
  const start = { ...blankNode("start", "Start", "screen"), screenId };
  return {
    schemaVersion: 1,
    runtimeVersion: 1,
    id,
    name,
    kind,
    theme: "system",
    offlinePolicy: "online-required",
    capabilities: [],
    dependencies: [],
    connectorIds: [],
    evidenceIds: [],
    variables: [],
    signals: [],
    media: [],
    components: [],
    screens: [
      {
        id: screenId,
        name: "Welcome",
        widgets: [
          {
            ...makeWidget("intro", "instruction", 1),
            content: "Review the work instructions before continuing.",
          },
        ],
      },
    ],
    nodes: [
      start,
      blankNode("done", "Work complete", "terminal"),
      { ...blankNode("cancelled", "Work cancelled", "terminal"), outcome: "cancelled" },
    ],
    entry: start.id,
    transitions: [
      { id: "complete-run", from: start.id, to: "done", event: "submit", guard: null, effects: [] },
      {
        id: "cancel-run",
        from: start.id,
        to: "cancelled",
        event: "cancel",
        guard: null,
        effects: [],
      },
    ],
  };
}
