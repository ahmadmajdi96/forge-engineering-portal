import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  blankNode,
  type StudioDefinition,
  type StudioEvent,
  type StudioNode,
  type StudioTransition,
  type StudioValue,
  type StudioVariable,
} from "@/lib/studio/model";
import { editorInput, Field, NumberField } from "./editor-fields";

const events: Record<StudioNode["kind"], StudioEvent[]> = {
  screen: ["submit", "cancel", "timer"],
  connector: ["success", "failure"],
  terminal: [],
};
const defaultValue = (type: StudioVariable["type"]): StudioValue =>
  type === "number" ? 0 : type === "boolean" ? false : "";

function ValueField({
  label,
  value,
  variable,
  change,
}: {
  label: string;
  value: StudioValue;
  variable?: StudioVariable | undefined;
  change: (value: StudioValue) => void;
}) {
  if (variable?.type === "number")
    return (
      <NumberField
        label={label}
        value={typeof value === "number" ? value : 0}
        onChange={(next) => change(next ?? 0)}
      />
    );
  if (variable?.type === "boolean")
    return (
      <Field label={label}>
        <select
          className={editorInput}
          value={value === true ? "true" : "false"}
          onChange={(event) => change(event.target.value === "true")}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </Field>
    );
  return (
    <Field label={label}>
      <input
        className={editorInput}
        maxLength={2048}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => change(event.target.value)}
      />
    </Field>
  );
}

function WorkflowMap({
  app,
  selected,
  select,
}: {
  app: StudioDefinition;
  selected: string | undefined;
  select: (id: string) => void;
}) {
  const maxColumns = 4;
  const pitchX = 190;
  const pitchY = 88;
  const position = new Map(
    app.nodes.map((node, index) => [
      node.id,
      {
        x: 20 + (index % maxColumns) * pitchX,
        y: 16 + Math.floor(index / maxColumns) * pitchY,
      },
    ]),
  );
  const width = 20 + Math.min(maxColumns, app.nodes.length) * pitchX;
  const height = 16 + Math.ceil(app.nodes.length / maxColumns) * pitchY;
  return (
    <div
      className="overflow-auto rounded-md border border-border bg-background p-1"
      aria-label="Workflow graph"
    >
      <div className="relative" style={{ width, height }}>
        <svg
          className="pointer-events-none absolute inset-0 text-muted-foreground"
          width={width}
          height={height}
          aria-hidden="true"
        >
          {app.transitions.map((link) => {
            const from = position.get(link.from);
            const to = position.get(link.to);
            if (!from || !to) return null;
            const start = { x: from.x + 144, y: from.y + 24 };
            const end = { x: to.x, y: to.y + 24 };
            const gap = from.y === to.y && from.x < to.x ? start.y : Math.max(from.y, to.y) + 65;
            const color =
              link.event === "failure" || link.event === "cancel"
                ? "var(--destructive)"
                : undefined;
            return (
              <g
                key={link.id}
                stroke={color ?? "currentColor"}
                strokeWidth={link.from === selected ? 2 : 1}
                opacity={link.from === selected ? 1 : 0.55}
              >
                <path
                  d={`M ${start.x},${start.y} H ${start.x + 12} V ${gap} H ${end.x - 10} V ${end.y} H ${end.x}`}
                  fill="none"
                  strokeDasharray={link.guard ? "4 4" : undefined}
                />
                <path
                  d={`M ${end.x - 5},${end.y - 3} L ${end.x},${end.y} L ${end.x - 5},${end.y + 3}`}
                  fill="none"
                />
              </g>
            );
          })}
        </svg>
        {app.nodes.map((node) => {
          const point = position.get(node.id)!;
          return (
            <button
              type="button"
              key={node.id}
              aria-pressed={selected === node.id}
              onClick={() => select(node.id)}
              style={{ left: point.x, top: point.y, width: 144, minHeight: 48 }}
              className="absolute grid content-center rounded-md border border-border bg-card p-1.5 text-left text-xs hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary/10"
            >
              <span className="truncate font-semibold">{node.name || "Unnamed step"}</span>
              <span className="text-muted-foreground">
                {node.id === app.entry ? "Entry · " : ""}
                {node.kind}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StudioWorkflowEditor({
  app,
  setApp,
}: {
  app: StudioDefinition;
  setApp: (app: StudioDefinition) => void;
}) {
  const [selection, select] = useState(app.entry ?? "");
  const [newKind, setNewKind] = useState<StudioNode["kind"]>("screen");
  const active = app.nodes.find((node) => node.id === selection) ?? app.nodes[0];
  const writeNode = (node: StudioNode) =>
    setApp({ ...app, nodes: app.nodes.map((item) => (item.id === node.id ? node : item)) });
  const addNode = () => {
    const node = blankNode(
      crypto.randomUUID(),
      `${newKind[0]!.toUpperCase()}${newKind.slice(1)} step`,
      newKind,
    );
    setApp({
      ...app,
      nodes: [
        ...app.nodes,
        { ...node, screenId: newKind === "screen" ? (app.screens[0]?.id ?? null) : null },
      ],
      entry: app.entry ?? (node.kind === "screen" ? node.id : null),
    });
    select(node.id);
  };
  const updateTransition = (edge: StudioTransition) =>
    setApp({
      ...app,
      transitions: app.transitions.map((item) => (item.id === edge.id ? edge : item)),
    });
  const addTransition = (from: StudioNode) => {
    const event = events[from.kind][0];
    const to = app.nodes.find((item) => item.id !== from.id);
    if (!event || !to) return;
    setApp({
      ...app,
      transitions: [
        ...app.transitions,
        { id: crypto.randomUUID(), from: from.id, to: to.id, event, guard: null, effects: [] },
      ],
    });
  };
  const move = (index: number, direction: -1 | 1) => {
    const transitions = [...app.transitions];
    const match = transitions[index]!;
    let target = index + direction;
    while (target >= 0 && target < transitions.length && transitions[target]!.from !== match.from)
      target += direction;
    if (target < 0 || target >= transitions.length) return;
    [transitions[index], transitions[target]] = [transitions[target]!, match];
    setApp({ ...app, transitions });
  };

  return (
    <div className="grid gap-3">
      <section className="eng-panel grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Workflow graph</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a step to edit its behavior and outgoing paths.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <Field label="Step type">
              <select
                className={editorInput}
                value={newKind}
                onChange={(event) => setNewKind(event.target.value as StudioNode["kind"])}
              >
                <option value="screen">Interactive screen</option>
                <option value="connector">Connector action</option>
                <option value="terminal">End step</option>
              </select>
            </Field>
            <Button
              type="button"
              variant="outline"
              onClick={addNode}
              disabled={app.nodes.length >= 100}
            >
              <Plus />
              Add step
            </Button>
          </div>
        </div>
        {app.nodes.length ? (
          <WorkflowMap app={app} selected={active?.id} select={select} />
        ) : (
          <p className="text-sm text-muted-foreground">Add an interactive entry step.</p>
        )}
      </section>
      {active && (
        <>
          <section className="eng-panel grid gap-3">
            <h3 className="text-sm font-semibold">Step settings</h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Step name">
                <input
                  className={editorInput}
                  value={active.name}
                  maxLength={120}
                  onChange={(event) => writeNode({ ...active, name: event.target.value })}
                />
              </Field>
              <Field label="Display screen">
                <select
                  className={editorInput}
                  value={active.screenId ?? ""}
                  onChange={(event) =>
                    writeNode({ ...active, screenId: event.target.value || null })
                  }
                >
                  <option value="">No screen</option>
                  {app.screens.map((screen) => (
                    <option key={screen.id} value={screen.id}>
                      {screen.name}
                    </option>
                  ))}
                </select>
              </Field>
              {active.kind !== "terminal" && (
                <NumberField
                  label="Timeout in milliseconds"
                  value={active.timeoutMs}
                  min={250}
                  max={600_000}
                  step={1}
                  onChange={(timeoutMs) => writeNode({ ...active, timeoutMs })}
                />
              )}
              {active.kind === "terminal" && (
                <Field label="Outcome">
                  <select
                    className={editorInput}
                    value={active.outcome ?? ""}
                    onChange={(event) =>
                      writeNode({ ...active, outcome: event.target.value as StudioNode["outcome"] })
                    }
                  >
                    <option value="complete">Complete</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
              )}
              {active.kind === "connector" && (
                <Field label="Connector">
                  <select
                    className={editorInput}
                    value={active.connectorId ?? ""}
                    onChange={(event) =>
                      writeNode({ ...active, connectorId: event.target.value || null })
                    }
                  >
                    <option value="">Select connector</option>
                    {app.connectorIds.map((id) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                </Field>
              )}
              {active.kind === "connector" && (
                <Field label="Connector input variables" hint="Select one or more inputs.">
                  <select
                    multiple
                    className={editorInput}
                    value={active.inputVariableIds}
                    onChange={(event) =>
                      writeNode({
                        ...active,
                        inputVariableIds: Array.from(
                          event.target.selectedOptions,
                          (item) => item.value,
                        ),
                      })
                    }
                  >
                    {app.variables.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {app.evidenceIds.length > 0 && (
                <Field label="Required evidence before entry">
                  <select
                    multiple
                    className={editorInput}
                    value={active.requiredEvidence}
                    onChange={(event) =>
                      writeNode({
                        ...active,
                        requiredEvidence: Array.from(
                          event.target.selectedOptions,
                          (item) => item.value,
                        ),
                      })
                    }
                  >
                    {app.evidenceIds.map((id) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {active.kind === "screen" && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={active.id === app.entry}
                  onClick={() => setApp({ ...app, entry: active.id })}
                >
                  Use as entry step
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setApp({
                    ...app,
                    entry: app.entry === active.id ? null : app.entry,
                    nodes: app.nodes.filter((item) => item.id !== active.id),
                    transitions: app.transitions.filter(
                      (link) => link.from !== active.id && link.to !== active.id,
                    ),
                  });
                  select("");
                }}
              >
                <Trash2 />
                Remove step
              </Button>
            </div>
          </section>
          {active.kind !== "terminal" && (
            <section className="eng-panel grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Outgoing paths</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Guards run in this order. Give each event a final fallback.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => addTransition(active)}
                  disabled={app.transitions.length >= 400 || app.nodes.length < 2}
                >
                  <Plus />
                  Add path
                </Button>
              </div>
              {app.transitions.map(
                (edge, index) =>
                  edge.from === active.id && (
                    <section
                      key={edge.id}
                      aria-label={`Path to ${app.nodes.find((node) => node.id === edge.to)?.name ?? "missing step"}`}
                      className="grid gap-2 rounded-md border border-border bg-background p-3"
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <Field label="Event">
                          <select
                            className={editorInput}
                            value={edge.event}
                            onChange={(event) =>
                              updateTransition({
                                ...edge,
                                event: event.target.value as StudioEvent,
                              })
                            }
                          >
                            {events[active.kind].map((event) => (
                              <option key={event}>{event}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Destination">
                          <select
                            className={editorInput}
                            value={edge.to}
                            onChange={(event) =>
                              updateTransition({ ...edge, to: event.target.value })
                            }
                          >
                            {app.nodes
                              .filter((item) => item.id !== active.id)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <div className="ml-auto flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Move path up"
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Move path down"
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove path"
                            onClick={() =>
                              setApp({
                                ...app,
                                transitions: app.transitions.filter((item) => item.id !== edge.id),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <GuardEditor app={app} edge={edge} change={updateTransition} />
                      <EffectsEditor app={app} edge={edge} change={updateTransition} />
                    </section>
                  ),
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function GuardEditor({
  app,
  edge,
  change,
}: {
  app: StudioDefinition;
  edge: StudioTransition;
  change: (edge: StudioTransition) => void;
}) {
  type Guard = NonNullable<StudioTransition["guard"]>;
  const guard = edge.guard;
  const variable = app.variables.find((item) => item.id === guard?.variableId);
  const operator = guard?.operator ?? "";
  const buildGuard = (operator: Guard["operator"], variable: StudioVariable): Guard => {
    if (operator === "present") return { operator, variableId: variable.id };
    if (operator === "withinTolerance") {
      const widget = app.screens
        .flatMap((screen) => screen.widgets)
        .find((item) => item.kind === "number" && item.variableId === variable.id);
      return { operator, variableId: variable.id, widgetId: widget?.id ?? "unset" };
    }
    if (operator === "atLeast" || operator === "atMost")
      return { operator, variableId: variable.id, value: 0, unit: variable.unit };
    return {
      operator,
      variableId: variable.id,
      value: defaultValue(variable.type),
      unit: variable.unit,
    };
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <Field label="Guard">
        <select
          className={editorInput}
          value={operator}
          onChange={(event) => {
            const selected = event.target.value as Guard["operator"];
            const candidate = variable ?? app.variables[0];
            change({
              ...edge,
              guard: selected && candidate ? buildGuard(selected, candidate) : null,
            });
          }}
        >
          <option value="">Fallback</option>
          <option value="present" disabled={!app.variables.length}>
            Value present
          </option>
          <option value="equals" disabled={!app.variables.length}>
            Equals
          </option>
          <option value="atLeast" disabled={!app.variables.length}>
            At least
          </option>
          <option value="atMost" disabled={!app.variables.length}>
            At most
          </option>
          <option value="withinTolerance" disabled={!app.variables.length}>
            Within measurement tolerance
          </option>
        </select>
      </Field>
      {guard && (
        <Field label="Guard variable">
          <select
            className={editorInput}
            value={guard.variableId}
            onChange={(event) => {
              const variable = app.variables.find((item) => item.id === event.target.value);
              if (variable) change({ ...edge, guard: buildGuard(guard.operator, variable) });
            }}
          >
            <option value="" disabled>
              Select variable
            </option>
            {app.variables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {guard?.operator === "equals" && (
        <ValueField
          label="Expected value"
          value={guard.value}
          variable={variable}
          change={(value) => change({ ...edge, guard: { ...guard, value } })}
        />
      )}
      {(guard?.operator === "atLeast" || guard?.operator === "atMost") && (
        <NumberField
          label={`Threshold ${guard.unit}`}
          value={guard.value}
          onChange={(value) => change({ ...edge, guard: { ...guard, value: value ?? 0 } })}
        />
      )}
      {guard?.operator === "withinTolerance" && (
        <Field label="Measurement component">
          <select
            className={editorInput}
            value={guard.widgetId}
            onChange={(event) =>
              change({ ...edge, guard: { ...guard, widgetId: event.target.value } })
            }
          >
            <option value="unset">Select measurement</option>
            {app.screens
              .flatMap((screen) => screen.widgets)
              .filter((item) => item.kind === "number" && item.variableId === guard.variableId)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </Field>
      )}
    </div>
  );
}

function EffectsEditor({
  app,
  edge,
  change,
}: {
  app: StudioDefinition;
  edge: StudioTransition;
  change: (edge: StudioTransition) => void;
}) {
  const firstVariable = app.variables[0];
  const firstEvidence = app.evidenceIds[0];
  const setEffect = (index: number, next: StudioTransition["effects"][number]) =>
    change({
      ...edge,
      effects: edge.effects.map((item, position) => (position === index ? next : item)),
    });
  return (
    <>
      {edge.effects.map((effect, index) => {
        const variable = app.variables.find((item) => item.id === effect.variableId);
        return (
          <div
            key={index}
            className="grid items-end gap-2 rounded border border-border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Field label={effect.kind === "set" ? "Set variable" : "Capture variable"}>
              <select
                className={editorInput}
                value={effect.variableId}
                onChange={(event) => {
                  const item = app.variables.find((item) => item.id === event.target.value);
                  if (item)
                    setEffect(
                      index,
                      effect.kind === "set"
                        ? { ...effect, variableId: item.id, value: defaultValue(item.type) }
                        : { ...effect, variableId: item.id },
                    );
                }}
              >
                {app.variables.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            {effect.kind === "set" ? (
              <ValueField
                label="New value"
                value={effect.value}
                variable={variable}
                change={(value) => setEffect(index, { ...effect, value })}
              />
            ) : (
              <Field label="Evidence key">
                <select
                  className={editorInput}
                  value={effect.evidenceId}
                  onChange={(event) =>
                    setEffect(index, { ...effect, evidenceId: event.target.value })
                  }
                >
                  {app.evidenceIds.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
              </Field>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove effect"
              onClick={() =>
                change({
                  ...edge,
                  effects: edge.effects.filter((_, position) => position !== index),
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
      {firstVariable && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={edge.effects.length >= 30}
            onClick={() =>
              change({
                ...edge,
                effects: [
                  ...edge.effects,
                  {
                    kind: "set",
                    variableId: firstVariable.id,
                    value: defaultValue(firstVariable.type),
                  },
                ],
              })
            }
          >
            Add variable update
          </Button>
          {firstEvidence && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={edge.effects.length >= 30}
              onClick={() =>
                change({
                  ...edge,
                  effects: [
                    ...edge.effects,
                    { kind: "capture", variableId: firstVariable.id, evidenceId: firstEvidence },
                  ],
                })
              }
            >
              Add evidence capture
            </Button>
          )}
        </div>
      )}
    </>
  );
}
