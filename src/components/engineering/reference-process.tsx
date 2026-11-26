import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Layers, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { stationsForStep } from "@/lib/engineering/asset-flow";
import { projectAssets } from "@/lib/engineering/asset-registry";
import { AddRecord, RecordActions, useRecords } from "./record-editor";
import {
  Surface,
  ReferencePage,
  ScopeSelectors,
  RefTabs,
  RefTable,
  KeyValues,
  Badge,
  DraftDialog,
} from "./reference-ui";
export { LineTopology } from "./line-design";
export { SignalBindings, CommandPolicy } from "./station-signals";

export function ProcessRoute() {
  const { model, lineId, site, revision } = useEngineering();
  const { rows: operations } = useRecords("operation");
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState("Details");
  const [preview, setPreview] = useState(false);
  const [checked, setChecked] = useState(false);
  const [dialog, setDialog] = useState(false);
  const operation = operations.find((item) => item.id === selectedId) ?? operations[0];
  const index = operation ? operations.indexOf(operation) : -1;
  const stations = operation ? stationsForStep(model, operation) : [];
  const unassigned = operations.filter((item) => !stationsForStep(model, item).length);
  const unresolved = operations.filter((item) =>
    stationsForStep(model, item).some((station) => !station.operation),
  );
  const evidence = operation
    ? model.records.filter(
        (record) =>
          !record.archived && record.kind === "evidence" && record.parent === operation.id,
      )
    : [];
  return (
    <ReferencePage
      title={`${model.name} · Process route`}
      sub="Sequence operations and review their station assignments."
      crumb="Process & Routes"
      actions={
        <>
          <ScopeSelectors />
          <Button
            variant="outline"
            disabled={!operations.length}
            onClick={() => {
              setSelectedId(operations[0]!.id);
              setPreview(true);
            }}
          >
            Preview sequence
          </Button>
          <Button disabled={!operations.length} onClick={() => setDialog(true)}>
            <Send size={16} />
            Submit for review
          </Button>
        </>
      }
    >
      <div className="ref-route-summary">
        {[
          ["Plant", model.scope],
          ["Production line", lineId],
          ["Operations", operations.length],
          ["Without a station", unassigned.length],
          ["Workspace revision", revision ? `r${revision}` : "Unsaved"],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="ref-route-grid">
        <div className="ref-stack">
          <Surface title="Route design" sub={`${model.name} · Operation sequence`}>
            {!operation ? (
              <p className="ref-empty">Add the first operation to define this route.</p>
            ) : (
              <div className="ref-route-canvas" aria-label="Operation sequence">
                <div className="ref-operation-flow">
                  {operations.map((item, i) => (
                    <div key={item.id}>
                      <Button
                        aria-pressed={item.id === operation.id}
                        variant="outline"
                        className={item.id === operation.id ? "is-selected" : ""}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <Layers size={17} />
                        <span>
                          {item.name}
                          <small>
                            {stationsForStep(model, item)
                              .map((s) => s.id)
                              .join(", ") || "Unassigned"}
                          </small>
                        </span>
                      </Button>
                      {i < operations.length - 1 && <ArrowRight size={15} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {preview && operation && (
              <div className="ref-sequence-preview">
                <span role="status">
                  Preview · {index + 1} of {operations.length} · {operation.name}
                </span>
                <Button
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => setSelectedId(operations[index - 1]!.id)}
                >
                  Previous
                </Button>
                {index + 1 < operations.length && (
                  <Button
                    variant="outline"
                    onClick={() => setSelectedId(operations[index + 1]!.id)}
                  >
                    Next operation
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setPreview(false)}>
                  End preview
                </Button>
              </div>
            )}
          </Surface>
          <Surface
            title={`Operations (${operations.length})`}
            actions={<AddRecord kind="operation" />}
          >
            {!!operations.length && (
              <RefTable
                headers={["#", "Operation", "Assigned stations", "Parameters"]}
                selected={index}
                onSelect={(i) => setSelectedId(operations[i]!.id)}
                rows={operations.map((item, i) => [
                  i + 1,
                  item.name,
                  stationsForStep(model, item)
                    .map((station) => station.name)
                    .join(", ") || "Unassigned",
                  item.description || "—",
                ])}
              />
            )}
          </Surface>
          <Surface
            title="Station coverage"
            actions={
              <Button variant="outline" onClick={() => setChecked(true)}>
                Check assignments
              </Button>
            }
          >
            {checked && (
              <p role="status">
                {!operations.length
                  ? "No operations to check."
                  : unassigned.length || unresolved.length
                    ? `Missing station: ${unassigned.map((item) => item.name).join(", ") || "none"}. Missing MES mapping: ${unresolved.map((item) => item.name).join(", ") || "none"}.`
                    : "All operations have a station with a configured MES mapping."}
              </p>
            )}
            <Link
              to="/asset-steps"
              search={(prev) => ({ ...prev, step: operation?.id, engLine: lineId })}
              className="ref-issue-link"
            >
              Configure assignments
              <ArrowRight size={14} />
            </Link>
          </Surface>
        </div>
        {operation && (
          <Surface
            title={operation.name}
            sub={operation.id}
            actions={<RecordActions key={operation.id} record={operation} />}
          >
            <RefTabs
              items={["Details", "Evidence", "Failure & control"]}
              value={tab}
              onChange={setTab}
            />
            {tab === "Details" ? (
              <KeyValues
                items={[
                  ["Sequence", `${index + 1} of ${operations.length}`],
                  ["Assigned stations", stations.map((s) => s.name).join(", ") || "Unassigned"],
                  [
                    "MES operation mappings",
                    stations
                      .map((s) => s.operation)
                      .filter(Boolean)
                      .join(", ") || "Unmapped",
                  ],
                  ["Description", operation.description || "No description entered"],
                  ["Version", operation.version],
                ]}
              />
            ) : tab === "Evidence" ? (
              <>
                <KeyValues
                  items={[
                    ["Required dependency", operation.required ? "Yes" : "No"],
                    ["Linked evidence", evidence.length],
                  ]}
                />
                {evidence.map((item) => (
                  <p key={item.id}>{item.name}</p>
                ))}
              </>
            ) : (
              <>
                <KeyValues
                  items={[
                    [
                      "Operating modes",
                      Array.from(new Set(stations.map((s) => s.mode))).join(", ") || "Unassigned",
                    ],
                  ]}
                />
                <Link
                  to="/factory-process"
                  search={(prev) => ({ ...prev, site })}
                  className="ref-issue-link"
                >
                  Design branches, failure paths and bounded rework
                  <ArrowRight size={14} />
                </Link>
              </>
            )}
          </Surface>
        )}
      </div>
      <DraftDialog
        review
        open={dialog}
        onClose={() => setDialog(false)}
        title="Submit route for engineering review"
      />
    </ReferencePage>
  );
}

export function StepTemplateLibrary() {
  const { model, setModel, lineId } = useEngineering();
  const [saving, setSaving] = useState(false);
  const [stationFilter, setStationFilter] = useState("");
  const { rows } = useRecords("template");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [comparisonId, setComparisonId] = useState("");
  const [dialog, setDialog] = useState(false);
  const templates = rows.filter(
    (item) =>
      item.parent === lineId ||
      model.stations.some((s) => s.id === item.parent || s.config?.templateIds?.includes(item.id)),
  );
  const matches = templates.filter((item) =>
    [item.name, item.id, item.binding].some((value) =>
      value.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );
  const selected = matches.find((item) => item.id === selectedId) ?? matches[0];
  const comparison = templates.find((item) => item.id === comparisonId && item.id !== selected?.id);
  const assigned = model.stations.filter(
    (station) =>
      station.id === selected?.parent ||
      (selected && station.config?.templateIds?.includes(selected.id)),
  );
  return (
    <ReferencePage
      title="Step Template Library"
      sub="Inspect draft templates, compare definitions and review the stations they affect."
      actions={
        <>
          <ScopeSelectors />
          <Button onClick={() => setSaving(true)}>Save draft</Button>
        </>
      }
    >
      <div className="ref-template-grid">
        <Surface title={`Templates (${templates.length})`} actions={<AddRecord kind="template" />}>
          <label className="ref-template-search">
            Find a template
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, ID or owner"
            />
          </label>
          {matches.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              aria-pressed={item.id === selected?.id}
              onClick={() => setSelectedId(item.id)}
              className={`ref-template-item ${item.id === selected?.id ? "is-selected" : ""}`}
            >
              <Layers size={22} />
              <div>
                <strong>{item.name}</strong>
                <small>{item.id}</small>
                <small>{item.binding || "No owner specified"}</small>
              </div>
              <Badge>{item.version}</Badge>
            </Button>
          ))}
          {!matches.length && (
            <p className="ref-empty">
              {query ? "No matching templates." : "No templates assigned to this line."}
              {query && (
                <Button variant="outline" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              )}
            </p>
          )}
        </Surface>
        {selected && (
          <div className="ref-stack">
            <Surface
              title={selected.name}
              sub={selected.id}
              actions={<RecordActions key={selected.id} record={selected} />}
            >
              <label className="ref-template-search">
                Compare with
                <select
                  value={comparison?.id ?? ""}
                  onChange={(e) => setComparisonId(e.target.value)}
                >
                  <option value="">Select another template</option>
                  {templates
                    .filter((item) => item.id !== selected.id)
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} · {item.version}
                      </option>
                    ))}
                </select>
              </label>
              <div className="ref-template-definitions">
                {(comparison ? [selected, comparison] : [selected]).map((template) => (
                  <div key={template.id} className="ref-template-version">
                    <h3>
                      {template.name} <Badge>{template.version}</Badge>
                    </h3>
                    <KeyValues
                      items={[
                        ["Scope", template.parent],
                        ["Owner / binding", template.binding || "Unspecified"],
                        ["Description", template.description || "Unspecified"],
                        ["Configured inputs", template.value || "Unspecified"],
                        ["Required dependency", template.required ? "Yes" : "No"],
                      ]}
                    />
                  </div>
                ))}
              </div>
            </Surface>
            <Surface
              title="Assignment & impact"
              actions={<Button onClick={() => setDialog(true)}>Submit for review</Button>}
            >
              <p>
                {assigned.length} assigned {assigned.length === 1 ? "station" : "stations"} ·{" "}
                {selected.version}
              </p>
              <label className="ref-template-search">
                Find a station
                <input
                  type="search"
                  value={stationFilter}
                  onChange={(e) => setStationFilter(e.target.value)}
                  placeholder="Station ID or name"
                />
              </label>
              <div className="asset-assignment-list">
                {model.stations
                  .filter((s) =>
                    (s.name + " " + s.id)
                      .toLowerCase()
                      .includes(stationFilter.trim().toLowerCase()),
                  )
                  .map((station) => (
                    <label key={station.id}>
                      <input
                        type="checkbox"
                        aria-label={`Assign ${selected.name} to ${station.name}`}
                        checked={assigned.some((s) => s.id === station.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const existing =
                            station.config?.templateIds ??
                            model.records
                              .filter(
                                (r) =>
                                  r.kind === "template" && !r.archived && r.parent === station.id,
                              )
                              .map((r) => r.id);
                          const templateIds = checked
                            ? Array.from(new Set([...existing, selected.id]))
                            : existing.filter((id) => id !== selected.id);
                          setModel({
                            ...model,
                            records:
                              !checked && selected.parent === station.id
                                ? model.records.map((r) =>
                                    r.kind === "template" && r.id === selected.id
                                      ? { ...r, parent: lineId }
                                      : r,
                                  )
                                : model.records,
                            stations: model.stations.map((s) =>
                              s.id === station.id
                                ? {
                                    ...s,
                                    config: {
                                      status: "idle",
                                      cycleTimeSec: 0,
                                      sequence:
                                        projectAssets(model).stations.find(
                                          (s) => s.id === station.id,
                                        )?.sequence ?? 1,
                                      ...s.config,
                                      templateIds,
                                    },
                                  }
                                : s,
                            ),
                          });
                        }}
                      />
                      <span>
                        {station.name} · {station.id}
                      </span>
                    </label>
                  ))}
              </div>
              {!model.stations.some((s) =>
                (s.name + " " + s.id).toLowerCase().includes(stationFilter.trim().toLowerCase()),
              ) && <p className="ref-empty">No matching stations on this line.</p>}
            </Surface>
          </div>
        )}
      </div>
      <DraftDialog open={saving} onClose={() => setSaving(false)} />
      <DraftDialog
        review
        open={dialog}
        onClose={() => setDialog(false)}
        title="Submit template workspace for review"
      />
    </ReferencePage>
  );
}
