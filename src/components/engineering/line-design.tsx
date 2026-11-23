import { BufferRules } from "./buffer-rules";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Box, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { stationsForStep } from "@/lib/engineering/asset-flow";
import { projectAssets } from "@/lib/engineering/asset-registry";
import { getFactoryStructure } from "@/lib/production/engineering-relations.functions";
import { EngineeringDataDrawer } from "./record-editor";
import {
  Surface,
  ReferencePage,
  ScopeSelectors,
  Notice,
  DraftDialog,
  RefTable,
  KeyValues,
} from "./reference-ui";

function LineLocation({ lineId }: { lineId: string }) {
  const { site, native, actions } = useEngineering();
  const allowed = actions.includes("ems.factory_layout.view");
  const [choice, setChoice] = useState("");
  const layout = useQuery({
    queryKey: ["factory-structure", site],
    enabled: !!site && native && allowed,
    retry: false,
    queryFn: () => getFactoryStructure({ data: { site: site! } }),
  });
  const spaces = layout.data?.spaces ?? [];
  const lineSpace = spaces.find((s) => s.kind === "line" && s.engineeringId === lineId);
  const area = spaces.find((s) => s.id === lineSpace?.parentId);
  const floor = spaces.find((s) => s.id === area?.parentId);
  const areas = spaces.filter((s) => s.kind === "area");
  return (
    <Surface
      title={
        <>
          <MapPin size={17} />
          Physical location
        </>
      }
    >
      {!native || !site || !allowed ? (
        <p>Factory layout access is required to view the placement.</p>
      ) : (
        <>
          {layout.isError ? (
            <p role="status">
              Layout data is unavailable.{" "}
              <Button variant="link" onClick={() => void layout.refetch()}>
                Retry
              </Button>
            </p>
          ) : layout.isPending ? (
            <p role="status">Loading layout…</p>
          ) : lineSpace ? (
            <KeyValues
              items={[
                ["Area", area?.label ?? "Unresolved"],
                ["Floor", floor?.label ?? "Unresolved"],
                ["Placed line", lineSpace.label],
              ]}
            />
          ) : (
            <>
              <p>This line has no linked layout space.</p>
              {areas.length > 0 && (
                <label className="ref-template-search">
                  Area for placement
                  <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                    <option value="">Choose in layout</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {spaces.find((f) => f.id === a.parentId)?.label} / {a.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <Button asChild variant="outline">
            <Link
              to="/factory-layout"
              search={(prev) => ({
                ...prev,
                site,
                line: lineId,
                station: undefined,
                space: choice || undefined,
                asset: undefined,
                occurrence: undefined,
              })}
            >
              <Box size={16} />
              {lineSpace ? "Open line in layout" : "Place line in layout"}
            </Link>
          </Button>
        </>
      )}
    </Surface>
  );
}

export function LineTopology() {
  const { model, setModel, lineId, select, selected, revision } = useEngineering();
  const [save, setSave] = useState(false);
  const line = model.lines.find((l) => l.id === lineId && !l.archived);
  const stations = projectAssets(model).stations.sort((a, b) => a.sequence - b.sequence);
  const station = model.stations.find((s) => s.id === selected) ?? model.stations[0];
  const operations = model.records.filter((r) => r.kind === "operation" && !r.archived);
  const missing = operations.filter((r) => !stationsForStep(model, r).length);
  function setStationSequence(id: string, sequence: number) {
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < 1 ||
      stations.find((s) => s.id === id)?.sequence === sequence
    )
      return;
    setModel({
      ...model,
      stations: model.stations.map((s) =>
        s.id === id
          ? { ...s, config: { status: "idle", cycleTimeSec: 0, ...s.config, sequence } }
          : s,
      ),
    });
  }
  function moveStation(id: string, direction: -1 | 1) {
    const index = stations.findIndex((s) => s.id === id);
    const first = stations[index],
      other = stations[index + direction];
    if (!first || !other) return;
    if (first.sequence === other.sequence) {
      const next = [...model.stations],
        a = next.findIndex((s) => s.id === id),
        b = next.findIndex((s) => s.id === other.id);
      [next[a], next[b]] = [next[b]!, next[a]!];
      setModel({ ...model, stations: next });
    } else {
      setModel({
        ...model,
        stations: model.stations.map((s) => {
          const position =
            s.id === id ? other.sequence : s.id === other.id ? first.sequence : undefined;
          return position === undefined
            ? s
            : {
                ...s,
                config: { status: "idle", cycleTimeSec: 0, ...s.config, sequence: position },
              };
        }),
      });
    }
  }
  const configure = (patch: Partial<NonNullable<typeof line>>) =>
    setModel({
      ...model,
      lines: model.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    });
  return (
    <ReferencePage
      title="Line Topology Designer"
      sub={
        line
          ? `${line.name} · ${line.id} · Engineering draft · r${revision}`
          : "Create a line to begin its engineering design."
      }
      actions={
        <>
          <ScopeSelectors />
          {line && (
            <Button onClick={() => setSave(true)}>
              <Save size={16} />
              Save draft
            </Button>
          )}
        </>
      }
    >
      {!line ? (
        <Surface title="Set up a production line">
          <Button asChild>
            <Link to="/lines">Open line registry</Link>
          </Button>
        </Surface>
      ) : (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="min-w-0 space-y-4">
            <Surface
              title="Station sequence"
              sub="Stations at the same position share a stage. Manufacturing step order is configured separately."
              actions={<EngineeringDataDrawer initialKind="station" label="Manage stations" />}
            >
              {stations.length ? (
                <RefTable
                  headers={["Position", "Station", "Control", "Configured cycle", "Order"]}
                  selected={stations.findIndex((s) => s.id === station?.id)}
                  onSelect={(i) => select(stations[i]!.id)}
                  rows={stations.map((s, i) => [
                    s.sequence,
                    s.name,
                    s.type,
                    s.cycleTimeSec > 0 ? `${s.cycleTimeSec} s` : "Unspecified",
                    <div className="flex gap-1" key={s.id}>
                      {([-1, 1] as const).map((d) => (
                        <Button
                          key={d}
                          size="icon"
                          variant="ghost"
                          disabled={!stations[i + d]}
                          title={d < 0 ? "Move earlier" : "Move later"}
                          aria-label={`Move ${s.name} ${d < 0 ? "earlier" : "later"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveStation(s.id, d);
                          }}
                        >
                          {d < 0 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
                        </Button>
                      ))}
                    </div>,
                  ])}
                />
              ) : (
                <p className="ref-empty">Add the first station to define the line.</p>
              )}
              {station && (
                <div className="asset-step-fields">
                  <label>
                    Stage for {station.name}
                    <input
                      type="number"
                      key={station.id + "-" + (station.config?.sequence ?? "")}
                      min="1"
                      step="1"
                      defaultValue={stations.find((s) => s.id === station.id)?.sequence ?? 1}
                      onBlur={(e) => {
                        if (e.target.reportValidity() && e.target.value)
                          setStationSequence(station.id, Number(e.target.value));
                      }}
                    />
                  </label>
                  <Button asChild variant="outline">
                    <Link
                      to="/workstations"
                      search={(prev) => ({ ...prev, engLine: lineId, engStation: station.id })}
                    >
                      Inspect station
                    </Link>
                  </Button>
                </div>
              )}
            </Surface>
            <BufferRules key={lineId} />
            <Surface
              title="Manufacturing steps"
              actions={
                <Button asChild variant="outline">
                  <Link to="/asset-steps" search={(prev) => ({ ...prev, engLine: lineId })}>
                    Edit step sequence
                  </Link>
                </Button>
              }
            >
              {operations.length ? (
                <RefTable
                  headers={["Order", "Definition", "Station assignments"]}
                  rows={operations.map((r, i) => [
                    i + 1,
                    <Link
                      className="ref-issue-link"
                      key={r.id}
                      to="/asset-steps"
                      search={(prev) => ({ ...prev, engLine: lineId, step: r.id })}
                    >
                      {r.name}
                    </Link>,
                    stationsForStep(model, r)
                      .map((s) => s.name)
                      .join(", ") || "Unassigned",
                  ])}
                />
              ) : (
                <p className="ref-empty">No manufacturing steps defined for this line.</p>
              )}
            </Surface>
          </div>
          <aside className="min-w-0 space-y-4">
            <LineLocation key={lineId} lineId={lineId} />
            <Surface title="Design estimates" sub="Configured targets for this line.">
              <div className="asset-step-fields">
                {(
                  [
                    ["taktSeconds", "Takt time (s/unit)"],
                    ["capacityPerHour", "Capacity per hour"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      key={line.id}
                      defaultValue={line[key] ?? ""}
                      placeholder="Unspecified"
                      onBlur={(e) => {
                        const value = e.target.valueAsNumber;
                        if (e.target.value && (!Number.isFinite(value) || value <= 0)) {
                          e.target.setCustomValidity("Enter a positive estimate.");
                          e.target.reportValidity();
                          return;
                        }
                        const next = e.target.value ? value : undefined;
                        if (next !== line[key]) configure({ [key]: next });
                      }}
                      onChange={(e) => e.target.setCustomValidity("")}
                    />
                  </label>
                ))}
                <label>
                  Capacity unit
                  <input
                    maxLength={32}
                    key={line.id}
                    defaultValue={line.capacityUnit ?? ""}
                    placeholder="e.g. cases"
                    onBlur={(e) => {
                      const unit = e.target.value.trim() || undefined;
                      if (unit !== line.capacityUnit) configure({ capacityUnit: unit });
                    }}
                  />
                </label>
              </div>
            </Surface>
            <Surface title="Design readiness">
              {!stations.length && <Notice tone="warn">Add a station to define the line.</Notice>}
              {!operations.length && <Notice tone="warn">Define the manufacturing steps.</Notice>}
              {missing.map((r) => (
                <Link
                  key={r.id}
                  className="ref-issue-link"
                  to="/asset-steps"
                  search={(prev) => ({ ...prev, engLine: lineId, step: r.id })}
                >
                  Assign a station to {r.name}
                </Link>
              ))}
              {line.capacityPerHour && !line.capacityUnit && (
                <Notice tone="warn">Enter the capacity unit for this estimate.</Notice>
              )}
              {!!stations.length && !!operations.length && !missing.length && (
                <p>All steps have a station assignment.</p>
              )}
            </Surface>
          </aside>
        </div>
      )}
      <DraftDialog open={save} onClose={() => setSave(false)} />
    </ReferencePage>
  );
}
