import { WorkspaceLoading } from "@/components/engineering/workspace-loading";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { siteKey } from "@/lib/production/contracts";
import {
  processDocumentSchema,
  validateRoute,
  type ProcessDocument,
  type ProcessRoute,
} from "@/lib/production/process";
import { loadFactoryWorkspace, saveFactoryWorkspace } from "@/lib/production/workspace.functions";

export const Route = createFileRoute("/factory-process")({
  validateSearch: (search) => ({ site: siteKey.safeParse(search["site"]).data }),
  component: FactoryProcess,
});

function FactoryProcess() {
  const search = Route.useSearch();
  const { ems } = Route.useRouteContext();
  const site = search.site ?? ems.identity?.sites[0]?.key;
  const load = useQuery({
    queryKey: ["process", site],
    retry: false,
    enabled: !!site,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await loadFactoryWorkspace({ data: { site: site!, workspace: "process" } });
      return {
        revision: result.revision,
        document: result.payload
          ? processDocumentSchema.parse(result.payload)
          : { version: 1 as const, routes: [] },
      };
    },
  });
  if (!site) return <p>Choose a factory.</p>;
  if (load.isError && !load.data)
    return (
      <div className="eng-panel space-y-3">
        <h1 className="font-display text-2xl font-semibold">Process routes</h1>
        <p role="alert">{load.error.message}</p>
        <Button variant="outline" onClick={() => void load.refetch()} disabled={load.isFetching}>
          Retry loading routes
        </Button>
      </div>
    );
  if (!load.data)
    return (
      <section className="space-y-4">
        <h1 className="font-display text-2xl font-semibold">Process routes</h1>
        <WorkspaceLoading message="Loading process routes…" />
      </section>
    );
  return (
    <ProcessEditor
      key={site}
      site={site}
      initial={load.data}
      reload={async () => {
        const result = await load.refetch({ throwOnError: true });
        if (!result.data) throw new Error("The current process revision is unavailable.");
        return result.data;
      }}
    />
  );
}

const input = "min-w-0 max-w-full min-h-10 rounded-md border bg-background px-2 py-1 text-sm";
const identifiers = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

type ProcessSnapshot = { revision: number; document: ProcessDocument };

function ProcessEditor({
  site,
  initial,
  reload,
}: {
  site: string;
  initial: ProcessSnapshot;
  reload: () => Promise<ProcessSnapshot>;
}) {
  const [draft, setDraft] = useState(initial.document);
  const [selection, select] = useState<string | null>(initial.document.routes[0]?.id ?? null);
  const [baseline, setBaseline] = useState(initial);
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const revision = baseline.revision;
  const dirty = draft !== baseline.document;
  const [formVersion, resetForm] = useState(0);
  useBlocker({
    enableBeforeUnload: dirty,
    shouldBlockFn: ({ current, next }) =>
      dirty &&
      (current.pathname !== next.pathname || current.search.site !== next.search.site) &&
      !window.confirm("Discard the unsaved process draft and leave this factory?"),
  });
  const [issues, setIssues] = useState<string[] | null>(null);
  const route = draft.routes.find((item) => item.id === selection);
  const save = useMutation({
    mutationFn: (document: ProcessDocument) =>
      saveFactoryWorkspace({
        data: {
          site,
          workspace: "process",
          payload: document,
          expected: revision,
          reason: reason.trim(),
        },
      }),
    onSuccess: ({ revision: nextRevision }, document) => {
      const next = { revision: nextRevision, document };
      setBaseline(next);
      client.setQueryData(["process", site], next);
      setReason("");
    },
  });
  const recover = useMutation({
    mutationFn: reload,
    onSuccess: (snapshot) => {
      setBaseline(snapshot);
      setDraft(snapshot.document);
      select(
        snapshot.document.routes.find((item) => item.id === selection)?.id ??
          snapshot.document.routes[0]?.id ??
          null,
      );
      resetForm((n) => n + 1);
      setIssues(null);
      setReason("");
      save.reset();
    },
  });
  function change(update: Partial<ProcessRoute>) {
    setIssues(null);
    setDraft({
      ...draft,
      routes: draft.routes.map((item) => (item.id === selection ? { ...item, ...update } : item)),
    });
  }
  function addRoute() {
    const routeId = crypto.randomUUID();
    setDraft({
      ...draft,
      routes: [
        ...draft.routes,
        {
          id: routeId,
          name: "New process route",
          start: "",
          product: null,
          recipe: null,
          steps: [],
          transitions: [],
        },
      ],
    });
    setIssues(null);
    select(routeId);
  }
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold">Process routes</h1>
          <p className="text-sm text-muted-foreground">
            {site} · {revision ? `Revision ${revision}` : "First draft"}
          </p>
        </div>
        {dirty && (
          <span
            role="status"
            className="rounded-md border border-border bg-muted px-2 py-1 text-xs"
          >
            Unsaved changes
          </span>
        )}
      </header>
      <div className="eng-panel flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 gap-1 text-xs font-medium">
          Process route
          <select
            aria-label="Process route"
            className={input}
            value={selection ?? ""}
            onChange={(event) => {
              select(event.target.value);
              setIssues(null);
            }}
          >
            <option value="" disabled>
              Choose a route
            </option>
            {draft.routes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={addRoute}
          disabled={draft.routes.length >= 50}
        >
          Add route
        </Button>
        {route && (
          <Button type="button" variant="outline" onClick={() => setIssues(validateRoute(route))}>
            Validate route
          </Button>
        )}
      </div>
      {!route && (
        <p className="text-sm text-muted-foreground">
          Add a route to define its entry step, station requirements and transitions.
        </p>
      )}
      {draft.routes.length > 0 && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty && !save.isPending && !recover.isPending && reason.trim().length >= 3)
              save.mutate(draft);
          }}
        >
          <label className="grid min-w-0 flex-1 gap-1 text-sm">
            Revision reason
            <input
              className={input}
              required
              minLength={3}
              maxLength={500}
              value={reason}
              placeholder="What changed in this revision?"
              disabled={save.isPending}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            disabled={!dirty || reason.trim().length < 3 || save.isPending || recover.isPending}
          >
            {save.isPending ? "Saving…" : "Save draft"}
          </Button>
        </form>
      )}
      {save.isSuccess && !dirty && <p role="status">Saved revision {revision}.</p>}
      {save.isError && (
        <div className="space-y-2 rounded-lg border border-destructive/50 p-3">
          <p role="alert">{save.error.message}</p>
          <Button
            variant="outline"
            disabled={recover.isPending || save.isPending}
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Discard unsaved changes and reload the current server revision?")
              )
                recover.mutate();
            }}
          >
            {recover.isPending ? "Loading…" : "Reload saved revision"}
          </Button>
          {recover.isError && <p role="alert">{recover.error.message}</p>}
        </div>
      )}
      {issues && (
        <div role="status" className="glass-panel rounded-lg p-3">
          {issues.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            "Route structure passed validation."
          )}
        </div>
      )}
      {route && (
        <fieldset
          disabled={recover.isPending}
          aria-label="Process route definition"
          className="min-w-0 space-y-4"
        >
          <div key={formVersion} className="glass-panel grid gap-3 rounded-lg p-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Route name
              <input
                className={input}
                value={route.name}
                onChange={(event) => change({ name: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Entry step
              <select
                className={input}
                value={route.start}
                onChange={(event) => change({ start: event.target.value })}
              >
                <option value="">Choose entry</option>
                {route.steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.name}
                  </option>
                ))}
              </select>
            </label>
            {(["product", "recipe"] as const).map((kind) => (
              <fieldset key={kind} className="grid gap-2 rounded border p-2">
                <legend className="px-1 capitalize">{kind} reference</legend>
                <label className="grid gap-1 text-sm">
                  Object ID
                  <input
                    className={input}
                    value={route[kind]?.object ?? ""}
                    onChange={(event) =>
                      change({
                        [kind]: event.target.value
                          ? { object: event.target.value, revision: route[kind]?.revision ?? "" }
                          : null,
                      })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Exact revision
                  <input
                    className={input}
                    value={route[kind]?.revision ?? ""}
                    onChange={(event) =>
                      change({
                        [kind]: { object: route[kind]?.object ?? "", revision: event.target.value },
                      })
                    }
                  />
                </label>
              </fieldset>
            ))}
          </div>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">
              Steps{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({route.steps.length})
              </span>
            </h2>
            {route.steps.map((step) => {
              const put = (patch: Partial<typeof step>) =>
                change({
                  steps: route.steps.map((item) =>
                    item.id === step.id ? { ...item, ...patch } : item,
                  ),
                });
              return (
                <fieldset
                  key={`${selection}-${formVersion}-${step.id}`}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <legend className="px-1 text-sm">{step.name}</legend>
                  <label className="grid gap-1 text-sm">
                    Name
                    <input
                      className={input}
                      value={step.name}
                      onChange={(event) => put({ name: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Type
                    <select
                      className={input}
                      value={step.outcome}
                      onChange={(event) =>
                        put({ outcome: event.target.value as typeof step.outcome })
                      }
                    >
                      <option value="operation">Operation</option>
                      <option value="complete">Complete</option>
                      <option value="failed">Failed</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Station IDs
                    <input
                      className={input}
                      defaultValue={step.stationIds.join(", ")}
                      onChange={(event) => put({ stationIds: identifiers(event.target.value) })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Required capabilities
                    <input
                      className={input}
                      defaultValue={step.capabilities.join(", ")}
                      onChange={(event) => put({ capabilities: identifiers(event.target.value) })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Evidence requirements
                    <input
                      className={input}
                      defaultValue={step.evidence.join(", ")}
                      onChange={(event) => put({ evidence: identifiers(event.target.value) })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Expected duration (seconds)
                    <input
                      className={input}
                      type="number"
                      min={0}
                      value={step.expectedSeconds}
                      onChange={(event) => put({ expectedSeconds: Number(event.target.value) })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Wait timeout (seconds)
                    <input
                      className={input}
                      type="number"
                      min={1}
                      value={step.waitTimeoutSeconds ?? ""}
                      onChange={(event) =>
                        put({
                          waitTimeoutSeconds: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    />
                  </label>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      const links = route.transitions.filter(
                        (edge) => edge.from === step.id || edge.to === step.id,
                      ).length;
                      if (
                        !window.confirm(
                          `Remove "${step.name}"${links ? ` and ${links} connected transition${links === 1 ? "" : "s"}` : ""} from this draft?`,
                        )
                      )
                        return;
                      change({
                        steps: route.steps.filter((item) => item.id !== step.id),
                        transitions: route.transitions.filter(
                          (edge) => edge.from !== step.id && edge.to !== step.id,
                        ),
                        start: route.start === step.id ? "" : route.start,
                      });
                    }}
                  >
                    Remove step
                  </Button>
                </fieldset>
              );
            })}
            <Button
              variant="outline"
              type="button"
              disabled={route.steps.length >= 300}
              onClick={() => {
                const id = crypto.randomUUID();
                change({
                  start: route.start || id,
                  steps: [
                    ...route.steps,
                    {
                      id,
                      name: "New step",
                      outcome: "operation",
                      stationIds: [],
                      capabilities: [],
                      evidence: [],
                      expectedSeconds: 0,
                      waitTimeoutSeconds: null,
                    },
                  ],
                });
              }}
            >
              Add step
            </Button>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">
              Transitions{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({route.transitions.length})
              </span>
            </h2>
            {route.transitions.map((edge, index) => {
              const put = (patch: Partial<typeof edge>) =>
                change({
                  transitions: route.transitions.map((item, at) =>
                    at === index ? { ...item, ...patch } : item,
                  ),
                });
              return (
                <fieldset
                  key={index}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <legend className="px-1 text-sm">
                    {route.steps.find((s) => s.id === edge.from)?.name ?? "Missing step"} →{" "}
                    {route.steps.find((s) => s.id === edge.to)?.name ?? "Missing step"}
                  </legend>
                  {(["from", "to"] as const).map((field) => (
                    <label key={field} className="grid gap-1 text-sm capitalize">
                      {field}
                      <select
                        className={input}
                        value={edge[field]}
                        onChange={(event) => put({ [field]: event.target.value })}
                      >
                        {route.steps.map((step) => (
                          <option key={step.id} value={step.id}>
                            {step.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="grid gap-1 text-sm">
                    Outcome
                    <select
                      className={input}
                      value={edge.outcome}
                      onChange={(event) => {
                        const outcome = event.target.value as typeof edge.outcome;
                        put({ outcome, maxAttempts: outcome === "rework" ? 1 : null });
                      }}
                    >
                      <option value="success">Success</option>
                      <option value="failure">Failure</option>
                      <option value="rework">Rework</option>
                    </select>
                  </label>
                  {edge.outcome === "rework" && (
                    <label className="grid gap-1 text-sm">
                      Maximum attempts
                      <input
                        className={input}
                        type="number"
                        min={1}
                        max={20}
                        value={edge.maxAttempts ?? 1}
                        onChange={(event) => put({ maxAttempts: Number(event.target.value) })}
                      />
                    </label>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      change({ transitions: route.transitions.filter((_, at) => at !== index) })
                    }
                  >
                    Remove transition
                  </Button>
                </fieldset>
              );
            })}
            <Button
              variant="outline"
              type="button"
              disabled={route.steps.length < 2 || route.transitions.length >= 1000}
              onClick={() =>
                change({
                  transitions: [
                    ...route.transitions,
                    {
                      from: route.steps[0]!.id,
                      to: route.steps[1]!.id,
                      outcome: "success",
                      condition: null,
                      maxAttempts: null,
                    },
                  ],
                })
              }
            >
              Add transition
            </Button>
          </section>
        </fieldset>
      )}
    </section>
  );
}
