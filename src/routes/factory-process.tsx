import { stationHandoffIssues } from "@/lib/production/process-links";
import { LineSections } from "@/components/engineering/line-sections";
import { useProcessCatalog } from "@/lib/engineering/process-catalog";
import { RouteGraph, StepRelationships } from "@/components/engineering/process-relationships";
import { WorkspaceLoading } from "@/components/engineering/workspace-loading";
import { EngineeringJourney } from "@/components/engineering/journey-rail";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { siteKey } from "@/lib/production/contracts";
import { validateRoute, type ProcessDocument, type ProcessRoute } from "@/lib/production/process";
import { useProcessRevision } from "@/lib/production/use-process-revision";
import { saveFactoryWorkspace } from "@/lib/production/workspace.functions";

export const Route = createFileRoute("/factory-process")({
  validateSearch: (
    search,
  ): {
    site?: string | undefined;
    routeId?: string | undefined;
    stepId?: string | undefined;
  } => ({
    site: siteKey.safeParse(search["site"]).data,
    routeId: typeof search["routeId"] === "string" ? search["routeId"] : undefined,
    stepId: typeof search["stepId"] === "string" ? search["stepId"] : undefined,
  }),
  component: FactoryProcess,
});

function FactoryProcess() {
  const search = Route.useSearch();
  const { ems } = Route.useRouteContext();
  const site = search.site ?? ems.identity?.sites[0]?.key;
  const load = useProcessRevision(site ?? "", !!site);
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
      key={JSON.stringify([site, search.engLine, search.routeId, search.stepId])}
      initialRouteId={search.routeId}
      initialStepId={search.stepId}
      permissions={ems.identity?.sites.find((item) => item.key === site)?.actions ?? []}
      lineContext={search.engLine}
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
  permissions,
  initialRouteId,
  initialStepId,
  lineContext,
  initial,
  reload,
}: {
  site: string;
  permissions: string[];
  initialRouteId?: string | undefined;
  initialStepId?: string | undefined;
  lineContext?: string | undefined;
  initial: ProcessSnapshot;
  reload: () => Promise<ProcessSnapshot>;
}) {
  const catalog = useProcessCatalog(site, permissions);
  const [draft, setDraft] = useState(initial.document);
  const [selection, select] = useState<string | null>(
    initialRouteId ?? initial.document.routes[0]?.id ?? null,
  );
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
      (current.pathname !== next.pathname ||
        current.search.site !== next.search.site ||
        current.search.engLine !== next.search.engLine) &&
      !window.confirm("Discard the unsaved process draft and leave this factory?"),
  });
  const [issues, setIssues] = useState<string[] | null>(null);
  const visibleRoutes = draft.routes.filter((item) => !lineContext || item.lineId === lineContext);
  const route = visibleRoutes.find((item) => item.id === selection) ?? visibleRoutes[0];
  const [focus, setFocus] = useState(initialStepId ?? "");
  const activeStep =
    route?.steps.find((step) => step.id === focus) ??
    route?.steps.find((step) => step.id === route.start) ??
    route?.steps[0];
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
      routes: draft.routes.map((item) => (item.id === route?.id ? { ...item, ...update } : item)),
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
          ...(lineContext ? { lineId: lineContext } : {}),
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
  const lineName = catalog.design?.lines.find(
    (item) => item.id === (route?.lineId ?? lineContext),
  )?.name;
  return (
    <section className="ems-process-editor">
      <header className="ems-workspace-head">
        <div>
          <span className="ems-eyebrow">Process design</span>
          <h1>Process routes</h1>
          <p>
            {site} · {revision ? `Revision ${revision}` : "First draft"}
            {route ? ` · ${route.name}` : ""}
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
      <EngineeringJourney
        stage="process"
        scope={{ site, lineId: route?.lineId ?? lineContext, lineName }}
        access={{ native: true, actions: permissions }}
      />
      <div className="ems-process-toolbar">
        <label className="ems-process-route grid min-w-0 gap-1 text-xs font-medium">
          Process route
          <select
            aria-label="Process route"
            className={input}
            value={route?.id ?? ""}
            onChange={(event) => {
              select(event.target.value);
              setIssues(null);
            }}
          >
            <option value="" disabled>
              Choose a route
            </option>
            {visibleRoutes.map((item) => (
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
          disabled={
            draft.routes.length >= 50 ||
            save.isPending ||
            !permissions.includes("ems.factory_process.edit")
          }
        >
          Add route
        </Button>
        {route && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setIssues([
                ...validateRoute(route),
                ...(catalog.design ? stationHandoffIssues(route, catalog.design) : []),
              ])
            }
          >
            Validate route
          </Button>
        )}
        {permissions.includes("ems.factory_process.edit") && draft.routes.length > 0 && (
          <form
            className="ems-process-save"
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
      </div>
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
                <li key={issue}>
                  {route?.steps.some((step) => issue.startsWith(step.name + " ")) ? (
                    <a
                      className="ref-issue-link"
                      onClick={() => {
                        const step = route.steps.find((step) => issue.startsWith(step.name + " "));
                        if (step) setFocus(step.id);
                      }}
                      href={`#process-step-${route.steps.find((step) => issue.startsWith(step.name + " "))?.id}`}
                    >
                      {issue}
                    </a>
                  ) : (
                    issue
                  )}
                </li>
              ))}
            </ul>
          ) : (
            "Route structure passed validation."
          )}
        </div>
      )}
      {!route && (
        <p className="text-sm text-muted-foreground">
          Add a route to define its entry step, station requirements and transitions.
        </p>
      )}
      {route && (
        <div className="ems-process-workbench">
          <div className="ems-process-outline">
            <h2 className="ems-process-pane-title">Route outline</h2>
            {activeStep && !dirty && permissions.includes("ems.factory_layout.view") && (
              <Link
                className="ref-issue-link"
                to="/factory-layout"
                search={{
                  site,
                  line: route.lineId,
                  traceRoute: route.id,
                  traceStep: activeStep.id,
                }}
              >
                Trace {activeStep.name} in 3D
              </Link>
            )}
            <LineSections
              key={route.id}
              route={route}
              readOnly={recover.isPending || !permissions.includes("ems.factory_process.edit")}
              change={change}
              visit={setFocus}
            />
            <RouteGraph route={route} current={activeStep} visit={setFocus} />
          </div>
          <fieldset
            disabled={recover.isPending || !permissions.includes("ems.factory_process.edit")}
            aria-label="Process route definition"
            className="ems-process-inspector"
          >
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">
                Selected step{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {route.steps.length} in route
                </span>
              </h2>
              {route.steps
                .filter((step) => step.id === activeStep?.id)
                .map((step) => {
                  const put = (patch: Partial<typeof step>) =>
                    change({
                      steps: route.steps.map((item) =>
                        item.id === step.id ? { ...item, ...patch } : item,
                      ),
                    });
                  return (
                    <fieldset
                      key={`${route.id}-${formVersion}-${step.id}`}
                      id={`process-step-${step.id}`}
                      tabIndex={-1}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"
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
                            put({
                              outcome: event.target.value as typeof step.outcome,
                            })
                          }
                        >
                          <option value="operation">Operation</option>
                          <option value="complete">Complete</option>
                          <option value="failed">Failed</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        Process section
                        <select
                          className={input}
                          value={step.sectionId ?? ""}
                          onChange={(e) => put({ sectionId: e.target.value || undefined })}
                        >
                          <option value="">Unassigned</option>
                          {route.sections?.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <StepRelationships
                        step={step}
                        lineId={route.lineId}
                        catalog={catalog}
                        put={put}
                      />
                      <label className="grid gap-1 text-sm">
                        Required capabilities
                        <input
                          className={input}
                          defaultValue={step.capabilities.join(", ")}
                          onChange={(event) =>
                            put({
                              capabilities: identifiers(event.target.value),
                            })
                          }
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
                  setFocus(id);
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
                Outgoing transitions{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({route.transitions.filter((edge) => edge.from === activeStep?.id).length})
                </span>
              </h2>
              {route.transitions.map((edge, index) => {
                if (
                  edge.from !== activeStep?.id &&
                  route.steps.some((step) => step.id === edge.from)
                )
                  return null;
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
                          put({
                            outcome,
                            maxAttempts: outcome === "rework" ? 1 : null,
                          });
                        }}
                      >
                        <option value="success">Success</option>
                        <option value="failure">Failure</option>
                        <option value="rework">Rework</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Condition variable
                      <input
                        className={input}
                        value={edge.condition?.variable ?? ""}
                        placeholder="Default path"
                        onChange={(e) =>
                          put({
                            condition: e.target.value
                              ? {
                                  variable: e.target.value,
                                  equals: edge.condition?.equals ?? "",
                                }
                              : null,
                          })
                        }
                      />
                    </label>
                    {edge.condition && (
                      <>
                        <label className="grid gap-1 text-sm">
                          Comparison type
                          <select
                            className={input}
                            value={typeof edge.condition.equals}
                            onChange={(e) =>
                              put({
                                condition: {
                                  variable: edge.condition!.variable,
                                  equals:
                                    e.target.value === "number"
                                      ? 0
                                      : e.target.value === "boolean"
                                        ? false
                                        : "",
                                },
                              })
                            }
                          >
                            <option value="string">Text</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          Equals
                          {typeof edge.condition.equals === "boolean" ? (
                            <select
                              className={input}
                              value={String(edge.condition.equals)}
                              onChange={(e) =>
                                put({
                                  condition: {
                                    variable: edge.condition!.variable,
                                    equals: e.target.value === "true",
                                  },
                                })
                              }
                            >
                              <option>false</option>
                              <option>true</option>
                            </select>
                          ) : (
                            <input
                              className={input}
                              type={typeof edge.condition.equals === "number" ? "number" : "text"}
                              value={edge.condition.equals}
                              onChange={(e) =>
                                put({
                                  condition: {
                                    variable: edge.condition!.variable,
                                    equals:
                                      typeof edge.condition!.equals === "number"
                                        ? Number(e.target.value)
                                        : e.target.value,
                                  },
                                })
                              }
                            />
                          )}
                        </label>
                      </>
                    )}
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
                        change({
                          transitions: route.transitions.filter((_, at) => at !== index),
                        })
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
                disabled={!activeStep || route.steps.length < 2 || route.transitions.length >= 1000}
                onClick={() =>
                  change({
                    transitions: [
                      ...route.transitions,
                      {
                        from: activeStep!.id,
                        to: route.steps.find((step) => step.id !== activeStep?.id)!.id,
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
            <details className="ems-route-properties" open>
              <summary>Route properties</summary>
              <div key={route.id + "-" + formVersion} className="grid gap-3 md:grid-cols-2">
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
                <label className="grid gap-1 text-sm">
                  Production line
                  <select
                    className={input}
                    value={route.lineId ?? ""}
                    onChange={(e) => change({ lineId: e.target.value || undefined })}
                  >
                    <option value="">Factory-wide</option>
                    {route.lineId &&
                      !catalog.design?.lines.some((l) => l.id === route.lineId && !l.archived) && (
                        <option value={route.lineId}>{route.lineId} · unresolved</option>
                      )}
                    {catalog.design?.lines
                      .filter((l) => !l.archived && (!lineContext || l.id === lineContext))
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} · {l.id}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="text-sm text-muted-foreground">
                  External references identify exact revisions. Their upstream resolution is
                  unavailable here.
                </p>
                {(["product", "recipe", "quality"] as const).map((kind) => (
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
                              ? {
                                  object: event.target.value,
                                  revision: route[kind]?.revision ?? "",
                                }
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
                            [kind]: {
                              object: route[kind]?.object ?? "",
                              revision: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </fieldset>
                ))}
              </div>
            </details>
          </fieldset>
        </div>
      )}
    </section>
  );
}
