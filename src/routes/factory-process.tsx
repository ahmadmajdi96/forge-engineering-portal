import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  const { site } = Route.useSearch();
  const load = useQuery({
    queryKey: ["process", site],
    retry: false,
    enabled: !!site,
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
  if (load.isError) return <p role="alert">{load.error.message}</p>;
  if (!load.data) return <p role="status">Loading process routes…</p>;
  return <ProcessEditor key={site} site={site} initial={load.data} />;
}

const input = "min-h-9 rounded-md border bg-background px-2 py-1 text-sm";
const identifiers = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

function ProcessEditor({
  site,
  initial,
}: {
  site: string;
  initial: { revision: number; document: ProcessDocument };
}) {
  const [draft, setDraft] = useState(initial.document);
  const [selection, select] = useState<string | null>(initial.document.routes[0]?.id ?? null);
  const [revision, setRevision] = useState(initial.revision);
  const [issues, setIssues] = useState<string[] | null>(null);
  const route = draft.routes.find((item) => item.id === selection);
  const save = useMutation({
    mutationFn: () =>
      saveFactoryWorkspace({
        data: {
          site,
          workspace: "process",
          payload: draft,
          expected: revision,
          reason: "Saved process workspace draft",
        },
      }),
    onSuccess: ({ revision: nextRevision }) => setRevision(nextRevision),
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
      <header>
        <h1 className="font-display text-2xl font-semibold">Process routes</h1>
        <p className="text-sm text-muted-foreground">
          Factory {site} · Revision {revision}
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
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
        <Button
          type="button"
          variant="outline"
          onClick={addRoute}
          disabled={draft.routes.length >= 50}
        >
          Add route
        </Button>
        <Button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || !draft.routes.length}
        >
          Save draft
        </Button>
        {route && (
          <Button type="button" variant="outline" onClick={() => setIssues(validateRoute(route))}>
            Validate route
          </Button>
        )}
      </div>
      {save.isError && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Saved revision {revision}.</p>}
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
        <>
          <div className="glass-panel grid gap-3 rounded-lg p-4 md:grid-cols-2">
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
            <h2 className="text-lg font-semibold">Steps</h2>
            {route.steps.map((step) => {
              const put = (patch: Partial<typeof step>) =>
                change({
                  steps: route.steps.map((item) =>
                    item.id === step.id ? { ...item, ...patch } : item,
                  ),
                });
              return (
                <fieldset
                  key={step.id}
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
                      onBlur={(event) => put({ stationIds: identifiers(event.target.value) })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Required capabilities
                    <input
                      className={input}
                      defaultValue={step.capabilities.join(", ")}
                      onBlur={(event) => put({ capabilities: identifiers(event.target.value) })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Evidence requirements
                    <input
                      className={input}
                      defaultValue={step.evidence.join(", ")}
                      onBlur={(event) => put({ evidence: identifiers(event.target.value) })}
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
                    onClick={() =>
                      change({
                        steps: route.steps.filter((item) => item.id !== step.id),
                        transitions: route.transitions.filter(
                          (edge) => edge.from !== step.id && edge.to !== step.id,
                        ),
                        start: route.start === step.id ? "" : route.start,
                      })
                    }
                  >
                    Remove step
                  </Button>
                </fieldset>
              );
            })}
            <Button
              variant="outline"
              type="button"
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
            <h2 className="text-lg font-semibold">Transitions</h2>
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
                  <legend className="px-1 text-sm">Transition {index + 1}</legend>
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
              disabled={route.steps.length < 2}
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
        </>
      )}
    </section>
  );
}
