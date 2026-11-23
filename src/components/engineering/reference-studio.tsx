import { useState, type ReactNode } from "react";
import { StudioScope } from "./studio-scope";
import { appWorkflow, setAppWorkflow, workflowIssues } from "@/lib/engineering/model";
import { type DesignRecord, upsertDesignRecord } from "@/lib/engineering/design-records";
type ScopedProps = { record: DesignRecord; selector: ReactNode };

import { Link } from "@tanstack/react-router";
import {
  Barcode,
  CheckSquare,
  Weight,
  FileText,
  Network,
  User,
  Bell,
  Play,
  Check,
  Send,
  Trash2,
  Plus,
  Undo2,
  Monitor,
  Tablet,
  Image,
  MousePointer,
  Layers,
  Save,
  ShieldCheck,
  Thermometer,
  Gauge,
  Settings2,
  Search,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { type EngineeringModel } from "@/lib/engineering/model";
import {
  Surface,
  ReferencePage,
  RefTabs,
  KeyValues,
  Notice,
  Badge,
  DraftDialog,
} from "./reference-ui";
import { AddRecord, RecordActions, useRecords } from "./record-editor";
import { toast } from "sonner";

const palette = [
  ["Scan / Read", "Capture barcode, QR or RFID", Barcode],
  ["Verify", "Check rules, eligibility or data", CheckSquare],
  ["Weigh", "Read and validate weight", Weight],
  ["Record", "Create a consumption or event record", FileText],
  ["Decision", "Branch by condition (e.g., eligible)", Network],
  ["Task", "Create a user task (e.g., hold, review)", User],
  ["Notify / Call", "Alert or call a supervisor", Bell],
] as const;
export function WorkflowDesigner() {
  return (
    <StudioScope kind="app">
      {(record, selector) => <WorkflowEditor record={record} selector={selector} />}
    </StudioScope>
  );
}
function WorkflowEditor({ record, selector }: ScopedProps) {
  const { model: workspace, setModel: saveModel } = useEngineering();
  const draft = appWorkflow(workspace, record.id);
  const model = { ...workspace, ...draft };
  const issues = workflowIssues(model, draft);
  function setModel(next: EngineeringModel) {
    saveModel(
      setAppWorkflow(workspace, record.id, {
        steps: next.steps,
        offline: next.offline,
        offlineMinutes: next.offlineMinutes,
      }),
    );
  }
  const [tab, setTab] = useState("Workflow"),
    [selected, setSelected] = useState(model.steps[2]?.id ?? ""),
    [dialog, setDialog] = useState(false),
    [preview, setPreview] = useState<number | null>(null),
    [history, setHistory] = useState<EngineeringModel[]>([]);
  const step = model.steps.find((s) => s.id === selected) ?? model.steps[0];
  function commit(next: EngineeringModel) {
    setHistory([...history, model]);
    setModel(next);
  }
  function patch(p: Partial<EngineeringModel["steps"][number]>) {
    if (step)
      commit({ ...model, steps: model.steps.map((s) => (s.id === step.id ? { ...s, ...p } : s)) });
  }
  return (
    <ReferencePage
      title={record.name + " · " + record.version}
      sub={record.description || "Edit and validate the application workflow"}
      crumb="Edge App Studio"
      actions={
        <>
          <Badge tone="cyan">Preview sandbox / no equipment writes</Badge>
          <Button
            variant="outline"
            disabled={!model.steps.length}
            onClick={() => {
              setPreview(0);
              setTab("Tests");
            }}
          >
            <Play size={15} />
            Walk through steps
          </Button>
          <Button variant="outline" onClick={() => setTab("Tests")}>
            <Check size={15} />
            Validate
          </Button>
          <Button onClick={() => setDialog(true)}>
            <Send size={15} />
            Save draft
          </Button>
        </>
      }
    >
      {selector}
      <RefTabs
        items={["Workflow", "Screens", "Bindings", "Permissions", "Offline policy", "Tests"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "Workflow" ? (
        <div className="new-studio-grid">
          <Surface title="Step palette" sub="Select a step to add it, or drag it onto the canvas">
            <div className="new-palette">
              {palette.map(([name, desc, Icon]) => (
                <Button
                  variant="outline"
                  draggable
                  key={name}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", name)}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...model,
                      steps: [
                        ...model.steps,
                        {
                          id,
                          label: name,
                          kind: name,
                          signal: "",
                          evidence: true,
                          timeout: 60,
                          failure: true,
                        },
                      ],
                    });
                    setSelected(id);
                  }}
                >
                  <Icon size={23} />
                  <span>
                    <strong>{name}</strong>
                    <small>{desc}</small>
                  </span>
                  <Plus size={12} />
                </Button>
              ))}
            </div>
          </Surface>
          <Surface
            title="Workflow canvas"
            sub="Material flow (design time)"
            actions={
              <Button
                variant="ghost"
                size="icon"
                title="Undo"
                disabled={!history.length}
                onClick={() => {
                  const prev = history.at(-1);
                  if (prev) {
                    setModel(prev);
                    setHistory(history.slice(0, -1));
                  }
                }}
              >
                <Undo2 size={16} />
              </Button>
            }
          >
            <div
              className="new-workflow-canvas"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const kind = e.dataTransfer.getData("text/plain");
                if (!kind) return;
                const id = crypto.randomUUID();
                commit({
                  ...model,
                  steps: [
                    ...model.steps,
                    {
                      id,
                      label: kind,
                      kind,
                      signal: "",
                      evidence: true,
                      timeout: 60,
                      failure: true,
                    },
                  ],
                });
                setSelected(id);
              }}
            >
              <div className="new-workflow-main">
                <span className="new-start">
                  <Play size={14} />
                  Start
                </span>
                {model.steps.map((s) => (
                  <div className="new-workflow-step" key={s.id}>
                    <span className="new-down-arrow">↓</span>
                    <Button
                      variant="outline"
                      className={step?.id === s.id ? "is-selected" : ""}
                      onClick={() => setSelected(s.id)}
                    >
                      <CheckSquare size={17} />
                      {s.label}
                    </Button>
                  </div>
                ))}
                <span className="new-down-arrow">↓</span>
                <span className="new-start end">
                  <Check size={15} />
                  End
                </span>
              </div>
              {step && (
                <div className="new-workflow-exception">
                  <Badge>{step.label}</Badge>
                  <span>↓</span>
                  <div>
                    {step.timeout > 0 ? "Timeout · " + step.timeout + " s" : "Timeout missing"}
                  </div>
                  <span>↓</span>
                  <div className={step.failure ? "" : "blocked"}>
                    {step.failure ? "Failure path enabled" : "Failure path missing"}
                  </div>
                  <Badge>{step.evidence ? "Evidence required" : "Evidence optional"}</Badge>
                </div>
              )}
            </div>
          </Surface>
          <Surface title="Selected step">
            {step ? (
              <>
                <div className="new-selected-step">
                  <Weight size={22} />
                  {step.label}
                </div>
                <label>
                  Step label
                  <input
                    aria-label="Workflow step label"
                    value={step.label}
                    onChange={(e) => patch({ label: e.target.value })}
                  />
                </label>
                {(/weigh/i.test(step.kind) ||
                  step.weightTarget !== undefined ||
                  step.weightTolerance !== undefined) && (
                  <div className="ref-form-grid">
                    <label>
                      Weight target
                      <input
                        aria-label="Weight target"
                        type="number"
                        step="any"
                        value={step.weightTarget ?? ""}
                        onChange={(e) =>
                          patch({
                            weightTarget:
                              e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Tolerance (±)
                      <input
                        aria-label="Weight tolerance"
                        type="number"
                        step="any"
                        min="0"
                        value={step.weightTolerance ?? ""}
                        onChange={(e) =>
                          patch({
                            weightTolerance:
                              e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                <label>
                  Semantic signal
                  <select
                    aria-label="Workflow signal"
                    value={step.signal}
                    onChange={(e) => patch({ signal: e.target.value })}
                  >
                    <option value="">None</option>
                    {model.signals.map((s) => (
                      <option key={s.key}>{s.key}</option>
                    ))}
                  </select>
                </label>
                <label className="dyn-checkbox">
                  <input
                    type="checkbox"
                    aria-label="Required workflow evidence"
                    checked={step.evidence}
                    onChange={(e) => patch({ evidence: e.target.checked })}
                  />
                  <span>
                    <b>No completion without evidence</b>
                    <small>Capture evidence for this workflow step.</small>
                  </span>
                </label>
                <label className="dyn-checkbox">
                  <input
                    type="checkbox"
                    checked={step.failure}
                    onChange={(e) => patch({ failure: e.target.checked })}
                  />
                  Failure and escalation path
                </label>
                <label>
                  Timeout (seconds)
                  <input
                    type="number"
                    aria-label="Workflow timeout"
                    min="1"
                    value={step.timeout}
                    onChange={(e) => patch({ timeout: Number(e.target.value) })}
                  />
                </label>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    commit({ ...model, steps: model.steps.filter((s) => s.id !== step.id) })
                  }
                >
                  <Trash2 size={15} />
                  Remove step
                </Button>
              </>
            ) : (
              <p>No steps. Add one from the palette.</p>
            )}
          </Surface>
        </div>
      ) : tab === "Screens" ? (
        <Surface title="Application screen editor">
          <Button asChild>
            <Link to="/screen-editor" search={{ app: record.id }}>
              <Monitor size={16} />
              Open screen editor
            </Link>
          </Button>
        </Surface>
      ) : tab === "Bindings" ? (
        <Surface title="Typed semantic bindings">
          <KeyValues
            items={model.signals.map((s) => [s.key, `${s.type} · ${s.unit} · ${s.address}`])}
          />
        </Surface>
      ) : tab === "Offline policy" ? (
        <Surface title="Offline policy">
          <label>
            Execution mode
            <select
              value={model.offline}
              onChange={(e) =>
                setModel({ ...model, offline: e.target.value as typeof model.offline })
              }
            >
              {["online-required", "bounded-offline", "read-only-offline"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Bounded minutes
            <input
              type="number"
              min="0"
              value={model.offlineMinutes}
              onChange={(e) => setModel({ ...model, offlineMinutes: Number(e.target.value) })}
            />
          </label>
          <Notice>
            Site-authorized execution and expiring material authorization remain mandatory.
          </Notice>
        </Surface>
      ) : tab === "Tests" ? (
        <Surface title="Design-time validation">
          {!model.steps.length ? (
            <Notice>Add a workflow step to begin validation.</Notice>
          ) : (
            !issues.length && <Notice>Configured steps passed the design checks.</Notice>
          )}
          {issues.map((issue) => (
            <Button
              variant="outline"
              key={issue.id}
              onClick={() => {
                if (issue.category === "Policy") setTab("Offline policy");
                else {
                  setSelected(issue.object);
                  setTab("Workflow");
                }
              }}
            >
              {issue.object} · {issue.message}
            </Button>
          ))}
          <Notice>Production runtime has not been commissioned.</Notice>
        </Surface>
      ) : (
        <Surface title="Permissions">
          <KeyValues
            items={[
              ["Author", "Process engineer"],
              ["Review", "Server-verified Hub scope required"],
              ["Production command", "Not available from preview"],
            ]}
          />
        </Surface>
      )}
      {tab === "Tests" && (
        <Surface title="Workflow walkthrough">
          {preview === null ? (
            <p>Choose Walk through steps to inspect the authored sequence.</p>
          ) : (
            <div className="space-y-3">
              <p role="status">
                {model.steps[preview]
                  ? "Step " +
                    (preview + 1) +
                    " of " +
                    model.steps.length +
                    " · " +
                    model.steps[preview]?.label
                  : "Walkthrough complete"}
              </p>
              {model.steps[preview] && (
                <Button onClick={() => setPreview(preview + 1)}>Next step</Button>
              )}
              <Button variant="outline" onClick={() => setPreview(null)}>
                Close walkthrough
              </Button>
            </div>
          )}
        </Surface>
      )}
      <DraftDialog open={dialog} onClose={() => setDialog(false)} />
    </ReferencePage>
  );
}

export function ScreenEditor() {
  return (
    <StudioScope kind="operator">
      {(record, selector) => <ScreenWorkspace record={record} selector={selector} />}
    </StudioScope>
  );
}
function ScreenWorkspace({ record, selector }: ScopedProps) {
  const { model, setModel } = useEngineering();
  const { rows: widgets, put } = useRecords("widget");
  const rows = widgets.filter((w) => w.parent === record.id);
  const [active, setActive] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [completed, setCompleted] = useState(false),
    [dialog, setDialog] = useState(false),
    [previous, setPrevious] = useState<DesignRecord | null>(null);
  const variant = record.breakpoint ?? "Tablet (1280 × 800)";
  function setVariant(value: string) {
    if (value === "Tablet (1280 × 800)" || value === "Industrial panel (1920 × 1080)")
      setModel({
        ...model,
        records: upsertDesignRecord(model.records, { ...record, breakpoint: value }),
      });
  }
  const component = rows.find((w) => w.id === active) ?? rows[0];
  function patch(p: Partial<NonNullable<typeof component>>) {
    if (component) {
      setPrevious(component);
      put({ ...component, ...p });
    }
  }
  return (
    <ReferencePage
      title={record.name + " · " + record.version}
      sub="Operator screen editor"
      actions={
        <>
          <Badge tone="cyan">Sandbox preview — no production writes</Badge>
          <Button
            variant="outline"
            disabled={!previous}
            onClick={() => {
              if (previous) put(previous);
              setPrevious(null);
            }}
          >
            <Undo2 size={16} />
            Undo
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setConfirmed(false);
              setCompleted(false);
            }}
          >
            <Play size={16} />
            Preview
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.info(
                rows.length && rows.every((w) => w.name.trim())
                  ? "All components have labels."
                  : "Add a labeled component before checking this screen.",
              )
            }
          >
            <User size={16} />
            Check labels
          </Button>
          <Button onClick={() => setDialog(true)}>
            <Save size={16} />
            Save draft
          </Button>
        </>
      }
    >
      {selector}
      <div className="ref-route-summary">
        {[
          ["Plant", model.scope],
          ["Line", model.name],
          ["Screen", record.name],
          ["Version", record.version],
          ["State", "Draft"],
        ].map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <strong>{v}</strong>
          </div>
        ))}
        <Notice>Engineering drafts are separate from live production.</Notice>
      </div>
      <div className="new-screen-grid">
        <Surface title="Component Library" sub="Select a component to add it to this screen">
          <div className="new-palette">
            {[
              ["Scan input", "Capture or type a code (e.g., WO, lot)", Barcode],
              ["Instruction", "Display an operator instruction", FileText],
              ["Weight reading", "Show a measured weight with units", Weight],
              ["Evidence card", "Capture or attach a photo", Image],
              ["Action button", "Trigger a guided action", MousePointer],
            ].map(([name, desc, Icon]) => {
              const I = Icon as typeof Weight;
              return (
                <Button
                  variant="outline"
                  key={String(name)}
                  onClick={() => {
                    const id = "WIDGET-" + crypto.randomUUID().slice(0, 7);
                    put({
                      id,
                      kind: "widget",
                      name: String(name),
                      description: String(desc),
                      parent: record.id,
                      version: record.version,
                      binding: "",
                      unit: "",
                      value: "",
                      required: false,
                      archived: false,
                    });
                    setActive(id);
                  }}
                >
                  <I size={24} />
                  <span>
                    <strong>{String(name)}</strong>
                    <small>{String(desc)}</small>
                  </span>
                </Button>
              );
            })}
          </div>
        </Surface>
        <Surface
          title={
            <>
              <Monitor size={20} />
              {variant}
            </>
          }
          actions={
            <select
              aria-label="Screen variant"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
            >
              <option>Tablet (1280 × 800)</option>
              <option>Industrial panel (1920 × 1080)</option>
            </select>
          }
        >
          <div className="new-tablet">
            <div className="new-tablet-header">
              {record.name}{" "}
              <small>
                {model.scope} · {model.name}
              </small>
            </div>
            <div className="new-tablet-body">
              <div className="new-instruction">
                <Monitor size={20} />
                {rows.length
                  ? "Select a component to edit its binding and preview value."
                  : "Add a component to start this screen."}
              </div>
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: variant.startsWith("Industrial")
                    ? "repeat(auto-fit,minmax(min(13rem,100%),1fr))"
                    : "1fr",
                }}
              >
                {rows.map((w) => (
                  <Button
                    key={w.id}
                    aria-pressed={component?.id === w.id}
                    variant="outline"
                    className={
                      "new-custom-widget h-auto flex-wrap justify-between gap-2 px-3 py-2 " +
                      (component?.id === w.id ? "is-selected" : "")
                    }
                    onClick={() => setActive(w.id)}
                  >
                    <span>{w.name}</span>
                    <strong className="whitespace-normal">
                      {w.value || "—"} {w.unit}
                    </strong>
                  </Button>
                ))}
              </div>
              <label className="dyn-checkbox new-confirm">
                <input
                  aria-label="Confirm screen preview"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Confirm this screen preview.<Badge tone="bad">Required</Badge>
              </label>
              <div className="ref-actions">
                <Button
                  disabled={!rows.length || !confirmed || completed}
                  onClick={() => setCompleted(true)}
                >
                  <Check size={16} />
                  {completed ? "Completed (sandbox)" : "Complete"}
                </Button>
                <span className="ref-sub">
                  {confirmed ? "Sandbox preview only" : "Confirm instruction first."}
                </span>
              </div>
            </div>
          </div>
        </Surface>
        <aside className="ref-stack">
          <Surface title={`Component: ${component?.name ?? "None"}`}>
            {component && (
              <>
                <label>
                  Component name
                  <input
                    aria-label="Widget name"
                    value={component.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label>
                  Source
                  <input
                    aria-label="Widget binding"
                    value={component.binding}
                    onChange={(e) => patch({ binding: e.target.value })}
                  />
                </label>
                <label>
                  Unit
                  <input
                    aria-label="Widget unit"
                    value={component.unit}
                    onChange={(e) => patch({ unit: e.target.value })}
                  />
                </label>
                <label>
                  Example / configured value
                  <input
                    aria-label="Widget value"
                    value={component.value}
                    onChange={(e) => patch({ value: e.target.value })}
                  />
                </label>
                <label className="dyn-checkbox">
                  <input
                    type="checkbox"
                    checked={component.required}
                    onChange={(e) => patch({ required: e.target.checked })}
                  />
                  Required evidence
                </label>
                <RecordActions record={component} />
              </>
            )}
          </Surface>
          <Surface title="Breakpoints (screen variants)">
            <Button
              variant="outline"
              className="ref-full-button"
              onClick={() => setVariant("Tablet (1280 × 800)")}
            >
              <Tablet size={18} />
              Tablet 1280 × 800
            </Button>
            <Button
              variant="outline"
              className="ref-full-button"
              onClick={() => setVariant("Industrial panel (1920 × 1080)")}
            >
              <Monitor size={18} />
              Industrial panel 1920 × 1080
            </Button>
          </Surface>
        </aside>
      </div>
      <DraftDialog open={dialog} onClose={() => setDialog(false)} />
    </ReferencePage>
  );
}

export function HmiDesigner() {
  return (
    <StudioScope kind="hmi">
      {(record, selector) => <HmiWorkspace record={record} selector={selector} />}
    </StudioScope>
  );
}
function HmiWorkspace({ record, selector }: ScopedProps) {
  const { model, setModel } = useEngineering();
  const { rows: all, put } = useRecords("widget");
  const rows = all.filter((w) => w.parent === record.id);
  const [active, setActive] = useState(""),
    [tab, setTab] = useState("Screens"),
    [ack, setAck] = useState(false),
    [dialog, setDialog] = useState(false),
    [q, setQ] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const unbound = rows.filter(
    (r) => !r.binding || !model.signals.some((signal) => signal.key === r.binding),
  );
  const widget = rows.find((w) => w.id === active) ?? rows[0];
  const patch = (p: Partial<NonNullable<typeof widget>>) => {
    if (widget) put({ ...widget, ...p });
  };
  const display = [
    "Value tile",
    "Numeric display",
    "Status indicator",
    "Text label",
    "Vessel / Tank",
    "Pump / Motor",
    "Valve",
    "Pipe",
    "Flow indicator",
  ];
  return (
    <ReferencePage
      title={"HMI Designer · " + record.name}
      sub={`Assigned scope · ${record.parent} · ${record.version}`}
      actions={
        <>
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Play size={16} />
            Preview sandbox
          </Button>
          <Button variant="outline" onClick={() => setTab("Tests")}>
            <Check size={16} />
            Validate
          </Button>
          <Button onClick={() => setDialog(true)}>
            <Send size={16} />
            Save draft
          </Button>
        </>
      }
    >
      {selector}
      {record.diagram === "mixing-vessel" && (
        <div className="new-alarm">
          <AlertTriangle size={18} />
          <b>Alarm (Simulated)</b>
          <span>
            Training scenario · High pressure · Status:{" "}
            {ack ? "Acknowledged (sandbox)" : "Awaiting acknowledgement"}
          </span>
          <Button variant="outline" size="sm" disabled={ack} onClick={() => setAck(true)}>
            <Check size={15} />
            Acknowledge
          </Button>
        </div>
      )}
      <RefTabs
        items={["Screens", "Signals", "Alarm presentation", "Permissions", "Tests"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "Screens" ? (
        <div className="new-hmi-grid">
          <Surface title="Component palette">
            <label className="ref-search">
              <Search size={15} />
              <input
                aria-label="Search HMI components"
                placeholder="Search components…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <div className="new-hmi-palette">
              {display
                .filter((x) => x.toLowerCase().includes(q.toLowerCase()))
                .map((name) => (
                  <Button
                    variant="outline"
                    key={name}
                    onClick={() => {
                      const id = "HMI-" + crypto.randomUUID().slice(0, 7);
                      put({
                        id,
                        kind: "widget",
                        name,
                        parent: record.id,
                        version: record.version,
                        binding: "",
                        description: "",
                        unit: "",
                        value: "",
                        required: false,
                        archived: false,
                      });
                      setActive(id);
                    }}
                  >
                    <Plus size={14} />
                    {name}
                  </Button>
                ))}
            </div>
          </Surface>
          <Surface title="Screen: Main (Overview)" actions={<Badge>Fit 100%</Badge>}>
            <div className="new-hmi-canvas">
              <h2>
                {record.name} <Badge>Display preview</Badge>
              </h2>
              <div className="new-hmi-scene">
                {record.diagram === "mixing-vessel" && (
                  <svg
                    className="new-vessel"
                    viewBox="0 0 300 300"
                    role="img"
                    aria-label="Mixing vessel process graphic"
                  >
                    <defs>
                      <linearGradient id="tank-fill">
                        <stop stopColor="var(--engineering-muted)" />
                        <stop offset="0.5" stopColor="var(--engineering-surface)" />
                        <stop offset="1" stopColor="var(--engineering-muted)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M20 125H65Q75 125 75 138V150H99M219 241H248V225H282"
                      fill="none"
                      stroke="var(--engineering-muted)"
                      strokeWidth="9"
                    />
                    <path
                      d="M112 265V295M207 265V295"
                      stroke="var(--engineering-muted)"
                      strokeWidth="11"
                    />
                    <rect
                      x="133"
                      y="28"
                      width="54"
                      height="34"
                      rx="7"
                      fill="var(--engineering-muted)"
                    />
                    <text
                      x="160"
                      y="50"
                      textAnchor="middle"
                      fill="var(--engineering-canvas)"
                      fontSize="18"
                    >
                      M
                    </text>
                    <path d="M160 61V245" stroke="var(--engineering-muted)" strokeWidth="9" />
                    <path
                      d="M101 119Q160 89 220 119V256Q160 286 101 256Z"
                      fill="url(#tank-fill)"
                      stroke="var(--engineering-muted)"
                      strokeWidth="4"
                    />
                    <path
                      d="M104 180Q162 166 217 181V255Q160 280 104 254Z"
                      fill="var(--primary)"
                      opacity=".55"
                    />
                    <ellipse cx="160" cy="181" rx="57" ry="8" fill="var(--primary)" opacity=".7" />
                    <path
                      d="M160 77V234M136 226L183 241M183 226L136 241"
                      stroke="var(--engineering-muted)"
                      strokeWidth="7"
                    />
                    <text x="12" y="108" fill="var(--engineering-text)" fontSize="11">
                      Inlet
                    </text>
                    <text x="237" y="209" fill="var(--engineering-text)" fontSize="10">
                      To Extruder
                    </text>
                  </svg>
                )}
                <div className="new-hmi-values">
                  {rows.map((w, i) => {
                    const Icon = [Thermometer, Gauge, Settings2, CheckCircle2][i] ?? Monitor;
                    return (
                      <Button
                        variant="outline"
                        className={widget?.id === w.id ? "is-selected" : ""}
                        key={w.id}
                        onClick={() => setActive(w.id)}
                      >
                        <Icon size={28} />
                        <span>
                          <small>{w.name}</small>
                          <strong>
                            {w.value || "—"} {w.unit}
                          </strong>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="ref-sub">Canvas: 1280 × 720 | Screen: Main (Overview) | Simulated</p>
          </Surface>
          <Surface title="Binding inspector">
            {widget && (
              <>
                <div className="new-selected-step">
                  <Thermometer size={27} />
                  {widget.name}
                </div>
                <label>
                  Label
                  <input
                    aria-label="HMI label"
                    value={widget.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label>
                  Signal (semantic)
                  <select
                    aria-label="HMI signal"
                    value={widget.binding}
                    onChange={(e) => patch({ binding: e.target.value })}
                  >
                    <option value={widget.binding}>{widget.binding || "Unbound"}</option>
                    {model.signals.map((s) => (
                      <option key={s.key}>{s.key}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Unit
                  <input
                    aria-label="HMI unit"
                    value={widget.unit}
                    onChange={(e) => patch({ unit: e.target.value })}
                  />
                </label>
                <label>
                  Preview value
                  <input
                    aria-label="HMI preview value"
                    value={widget.value}
                    onChange={(e) => patch({ value: e.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    value={widget.description}
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                </label>
                <Notice>Read-only sandbox bindings. Local machine control remains separate.</Notice>
                <RecordActions record={widget} />
              </>
            )}
          </Surface>
        </div>
      ) : (
        <Surface title={tab}>
          {tab === "Tests" ? (
            <div className="space-y-2">
              {!rows.length ? (
                <Notice>Add a display component to validate its bindings.</Notice>
              ) : !unbound.length ? (
                <Notice>Every display component has a configured signal binding.</Notice>
              ) : (
                unbound.map((row) => (
                  <Button
                    key={row.id}
                    variant="outline"
                    onClick={() => {
                      setActive(row.id);
                      setTab("Screens");
                    }}
                  >
                    {row.name} · Resolve signal binding
                  </Button>
                ))
              )}
            </div>
          ) : tab === "Alarm presentation" ? (
            <Notice>
              {record.diagram === "mixing-vessel"
                ? "High-pressure training scenario. Acknowledgement applies only to this preview."
                : "No alarm scenario configured for this display."}
            </Notice>
          ) : (
            <KeyValues
              items={
                tab === "Signals"
                  ? model.signals.map((s) => [s.key, s.type + " · " + s.unit])
                  : [
                      ["Display mode", "Design preview"],
                      ["Production commands", "Unavailable in this editor"],
                    ]
              }
            />
          )}
        </Surface>
      )}
      <div className="new-line-strip">
        <Layers size={17} />
        Assign display to station ({model.name})
        {model.stations.map((s) => (
          <Button
            variant="outline"
            key={s.id}
            onClick={() =>
              setModel({
                ...model,
                records: upsertDesignRecord(model.records, { ...record, parent: s.id }),
              })
            }
            aria-pressed={record.parent === s.id}
            className={record.parent === s.id ? "is-selected" : ""}
          >
            <span>
              {s.id} {s.name}
              <small>{s.mode}</small>
            </span>
          </Button>
        ))}
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{record.name}</DialogTitle>
            <DialogDescription>HMI preview using configured example values.</DialogDescription>
          </DialogHeader>
          {rows.length ? (
            <dl className="grid grid-cols-2 gap-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border bg-muted/30 p-3">
                  <dt className="text-sm text-muted-foreground">{row.name}</dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {row.value || "—"} {row.unit}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Add a component to preview this display.</p>
          )}
        </DialogContent>
      </Dialog>
      <DraftDialog open={dialog} onClose={() => setDialog(false)} />
    </ReferencePage>
  );
}
