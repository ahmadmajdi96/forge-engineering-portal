import { AssetPageLinks } from "@/components/engineering/asset-page-links";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAssetStore as useMes } from "@/lib/engineering/asset-store";
import type { LineStatus, ProductionLine } from "@/lib/mes-data";
import { StatusPill } from "@/components/status-pill";
import { Factory, Plus, Pencil, ArrowRight, Cpu, Hand, SlidersHorizontal } from "lucide-react";
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useListControls } from "@/components/list-controls";
import { useEngineering } from "@/lib/engineering/context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/lines/")({
  head: () => ({
    meta: [
      { title: "Production Lines · Engineering Portal" },
      {
        name: "description",
        content: "Shared production line definitions, stations and process assignments.",
      },
      { property: "og:title", content: "Production Lines · Engineering Portal" },
      {
        property: "og:description",
        content: "Shared production line definitions, stations and process assignments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LinesPage,
});

const createFields: Field[] = [
  {
    name: "name",
    label: "Line name",
    type: "text",
    required: true,
    span: 2,
    placeholder: "Primary Packaging Line",
    description: "A clear shop-floor name. The line ID is generated automatically.",
  },
  {
    name: "plant",
    label: "Plant",
    type: "text",
    required: true,
    span: 2,
    placeholder: "Plant 01 — Riyadh",
    description: "The facility where this line operates.",
  },
  {
    name: "status",
    label: "Initial status",
    type: "select",
    required: true,
    description: "Set the line's state when it is first created.",
    options: [
      { value: "running", label: "Running" },
      { value: "idle", label: "Idle" },
      { value: "down", label: "Down" },
      { value: "changeover", label: "Changeover" },
    ],
  },
  {
    name: "target",
    label: "Production target",
    type: "number",
    required: true,
    description: "Planned quantity for the active production window.",
  },
];

const editFields: Field[] = [
  { name: "name", label: "Line name", type: "text", required: true, span: 2 },
  { name: "plant", label: "Plant", type: "text", required: true, span: 2 },
  {
    name: "status",
    label: "Status",
    type: "select",
    required: true,
    options: [
      { value: "running", label: "Running" },
      { value: "idle", label: "Idle" },
      { value: "down", label: "Down" },
      { value: "changeover", label: "Changeover" },
    ],
  },
  { name: "target", label: "Production target", type: "number", required: true },
];

function LinesPage() {
  const store = useMes();
  const [plant, setPlant] = useState("all");
  const [status, setStatus] = useState<"all" | LineStatus>("all");
  const [archiving, setArchiving] = useState<ProductionLine | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const { site, revision } = useEngineering();
  const [sort, setSort] = useState("name");
  const plants = useMemo(
    () => [...new Set(store.lines.map((line) => line.plant))].sort(),
    [store.lines],
  );
  const filtered = useMemo(
    () =>
      store.lines
        .filter(
          (line) =>
            (plant === "all" || line.plant === plant) &&
            (status === "all" || line.status === status),
        )
        .sort((a, b) => (sort === "id" ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name))),
    [store.lines, plant, status, sort],
  );
  const lc = useListControls(filtered, {
    searchKeys: ["id", "name", "plant", "status", "currentWorkOrder", "product"],
    exportName: "production-lines",
    scopeKey: [site, plant, status, sort].join("/"),
  });

  return (
    <div className="space-y-6">
      <AssetPageLinks />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Production Lines</h1>
          <p className="text-sm text-muted-foreground">
            {store.lines.length} lines · {store.stations.length} stations configured ·{" "}
            {lc.filtered.length} matching · Draft r{revision}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EntityFormDialog<ProductionLine>
            title="New Production Line"
            description="Engineering draft; production telemetry is not connected."
            fields={createFields}
            initial={{ status: "idle", target: 0 }}
            onSubmit={(values) =>
              store.createLine({
                name: values.name,
                plant: values.plant,
                status: values.status,
                target: Number(values.target) || 0,
                oee: 0,
                availability: 0,
                performance: 0,
                quality: 0,
                output: 0,
                uptime: "—",
              })
            }
            trigger={
              <Button size="sm">
                <Plus /> New Line
              </Button>
            }
          />
        </div>
      </div>

      {lc.toolbar}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <select
          value={plant}
          onChange={(event) => setPlant(event.target.value)}
          aria-label="Filter by plant"
          className="h-9 min-w-48 rounded-md border border-border/60 bg-background px-2 text-xs"
        >
          <option value="all">All plants</option>
          {plants.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | LineStatus)}
          aria-label="Filter by status"
          className="h-9 rounded-md border border-border/60 bg-background px-2 text-xs"
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="idle">Idle</option>
          <option value="down">Down</option>
          <option value="changeover">Changeover</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort lines"
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="name">Name A–Z</option>
          <option value="id">Line ID</option>
        </select>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lc.visible.map((line) => {
          const lineStations = store.stations
            .filter((station) => station.lineId === line.id)
            .sort((a, b) => a.sequence - b.sequence);
          const automatic = lineStations.filter((station) => station.type === "automatic").length;

          return (
            <article key={line.id} className="glass-panel min-w-0 rounded-lg p-4 sm:p-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Factory className="h-3.5 w-3.5" />
                    <span className="font-mono">{line.id}</span>
                    <span>·</span>
                    <span className="truncate">{line.plant}</span>
                  </div>
                  <h2 className="mt-1 truncate text-lg font-semibold">{line.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {lineStations.length} assigned stations
                  </p>
                </div>
                <StatusPill status={line.status} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Planned target</dt>
                  <dd className="font-mono">{line.target.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Production telemetry</dt>
                  <dd>Disconnected</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg border border-border/40 bg-background/40 p-2">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] uppercase text-muted-foreground">
                  <span>Station flow · {lineStations.length}</span>
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3 text-primary" /> {automatic} auto ·{" "}
                    <Hand className="h-3 w-3 text-accent" /> {lineStations.length - automatic}{" "}
                    manual
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                  {lineStations.length === 0 && (
                    <span className="px-2 py-1 text-[11px] text-muted-foreground">
                      No stations configured
                    </span>
                  )}
                  {lineStations.map((station, index) => (
                    <div key={station.id} className="flex items-center gap-1">
                      <div
                        className="grid h-9 min-w-9 place-items-center rounded-md border border-border/60 bg-card/60 px-2 text-[10px] font-mono"
                        title={`${station.name} (${station.type})`}
                      >
                        {station.sequence}
                      </div>
                      {index < lineStations.length - 1 && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/lines/$lineId" params={{ lineId: line.id }}>
                    Open line <ArrowRight />
                  </Link>
                </Button>
                <div className="flex gap-1.5">
                  <EntityFormDialog<ProductionLine>
                    title="Edit Line"
                    fields={editFields}
                    initial={line}
                    onSubmit={(values) => store.updateLine(line.id, values)}
                    trigger={
                      <Button size="icon" variant="outline" title={`Edit ${line.name}`}>
                        <Pencil />
                      </Button>
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setArchiving(line);
                      setArchiveError("");
                    }}
                  >
                    Archive
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
        {lc.visible.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
            {store.lines.length
              ? "No production lines match these filters."
              : "Create the first production line for this factory."}
          </div>
        )}
      </div>
      {lc.pager}
      {archiving && (
        <Dialog
          open
          onOpenChange={(value) => {
            if (!value) setArchiving(null);
          }}
        >
          <DialogContent>
            <DialogTitle>Archive {archiving.name}?</DialogTitle>
            <DialogDescription>
              {store.stations.some((s) => s.lineId === archiving.id)
                ? "This line has assigned stations. Reassign them before archival."
                : "Archiving removes this line from active design. Previous revisions retain its identity."}
            </DialogDescription>
            {archiveError && <p role="alert">{archiveError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchiving(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={store.stations.some((s) => s.lineId === archiving.id)}
                onClick={() => {
                  try {
                    store.deleteLine(archiving.id);
                    setArchiving(null);
                  } catch (error) {
                    setArchiveError(error instanceof Error ? error.message : "Archive refused.");
                  }
                }}
              >
                Archive line in draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
