import { useRef, useState } from "react";
import { Link, useSearch, useNavigate, useBlocker } from "@tanstack/react-router";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useEngineering } from "@/lib/engineering/context";
import { signalSchema } from "@/lib/engineering/model";
import { putStationSignal, stationSignals, type Signal } from "@/lib/engineering/signal-design";
import { AddRecord, RecordActions } from "./record-editor";
import {
  Surface,
  ReferencePage,
  ScopeSelectors,
  RefTabs,
  RefTable,
  KeyValues,
  Notice,
  StationList,
  DraftDialog,
} from "./reference-ui";

function SignalEditor({
  stationId,
  initial,
  close,
  onApply,
}: {
  stationId: string;
  initial?: Signal | undefined;
  close: () => void;
  onApply: (key: string) => void;
}) {
  const { model, setModel } = useEngineering();
  const [original] = useState<Signal>(
    () =>
      initial ?? {
        key: "",
        address: "",
        type: "Number",
        unit: "",
        expectedUnit: "",
        access: "Read",
        quality: "Unavailable",
        value: "",
        age: 0,
        maxAge: 60,
        required: false,
      },
  );
  const [draft, setDraft] = useState(original),
    [error, setError] = useState("");
  const equipment = model.records.filter(
    (r) => !r.archived && ["equipment", "terminal"].includes(r.kind) && r.parent === stationId,
  );
  const applied = useRef(false);
  const dirty = draft !== original;
  const discard = () => {
    if (!dirty || window.confirm("Discard these mapping edits?")) close();
  };
  useBlocker({
    enableBeforeUnload: dirty,
    shouldBlockFn: () =>
      !applied.current && dirty && !window.confirm("Discard these mapping edits and leave?"),
  });
  function patch(values: Partial<Signal>) {
    setDraft({ ...draft, ...values });
    setError("");
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) discard();
      }}
    >
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit signal binding" : "Add signal binding"}</DialogTitle>
          <DialogDescription>Engineering configuration for {stationId}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const signal = {
                ...draft,
                key: draft.key.trim(),
                address: draft.address.trim(),
                stationId,
              };
              setModel(putStationSignal(model, signal, initial?.key));
              applied.current = true;
              onApply(signal.key);
            } catch (err) {
              setError(err instanceof Error ? err.message : "The mapping is invalid.");
            }
          }}
        >
          <div className="asset-step-fields engineering-dialog-fields">
            <label>
              Signal key
              <input
                required
                maxLength={160}
                readOnly={!!initial}
                value={draft.key}
                onChange={(e) => patch({ key: e.target.value })}
              />
            </label>
            <label>
              Source equipment
              <select
                value={draft.equipmentId ?? ""}
                onChange={(e) => patch({ equipmentId: e.target.value || undefined })}
              >
                <option value="">Station interface</option>
                {equipment.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Protocol
              <select
                value={draft.protocol ?? ""}
                onChange={(e) =>
                  patch({ protocol: (e.target.value || undefined) as Signal["protocol"] })
                }
              >
                <option value="">Unspecified</option>
                {signalSchema.shape.protocol.unwrap().options.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Interface / port reference
              <input
                maxLength={160}
                value={draft.interfaceRef ?? ""}
                onChange={(e) => patch({ interfaceRef: e.target.value })}
              />
            </label>
            <label className="span-two">
              Address / tag reference
              <input
                required
                maxLength={512}
                value={draft.address}
                onChange={(e) => patch({ address: e.target.value })}
              />
            </label>
            <label>
              Data type
              <select
                value={draft.type}
                onChange={(e) => patch({ type: e.target.value as Signal["type"] })}
              >
                {signalSchema.shape.type.options.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <select
                value={draft.access}
                onChange={(e) => patch({ access: e.target.value as Signal["access"] })}
              >
                <option value="Read">Read input</option>
                <option value="Command">Command output</option>
              </select>
            </label>
            {(
              [
                ["unit", "Source unit"],
                ["expectedUnit", "Engineering unit"],
                ["requiredCapability", "Required capability"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  maxLength={160}
                  value={draft[key] ?? ""}
                  onChange={(e) => patch({ [key]: e.target.value })}
                />
              </label>
            ))}
            {(
              [
                ["scale", "Scale factor", 1],
                ["offset", "Offset", 0],
                ["maxAge", "Freshness limit (s)", 60],
              ] as const
            ).map(([key, label, fallback]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  step="any"
                  min={key === "maxAge" ? 0.001 : undefined}
                  value={Number.isNaN(draft[key]) ? "" : (draft[key] ?? fallback)}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    e.target.setCustomValidity(
                      key === "scale" && value === 0 ? "Enter a nonzero scale factor." : "",
                    );
                    patch({ [key]: value });
                  }}
                />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) => patch({ required: e.target.checked })}
            />
            Required for this station
          </label>
          {initial && !initial.stationId && (
            <Notice>
              Applying this mapping assigns the unassigned signal to {stationId}. Existing
              references retain its key.
            </Notice>
          )}
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={discard}>
              Cancel
            </Button>
            <Button type="submit">Apply to draft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SignalBindings() {
  const { model, selected, revision, lineId, issues } = useEngineering();
  const search = useSearch({ from: "/station-connectivity" }),
    navigate = useNavigate({ from: "/station-connectivity" });
  const station = model.stations.find((s) => s.id === selected) ?? model.stations[0];
  const [view, setView] = useState("Station bindings"),
    [editing, setEditing] = useState<Signal | "new" | null>(null),
    [save, setSave] = useState(false);
  const [filter, setFilter] = useState("");
  const target = model.signals.find((s) => s.key === search.signal);
  const unassigned =
    view === "Unassigned signals" || (!!search.signal && !!target && !target.stationId);
  const rows = stationSignals(model, station?.id ?? "", unassigned).filter((s) =>
    [s.key, s.address, s.type, s.equipmentId].some((v) =>
      v?.toLowerCase().includes(filter.trim().toLowerCase()),
    ),
  );
  const signal = rows.find((s) => s.key === search.signal) ?? rows[0];
  const selectedMissing =
    !!search.signal && (!target || (target.stationId && target.stationId !== station?.id));
  const choose = (key: string | undefined) =>
    void navigate({
      search: (prev) => ({ ...prev, signal: key }),
      replace: true,
      resetScroll: false,
    });
  const equipment = model.records.filter(
    (r) => r.parent === station?.id && !r.archived && ["terminal", "equipment"].includes(r.kind),
  );
  return (
    <ReferencePage
      title="Signal bindings"
      sub={`${model.scope} / ${model.name} · Engineering draft r${revision}`}
      actions={
        <>
          <ScopeSelectors />
          <Button onClick={() => setSave(true)}>
            <Save size={16} />
            Save draft
          </Button>
        </>
      }
    >
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(14rem,1fr)_minmax(0,3fr)]">
        <StationList />
        <div className="min-w-0 space-y-4">
          {station ? (
            <>
              <Surface
                title={station.name}
                sub={station.id}
                actions={
                  <Button variant="outline" onClick={() => setEditing("new")}>
                    <Plus size={15} />
                    Add binding
                  </Button>
                }
              >
                <RefTabs
                  items={["Station bindings", "Unassigned signals", "Physical interfaces"]}
                  value={unassigned ? "Unassigned signals" : view}
                  onChange={(v) => {
                    setView(v);
                    setFilter("");
                    choose(undefined);
                  }}
                />
                {view === "Physical interfaces" && !unassigned ? (
                  <>
                    {equipment.length ? (
                      <RefTable
                        headers={["Equipment", "Identity", "Interface / port", "Protocol"]}
                        rows={equipment.map((r) => [
                          r.name,
                          r.id,
                          r.hardware?.interfaces || "Unspecified",
                          r.machine?.protocol ?? "Unspecified",
                        ])}
                      />
                    ) : (
                      <p className="ref-empty">No equipment assigned to this station.</p>
                    )}
                    <Link
                      to="/workstations"
                      search={(prev) => ({ ...prev, engLine: lineId, engStation: station.id })}
                      className="ref-issue-link"
                    >
                      Configure station equipment
                    </Link>
                  </>
                ) : (
                  <>
                    {unassigned && (
                      <Notice>
                        These factory signals have no recorded station. Open a mapping to assign it
                        here.
                      </Notice>
                    )}
                    {selectedMissing && (
                      <Notice tone="warn">
                        The requested signal is unavailable at this station.
                      </Notice>
                    )}
                    <label className="ref-template-search">
                      Find a binding
                      <input
                        type="search"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Signal, equipment or address"
                      />
                    </label>
                    {rows.length ? (
                      <RefTable
                        headers={["Signal", "Address", "Type", "Direction"]}
                        rows={rows.map((s) => [
                          s.key,
                          s.address || "Missing address",
                          s.type,
                          s.access,
                        ])}
                        selected={rows.indexOf(signal!)}
                        onSelect={(i) => choose(rows[i]!.key)}
                      />
                    ) : (
                      <p className="ref-empty">
                        {filter
                          ? "No matching bindings."
                          : unassigned
                            ? "No unassigned signals."
                            : "No bindings assigned to this station."}
                      </p>
                    )}
                  </>
                )}
              </Surface>
              {signal && (view !== "Physical interfaces" || unassigned) && (
                <Surface
                  title={signal.key}
                  sub="Logical signal binding"
                  actions={
                    <Button variant="outline" onClick={() => setEditing(signal)}>
                      {unassigned ? "Assign to station" : "Edit mapping"}
                    </Button>
                  }
                >
                  <KeyValues
                    items={[
                      ["Source equipment", signal.equipmentId ?? "Station interface"],
                      [
                        "Protocol / port",
                        [signal.protocol, signal.interfaceRef].filter(Boolean).join(" · ") ||
                          "Unspecified",
                      ],
                      ["Address", signal.address || "Missing"],
                      [
                        "Source → engineering units",
                        [signal.unit || "Unspecified", signal.expectedUnit || "Unspecified"].join(
                          " → ",
                        ),
                      ],
                      ["Scale / offset", `${signal.scale ?? 1} / ${signal.offset ?? 0}`],
                      ["Freshness limit", `${signal.maxAge} s`],
                      ["Required capability", signal.requiredCapability || "Unspecified"],
                      ["Observation", "Unknown · no timestamped device observation"],
                    ]}
                  />
                  {issues
                    .filter(
                      (i) =>
                        i.object === signal.key &&
                        i.category === "Signals" &&
                        !i.message.includes("stale, bad"),
                    )
                    .map((i) => (
                      <Button key={i.id} variant="link" onClick={() => setEditing(signal)}>
                        {i.message} · Edit mapping
                      </Button>
                    ))}
                  {signal.access === "Command" && (
                    <Link
                      className="ref-issue-link"
                      to="/command-policy"
                      search={(prev) => ({ ...prev, engStation: station.id, engLine: lineId })}
                    >
                      Inspect command permissions
                    </Link>
                  )}
                </Surface>
              )}
            </>
          ) : (
            <Notice>Add a station to the selected line to configure its connections.</Notice>
          )}
        </div>
      </div>
      {editing && station && (
        <SignalEditor
          key={station.id}
          stationId={station.id}
          initial={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
          onApply={(key) => {
            setEditing(null);
            setView("Station bindings");
            setFilter("");
            choose(key);
          }}
        />
      )}
      <DraftDialog open={save} onClose={() => setSave(false)} />
    </ReferencePage>
  );
}

export function CommandPolicy() {
  const { model, selected, revision } = useEngineering();
  const station = model.stations.find((s) => s.id === selected) ?? model.stations[0];
  const rows = model.records.filter(
    (r) => r.kind === "command" && !r.archived && r.parent === station?.id,
  );
  const [save, setSave] = useState(false);
  return (
    <ReferencePage
      title="Command Policy Editor"
      sub={`${model.scope} / ${model.name} · Engineering draft r${revision}`}
      actions={
        <>
          <ScopeSelectors />
          <Button onClick={() => setSave(true)}>Save draft</Button>
        </>
      }
    >
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(14rem,1fr)_minmax(0,3fr)]">
        <StationList />
        <div className="space-y-4">
          <Surface
            title={station ? `${station.name} · Command definitions` : "Station commands"}
            sub="Intended commissioning policies. Execution requires authorized runtime controls."
            actions={station && <AddRecord kind="command" />}
          >
            {rows.length ? (
              <RefTable
                headers={["Command", "Binding", "Version", "Policy description", "Actions"]}
                rows={rows.map((r) => [
                  r.name,
                  r.binding || "Unspecified",
                  r.version,
                  r.description || "Unspecified",
                  <RecordActions record={r} key={r.id} />,
                ])}
              />
            ) : (
              <p className="ref-empty">No command definitions for the selected station.</p>
            )}
          </Surface>
          <Surface title="Runtime authorization">
            <p>
              Command approvals and timestamped execution evidence are unavailable in the
              engineering draft.
            </p>
            <Link className="ref-issue-link" to="/station-connectivity">
              Inspect signal directions
            </Link>
          </Surface>
        </div>
      </div>
      <DraftDialog open={save} onClose={() => setSave(false)} />
    </ReferencePage>
  );
}
