import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  getFactoryReleases,
  submitFactoryRelease,
  updateFactoryRelease,
} from "@/lib/production/release.functions";
import { siteKey } from "@/lib/production/contracts";

export const Route = createFileRoute("/factory-releases")({
  validateSearch: (search) => ({
    site: siteKey.safeParse(search["site"]).data,
    app: z.string().max(96).safeParse(search["app"]).data,
    revision: z.coerce.number().int().positive().safeParse(search["revision"]).data,
  }),
  component: FactoryReleases,
});

function FactoryReleases() {
  const search = Route.useSearch();
  const { site } = search;
  const [app, setApp] = useState(search.app ?? "");
  const [revision, setRevision] = useState(search.revision ? String(search.revision) : "");
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const key = ["factory-releases", site];
  const releases = useQuery({
    queryKey: key,
    enabled: !!site,
    retry: false,
    queryFn: () => getFactoryReleases({ data: { site: site! } }),
  });
  const transition = useMutation({
    mutationFn: async (
      command: {
        id: string;
        action: "approve" | "publish";
        expected: "submitted" | "approved";
      } | null,
    ) => {
      if (!site) throw new Error("Choose a factory.");
      return command
        ? updateFactoryRelease({ data: { site, reason, ...command } })
        : submitFactoryRelease({ data: { site, reason, app, revision: Number(revision) } });
    },
    onSuccess: async () => {
      setReason("");
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const ready = reason.trim().length >= 3 && !transition.isPending;
  return (
    <section className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold">Factory releases</h1>
        <p className="text-sm text-muted-foreground">
          Review and sign the exact saved application revision.
        </p>
      </header>
      <form
        className="glass-panel grid max-w-4xl gap-3 rounded-lg p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          transition.mutate(null);
        }}
      >
        <label className="grid gap-1 text-sm">
          Application ID
          <input
            required
            value={app}
            maxLength={96}
            className="rounded-md border bg-background p-2"
            onChange={(event) => setApp(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Saved Studio revision
          <input
            required
            type="number"
            min={1}
            value={revision}
            className="rounded-md border bg-background p-2"
            onChange={(event) => setRevision(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          Reason for this action
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            className="rounded-md border bg-background p-2"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button type="submit" className="justify-self-start" disabled={!ready}>
          Submit for review
        </Button>
      </form>
      {transition.isError && (
        <p role="alert" className="text-destructive">
          {transition.error.message}
        </p>
      )}
      {transition.isSuccess && <p role="status">Release action recorded.</p>}
      {releases.isPending && <p role="status">Loading releases…</p>}
      {releases.isError && <p role="alert">{releases.error.message}</p>}
      {releases.data?.length === 0 && (
        <p className="text-muted-foreground">No releases for this factory.</p>
      )}
      {releases.data?.map((record) => (
        <article key={record.id} className="glass-panel max-w-4xl rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">
              {record.application_id} · Revision {record.workspace_revision}
            </h2>
            <span className="rounded border px-2 text-sm capitalize">{record.status}</span>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
            {record.content_hash}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {record.status === "submitted" && (
              <Button
                type="button"
                variant="outline"
                disabled={!ready}
                onClick={() =>
                  transition.mutate({ id: record.id, action: "approve", expected: "submitted" })
                }
              >
                Approve
              </Button>
            )}
            {record.status === "approved" && (
              <Button
                type="button"
                variant="outline"
                disabled={!ready}
                onClick={() =>
                  transition.mutate({ id: record.id, action: "publish", expected: "approved" })
                }
              >
                Publish package
              </Button>
            )}
            {record.status === "published" && (
              <Button asChild variant="outline">
                <a href={`/api/ems/artifact?site=${site}&id=${record.id}`}>
                  Download signed package
                </a>
              </Button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
