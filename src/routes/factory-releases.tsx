import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ReleaseCard } from "@/components/engineering/release-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getFactoryReleases, submitFactoryRelease } from "@/lib/production/release.functions";
import { siteKey } from "@/lib/production/contracts";

export const Route = createFileRoute("/factory-releases")({
  validateSearch: z.object({
    site: siteKey.optional().catch(undefined),
    app: z.string().max(96).optional().catch(undefined),
    revision: z.coerce.number().int().positive().optional().catch(undefined),
  }),
  component: FactoryReleases,
});

function FactoryReleases() {
  const search = Route.useSearch();
  const { ems } = Route.useRouteContext();
  const site = search.site ?? ems.identity?.sites[0]?.key;
  if (!site) return <p role="status">Choose a factory to review its release packages.</p>;
  return (
    <ReleaseWorkspace
      key={JSON.stringify([site, search.app, search.revision])}
      site={site}
      initialApp={search.app ?? ""}
      initialRevision={search.revision?.toString() ?? ""}
    />
  );
}

function ReleaseWorkspace({
  site,
  initialApp,
  initialRevision,
}: {
  site: string;
  initialApp: string;
  initialRevision: string;
}) {
  const [app, setApp] = useState(initialApp);
  const [revision, setRevision] = useState(initialRevision);
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const queryKey = ["factory-releases", site];
  const releases = useQuery({
    queryKey,
    retry: false,
    queryFn: () => getFactoryReleases({ data: { site } }),
  });
  const submit = useMutation({
    mutationFn: () =>
      submitFactoryRelease({ data: { site, app: app.trim(), revision: Number(revision), reason } }),
    onSuccess: async () => {
      setReason("");
      await client.invalidateQueries({ queryKey });
    },
  });
  return (
    <section className="max-w-5xl space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold">Factory releases</h1>
        <p className="text-sm text-muted-foreground">
          Submit a saved Studio revision, review its contents and publish the signed package.
        </p>
      </header>
      <form
        className="glass-panel grid gap-4 rounded-lg p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit.mutate();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
          <h2 className="font-semibold">Submit a revision</h2>
          <Link
            className="text-sm text-primary underline underline-offset-4"
            to="/application-studio"
            search={{ site }}
          >
            Open Application Studio
          </Link>
        </div>
        <label className="grid gap-1 text-sm">
          Application ID
          <Input
            required
            value={app}
            maxLength={96}
            onChange={(event) => setApp(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Saved Studio revision
          <Input
            required
            type="number"
            min={1}
            step={1}
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          Submission reason
          <Textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button
          type="submit"
          className="justify-self-start"
          disabled={
            !app.trim() ||
            !Number.isInteger(Number(revision)) ||
            Number(revision) < 1 ||
            reason.trim().length < 3 ||
            submit.isPending
          }
        >
          {submit.isPending ? "Submitting…" : "Submit for review"}
        </Button>
        {submit.error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {submit.error.message}
          </p>
        )}
        {submit.isSuccess && (
          <p role="status" className="text-sm sm:col-span-2">
            Revision submitted for independent review.
          </p>
        )}
      </form>
      <section className="space-y-3" aria-labelledby="release-history">
        <h2 id="release-history" className="font-semibold">
          Release history
        </h2>
        {releases.isPending && <p role="status">Loading releases…</p>}
        {releases.error && (
          <div role="alert" className="space-x-2">
            {releases.error.message}{" "}
            <Button variant="outline" onClick={() => void releases.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {releases.data?.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Revisions submitted for this factory will appear here.
          </p>
        )}
        {releases.data?.map((record) => (
          <ReleaseCard key={record.id} site={site} record={record} />
        ))}
      </section>
    </section>
  );
}
