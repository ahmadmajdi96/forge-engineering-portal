import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface, RefTable, KeyValues, Notice } from "@/components/engineering/reference-ui";
import { useEngineering } from "@/lib/engineering/context";
import { projectAssets } from "@/lib/engineering/asset-registry";
import { stationsForStep } from "@/lib/engineering/asset-flow";
import { useListControls } from "@/components/list-controls";

export const Route = createFileRoute("/lines/$lineId")({
  head: () => ({ meta: [{ title: "Production line detail · Engineering Portal" }] }),
  component: LineDetailPage,
});

function LineDetailPage() {
  const { lineId } = Route.useParams();
  const {
    workspaceModel,
    site,
    revision,
    native,
    actions,
    lineId: activeLine,
    selectLine,
  } = useEngineering();
  const line = workspaceModel.lines.find((l) => l.id === lineId && !l.archived);
  useEffect(() => {
    if (line && activeLine !== lineId) selectLine(lineId);
  }, [line, activeLine, lineId, selectLine]);
  const [mode, setMode] = useState("all");
  const stations = projectAssets(workspaceModel)
    .stations.filter((s) => s.lineId === lineId)
    .sort((a, b) => a.sequence - b.sequence);
  const operations = workspaceModel.records.filter(
    (r) =>
      r.kind === "operation" &&
      !r.archived &&
      (r.parent === lineId || stationsForStep(workspaceModel, r).some((s) => s.lineId === lineId)),
  );
  const list = useListControls(
    stations.filter((s) => mode === "all" || s.type === mode),
    {
      searchKeys: ["id", "name", "type"],
      scopeKey: [site, lineId, mode].join("/"),
      exportName: "line-stations",
    },
  );
  if (!line)
    return (
      <Surface title="Line unavailable">
        <p>The requested line is archived or outside this factory.</p>
        <Link to="/lines" className="ref-issue-link">
          Open line registry
        </Link>
      </Surface>
    );
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/lines" className="ref-issue-link">
            Line registry
          </Link>
          <h1 className="font-display text-2xl font-semibold">{line.name}</h1>
          <p className="text-sm text-muted-foreground">
            {line.plant} / {line.id} · Engineering draft r{revision}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {native && actions.includes("ems.factory_layout.view") && (
            <Button asChild variant="outline">
              <Link
                to="/factory-layout"
                search={(prev) => ({
                  ...prev,
                  site,
                  line: lineId,
                  station: undefined,
                  space: undefined,
                  asset: undefined,
                  occurrence: undefined,
                })}
              >
                Open layout
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link
              to="/line-engineering"
              search={(prev) => ({ ...prev, engLine: lineId, engStation: undefined })}
            >
              Design line
            </Link>
          </Button>
        </div>
      </header>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="min-w-0 space-y-4">
          <Surface
            title="Stations and stages"
            actions={
              <Button asChild variant="outline">
                <Link to="/stations" search={(prev) => ({ ...prev, engLine: lineId })}>
                  Manage stations
                </Link>
              </Button>
            }
          >
            {list.toolbar}
            <label className="ref-template-search">
              Control mode
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="all">All modes</option>
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
              </select>
            </label>
            {list.visible.length ? (
              <RefTable
                headers={["Stage", "Station", "Control mode", "Configured cycle"]}
                rows={list.visible.map((s) => [
                  s.sequence,
                  <Link
                    key={s.id}
                    className="ref-issue-link"
                    to="/stations/$stationId"
                    params={{ stationId: s.id }}
                    search={(prev) => ({ ...prev, engLine: lineId, engStation: s.id })}
                  >
                    {s.name}
                  </Link>,
                  s.type,
                  s.cycleTimeSec > 0 ? `${s.cycleTimeSec} s` : "Unspecified",
                ])}
              />
            ) : (
              <p className="ref-empty">
                {stations.length
                  ? "No stations match the filters."
                  : "No stations configured on this line."}
              </p>
            )}
            {list.pager}
          </Surface>
          <Surface
            title="Manufacturing definitions"
            actions={
              <Button asChild variant="outline">
                <Link
                  to="/asset-steps"
                  search={(prev) => ({ ...prev, engLine: lineId, engStation: undefined })}
                >
                  Edit sequence
                </Link>
              </Button>
            }
          >
            {operations.length ? (
              <RefTable
                headers={["Order", "Step", "Assigned stations"]}
                rows={operations.map((r, i) => [
                  i + 1,
                  <Link
                    key={r.id}
                    className="ref-issue-link"
                    to="/asset-steps"
                    search={(prev) => ({ ...prev, engLine: lineId, step: r.id })}
                  >
                    {r.name}
                  </Link>,
                  stationsForStep(workspaceModel, r)
                    .map((s) => s.name)
                    .join(", ") || "Unassigned",
                ])}
              />
            ) : (
              <p className="ref-empty">No steps defined for this line.</p>
            )}
          </Surface>
        </div>
        <Surface title="Configured line values">
          <KeyValues
            items={[
              ["Takt time", line.taktSeconds ? `${line.taktSeconds} s/unit` : "Unspecified"],
              [
                "Capacity",
                line.capacityPerHour
                  ? `${line.capacityPerHour} ${line.capacityUnit ?? "(unit unspecified)"}/h`
                  : "Unspecified",
              ],
              ["Planned target", line.target],
              ["Stations", stations.length],
              ["Manufacturing steps", operations.length],
            ]}
          />
          <Notice>
            Measured output and production telemetry are unavailable in the engineering workspace.
          </Notice>
        </Surface>
      </div>
    </div>
  );
}
