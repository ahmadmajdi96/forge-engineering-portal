import { ProcessDiagram } from "./process-diagram";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProcessRoute } from "@/lib/production/process";
import type { ProcessCatalog } from "@/lib/engineering/process-catalog";

type Step = ProcessRoute["steps"][number];
export function StepRelationships({
  step,
  lineId,
  catalog,
  put,
}: {
  step: Step;
  lineId?: string | undefined;
  catalog: ProcessCatalog;
  put: (patch: Partial<Step>) => void;
}) {
  const [filter, setFilter] = useState("");
  const includes = (id: string, name: string) =>
    (id + " " + name).toLowerCase().includes(filter.trim().toLowerCase());
  const line = catalog.spaces.find((s) => s.kind === "line" && s.engineeringId === lineId);
  const stations = catalog.spaces.filter(
    (s) => s.kind === "station" && (!lineId || s.parentId === line?.id),
  );
  const operations =
    catalog.design?.records.filter(
      (r) =>
        !r.archived &&
        r.kind === "operation" &&
        (!lineId ||
          r.parent === lineId ||
          catalog.design?.stations.some((s) => s.id === r.parent && s.lineId === lineId)),
    ) ?? [];
  const matches = stations.filter((s) => includes(s.id + " " + (s.engineeringId ?? ""), s.label));
  return (
    <fieldset className="col-span-full space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Engineering relationships</legend>
      <label className="engineering-picker-field">
        Find station or operation
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Name or stable ID"
        />
      </label>
      <label className="engineering-picker-field">
        Manufacturing definition
        <select
          value={step.operationId ?? ""}
          onChange={(e) => put({ operationId: e.target.value || undefined })}
        >
          <option value="">No linked operation</option>
          {step.operationId && !operations.some((r) => r.id === step.operationId) && (
            <option value={step.operationId}>{step.operationId} · unresolved</option>
          )}
          {operations
            .filter((r) => r.id === step.operationId || includes(r.id, r.name))
            .slice(0, 100)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.id} · {r.version}
              </option>
            ))}
        </select>
      </label>
      {catalog.designStatus && (
        <p className="text-xs text-muted-foreground">{catalog.designStatus}</p>
      )}
      <div className="text-sm font-medium">Assigned layout stations</div>
      {step.stationIds.map((id) => (
        <div key={id} className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {stations.find((s) => s.id === id)?.label ?? "Unresolved station"} · {id}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => put({ stationIds: step.stationIds.filter((k) => k !== id) })}
          >
            Remove
          </Button>
        </div>
      ))}
      <label className="engineering-picker-field">
        Add station
        <select
          value=""
          disabled={
            !matches.some((s) => !step.stationIds.includes(s.id)) || step.stationIds.length >= 25
          }
          onChange={(e) => {
            if (e.target.value) put({ stationIds: [...step.stationIds, e.target.value] });
          }}
        >
          <option value="">Select a placed station</option>
          {matches
            .filter((s) => !step.stationIds.includes(s.id))
            .slice(0, 100)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.engineeringId ?? s.id}
              </option>
            ))}
        </select>
      </label>
      {(catalog.layoutStatus || !matches.length || matches.length > 100) && (
        <p className="text-xs text-muted-foreground">
          {catalog.layoutStatus ??
            (matches.length
              ? "Showing the first 100 matches. Refine your search."
              : filter
                ? "No matching layout stations."
                : "Place a station in the factory layout to assign it here.")}
        </p>
      )}
    </fieldset>
  );
}

export function RouteGraph({
  route,
  current,
  visit,
}: {
  route: ProcessRoute;
  current: Step | undefined;
  visit: (id: string) => void;
}) {
  const incoming = route.transitions.filter((t) => t.to === current?.id);
  const outgoing = route.transitions.filter((t) => t.from === current?.id);

  const edge = (t: ProcessRoute["transitions"][number], id: string, index: number) => (
    <li key={index} className="space-y-1 rounded border p-2">
      <span className="block text-xs capitalize">
        {t.outcome}
        {t.maxAttempts ? ` · up to ${t.maxAttempts} attempts` : ""}
        {t.condition ? ` · ${t.condition.variable} = ${String(t.condition.equals)}` : " · default"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => visit(id)}
        disabled={!route.steps.some((s) => s.id === id)}
      >
        {route.steps.find((s) => s.id === id)?.name ?? "Missing step"}
      </Button>
    </li>
  );
  if (!current) return null;
  return (
    <section aria-label="Route graph" className="eng-panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Route graph</h2>
        <label className="engineering-picker-field">
          Inspect node
          <select value={current.id} onChange={(e) => visit(e.target.value)}>
            {route.steps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ProcessDiagram route={route} selected={current.id} visit={visit} />
      <div className="grid min-w-0 items-start gap-3 md:grid-cols-3">
        <div>
          <h3 className="mb-2 text-sm font-medium">Incoming paths →</h3>
          <ul className="space-y-1">{incoming.map((t, i) => edge(t, t.from, i))}</ul>
          {!incoming.length && <p>No incoming paths</p>}
        </div>
        <div className="rounded-lg border border-primary bg-primary/5 p-3">
          <small>{current.id === route.start ? "Entry step" : current.outcome}</small>
          <h3 className="font-semibold">{current.name}</h3>
          <a className="ref-issue-link" href={`#process-step-${current.id}`}>
            Edit step
          </a>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">→ Outgoing paths</h3>
          <ul className="space-y-1">{outgoing.map((t, i) => edge(t, t.to, i))}</ul>
          {!outgoing.length && (
            <p>{current.outcome === "operation" ? "No outgoing paths" : "Terminal outcome"}</p>
          )}
        </div>
      </div>
    </section>
  );
}
