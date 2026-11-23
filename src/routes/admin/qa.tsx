import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { siteKey } from "@/lib/production/contracts";
import type { QaReport } from "@/lib/production/qa.server";

export const Route = createFileRoute("/admin/qa")({
  validateSearch: (search) => ({ site: siteKey.safeParse(search["site"]).data }),
  component: AdminQa,
});

function AdminQa() {
  const search = Route.useSearch();
  const { ems } = Route.useRouteContext();
  const site = search.site ?? ems.identity?.sites[0]?.key;
  const [filter, setFilter] = useState("all");
  const query = useQuery({
    queryKey: ["qa", site],
    enabled: !!site,
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<QaReport> => {
      const response = await fetch(`/api/ems/qa?site=${encodeURIComponent(site!)}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "You do not have Admin QA access to this factory."
            : response.status === 401
              ? "Sign in to review factory evidence."
              : "Factory evidence is temporarily unavailable.",
        );
      return response.json();
    },
  });
  return (
    <section className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Admin QA</h1>
        <p className="text-sm text-muted-foreground">
          Release and operational evidence for {site ?? "the selected factory"}.
        </p>
      </header>
      {!site && <p role="status">Choose a factory to check its evidence.</p>}
      {site && query.isPending && <p role="status">Checking factory evidence…</p>}
      {query.error && (
        <div role="alert" className="flex flex-wrap gap-3">
          {query.error.message}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      )}
      {query.data && (
        <>
          <dl className="glass-panel grid gap-3 rounded-lg p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Environment</dt>
              <dd>{query.data.environment}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source revision</dt>
              <dd className="break-all">{query.data.sourceRevision ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Image digest</dt>
              <dd className="break-all">{query.data.imageDigest ?? "Unknown"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Evidence status
              <select
                className="min-h-10 rounded-md border bg-background px-3"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All checks ({query.data.checks.length})</option>
                <option value="unresolved">
                  Unresolved ({query.data.checks.filter((c) => c.status !== "pass").length})
                </option>
                <option value="passed">
                  Passed ({query.data.checks.filter((c) => c.status === "pass").length})
                </option>
              </select>
            </label>
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? "Refreshing…" : "Refresh evidence"}
            </Button>
          </div>
          <div
            className="max-w-full overflow-x-auto rounded-lg border"
            role="region"
            aria-label="Factory evidence checks"
            tabIndex={0}
          >
            <table className="w-full min-w-[580px] text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {["Check", "Status", "Evidence", "Checked at"].map((name) => (
                    <th key={name} className="px-4 py-3">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!query.data.checks.some(
                  (c) => filter === "all" || (filter === "passed") === (c.status === "pass"),
                ) && (
                  <tr>
                    <td colSpan={4} className="p-4 text-muted-foreground">
                      No checks match this status.
                    </td>
                  </tr>
                )}
                {query.data.checks
                  .filter(
                    (c) => filter === "all" || (filter === "passed") === (c.status === "pass"),
                  )
                  .map((check, index) => (
                    <tr key={`${check.name}-${index}`} className="border-t">
                      <th scope="row" className="px-4 py-3 font-medium">
                        {check.name}
                      </th>
                      <td className="px-4 py-3">
                        <Badge
                          variant={check.status === "fail" ? "destructive" : "outline"}
                          className={
                            check.status === "pass"
                              ? "text-success"
                              : check.status === "blocked" || check.status === "stale"
                                ? "text-warning"
                                : ""
                          }
                        >
                          {check.status}
                        </Badge>
                      </td>
                      <td className="min-w-56 px-4 py-3 [overflow-wrap:anywhere]">
                        {check.evidence}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <time dateTime={check.checkedAt}>
                          {new Date(check.checkedAt).toLocaleString()}
                        </time>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
