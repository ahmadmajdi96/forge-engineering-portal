import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { siteKey } from "@/lib/production/contracts";
import type { QaReport } from "@/lib/production/qa.server";

export const Route = createFileRoute("/admin/qa")({
  validateSearch: (search) => ({ site: siteKey.safeParse(search["site"]).data }),
  component: AdminQa,
});

function AdminQa() {
  const { site } = Route.useSearch();
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
      {query.isPending && <p role="status">Checking factory evidence…</p>}
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
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[680px] text-left text-sm">
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
                {query.data.checks.map((check, index) => (
                  <tr key={`${check.name}-${index}`} className="border-t">
                    <th scope="row" className="px-4 py-3 font-medium">
                      {check.name}
                    </th>
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap rounded border px-2 py-1 font-medium">
                        {check.status}
                      </span>
                    </td>
                    <td className="break-all px-4 py-3">{check.evidence}</td>
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
