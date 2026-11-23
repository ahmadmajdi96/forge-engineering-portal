import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { applicationKind, identifier, type AppKind, type Assignment } from "@/lib/edge/assignment";
import { selectorKeys } from "@/lib/production/assignment.contracts";
import {
  addFactoryAssignment,
  getFactoryAssignments,
  resolveFactoryAssignment,
} from "@/lib/production/assignment.functions";
import { siteKey } from "@/lib/production/contracts";

export const Route = createFileRoute("/factory-assignment")({
  head: () => ({ meta: [{ title: "Application assignments · Engineering Portal" }] }),
  validateSearch: (search) => ({
    site: siteKey.safeParse(search["site"]).data,
    node: identifier.safeParse(search["node"]).data,
    terminal: identifier.safeParse(search["terminal"]).data,
    kind: applicationKind.safeParse(search["kind"]).data,
  }),
  component: FactoryAssignments,
});

const fieldClass = "min-h-10 rounded-md border bg-background p-2";
const selectorLabels: Record<(typeof selectorKeys)[number], string> = {
  lineId: "Line",
  stationId: "Station",
  machineId: "Machine",
  operationId: "Operation",
  stepId: "Step",
  terminalId: "Terminal",
};

function FactoryAssignments() {
  const search = Route.useSearch();
  if (!search.site)
    return <p role="status">Choose an authorized factory to manage its application assignments.</p>;
  return (
    <ScopedAssignments
      key={search.site}
      site={search.site}
      initialNode={search.node}
      terminal={search.terminal}
      initialKind={search.kind ?? "operator"}
    />
  );
}

function downloadFixtureAssignment(record: Assignment) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ems-assignment-${record.id}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function ScopedAssignments({
  site,
  initialNode,
  terminal,
  initialKind,
}: {
  site: string;
  initialNode?: string | undefined;
  terminal?: string | undefined;
  initialKind: AppKind;
}) {
  const client = useQueryClient();
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const [node, setNode] = useState(initialNode ?? "");
  const [kind, setKind] = useState<AppKind>(initialKind);
  const [releaseId, setRelease] = useState("");
  const [configRevision, setConfigRevision] = useState("config-1");
  const [reason, setReason] = useState("");
  const [selectors, setSelectors] = useState<(typeof selectorKeys)[number][]>([
    "lineId",
    "stationId",
    "terminalId",
  ]);
  const [formError, setFormError] = useState("");
  const cursor = pages.at(-1);
  const records = useQuery({
    queryKey: ["factory-assignments", site, cursor ?? null],
    retry: false,
    queryFn: () => getFactoryAssignments({ data: { site, ...(cursor ? { after: cursor } : {}) } }),
  });
  const targets =
    records.data?.targets.filter(({ context }) => !terminal || context.terminalId === terminal) ??
    [];
  const candidate = targets.find(({ context }) => context.nodeId === node) ?? targets[0];
  const result = useMutation({
    mutationFn: () => {
      if (!candidate) throw new Error("Choose an enrolled target.");
      return resolveFactoryAssignment({ data: { site, kind, nodeId: candidate.context.nodeId } });
    },
  });
  const save = useMutation({
    mutationFn: ({ from, until }: { from: number; until: number | null }) => {
      if (!candidate) throw new Error("Choose an enrolled target.");
      return addFactoryAssignment({
        data: {
          id: crypto.randomUUID(),
          site,
          nodeId: candidate.context.nodeId,
          kind,
          releaseId,
          configRevision,
          selectors,
          effectiveFrom: from,
          effectiveUntil: until,
          reason,
        },
      });
    },
    onSuccess: async () => {
      result.reset();
      setReason("");
      setPages([null]);
      await client.invalidateQueries({ queryKey: ["factory-assignments", site] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = form.get("start");
    const end = form.get("end");
    const from = typeof start === "string" && start ? new Date(start).getTime() : Date.now();
    const until = typeof end === "string" && end ? new Date(end).getTime() : null;
    if (!Number.isFinite(from) || (until !== null && (!Number.isFinite(until) || until <= from))) {
      setFormError("Use a valid interval with an end after the start.");
      return;
    }
    setFormError("");
    save.mutate({ from, until });
  }
  const selectedFields = selectorKeys.filter((field) => candidate?.context[field]);

  return (
    <section className="max-w-6xl space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold">Application assignments</h1>
        <p className="text-sm text-muted-foreground">
          Bind an exact published package to a terminal slot and effective interval.
        </p>
      </header>
      {records.isPending && <p role="status">Loading assignments…</p>}
      {records.isError && <p role="alert">{records.error.message}</p>}
      {records.isSuccess && (
        <>
          {targets.length === 0 && (
            <p role="status">
              {terminal
                ? "This terminal has no current scoped enrollment."
                : "This factory has no current scoped edge targets."}
            </p>
          )}
          {candidate && (
            <form
              className="glass-panel grid gap-4 rounded-lg p-4 sm:grid-cols-2"
              onSubmit={submit}
            >
              <label className="grid gap-1 text-sm">
                Target node
                <select
                  className={fieldClass}
                  value={candidate.context.nodeId}
                  onChange={(event) => {
                    setNode(event.target.value);
                    result.reset();
                  }}
                >
                  {targets.map(({ context, provenance }) => (
                    <option key={context.nodeId} value={context.nodeId}>
                      {context.nodeId} · {context.terminalId} · {provenance}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Runtime slot
                <select
                  className={fieldClass}
                  value={kind}
                  onChange={(event) => {
                    setKind(applicationKind.parse(event.target.value));
                    result.reset();
                  }}
                >
                  <option value="operator">Operator application</option>
                  <option value="hmi">HMI</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Published package
                <select
                  className={fieldClass}
                  required
                  value={releaseId}
                  onChange={(event) => setRelease(event.target.value)}
                >
                  <option value="">Choose a release</option>
                  {records.data.releases.map((release) => (
                    <option key={release.id} value={release.id}>
                      {release.application_id} · rev {release.revision}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Configuration revision
                <input
                  className={fieldClass}
                  required
                  maxLength={96}
                  value={configRevision}
                  onChange={(event) => setConfigRevision(event.target.value)}
                />
              </label>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="font-medium">Context constraints</legend>
                <div className="flex flex-wrap gap-3">
                  {selectedFields.map((field) => (
                    <label key={field} className="flex min-h-10 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectors.includes(field)}
                        onChange={(event) =>
                          setSelectors(
                            event.target.checked
                              ? [...selectors, field]
                              : selectors.filter((value) => value !== field),
                          )
                        }
                      />
                      {selectorLabels[field]} · {candidate.context[field]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="grid gap-1 text-sm">
                Effective from (local time)
                <input
                  className={fieldClass}
                  name="start"
                  type="datetime-local"
                  aria-describedby="start-hint"
                />
                <span id="start-hint" className="text-muted-foreground">
                  Leave blank to start now.
                </span>
              </label>
              <label className="grid gap-1 text-sm">
                Effective until (local time, optional)
                <input className={fieldClass} name="end" type="datetime-local" />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                Assignment reason
                <textarea
                  className={fieldClass}
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" disabled={save.isPending || !releaseId || !selectors.length}>
                  Assign package
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={result.isPending}
                  onClick={() => result.mutate()}
                >
                  Resolve current assignment
                </Button>
              </div>
            </form>
          )}
          {formError && (
            <p role="alert" className="text-destructive">
              {formError}
            </p>
          )}
          {save.isError && (
            <p role="alert" className="text-destructive">
              {save.error.message}
            </p>
          )}
          {save.isSuccess && <p role="status">Assignment recorded.</p>}
          {result.isError && (
            <p role="alert" className="text-destructive">
              {result.error.message}
            </p>
          )}
          {result.data && (
            <section className="glass-panel space-y-2 rounded-lg p-4">
              <h2 className="font-semibold">Current resolution</h2>
              {result.data.status === "resolved" ? (
                <>
                  <p>Assignment {result.data.assignment.id} selected.</p>
                  <p className="break-all text-sm">
                    Release {result.data.assignment.releaseId} · configuration{" "}
                    {result.data.assignment.configRevision}
                  </p>
                  {result.data.overridden.length > 0 && (
                    <p className="text-sm">
                      Overridden assignments {result.data.overridden.join(", ")}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">{result.data.issues.join(". ")}</p>
              )}
            </section>
          )}

          <h2 className="font-semibold">Recorded assignments</h2>
          {records.data.assignments.length === 0 && (
            <p className="text-muted-foreground">No assignments recorded.</p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {records.data.assignments.map((record) => (
              <article key={record.id} className="glass-panel space-y-2 rounded-lg p-4">
                <h3 className="font-semibold">
                  {record.nodeId} · {record.kind === "hmi" ? "HMI" : "Operator app"}
                </h3>
                <p className="break-all font-mono text-xs">Release {record.releaseId}</p>
                <p className="text-sm">Configuration {record.configRevision}</p>
                {records.data.targets.some(
                  ({ provenance, context }) =>
                    provenance === "fixture" && context.nodeId === record.nodeId,
                ) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFixtureAssignment(record)}
                  >
                    Download fixture assignment
                  </Button>
                )}

                <p className="text-sm">
                  {new Date(record.effectiveFrom).toISOString()} –{" "}
                  {record.effectiveUntil === null
                    ? "open"
                    : new Date(record.effectiveUntil).toISOString()}
                </p>
              </article>
            ))}
          </div>
          {(pages.length > 1 || records.data.next) && (
            <nav className="flex gap-2" aria-label="Assignment pages">
              <Button
                type="button"
                variant="outline"
                disabled={pages.length === 1}
                onClick={() => setPages((past) => past.slice(0, -1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!records.data.next}
                onClick={() => setPages((past) => [...past, records.data.next])}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
