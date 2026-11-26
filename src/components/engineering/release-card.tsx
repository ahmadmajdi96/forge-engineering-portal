import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { updateFactoryRelease, type getFactoryReleases } from "@/lib/production/release.functions";

export function ReleaseCard({
  site,
  record,
}: {
  site: string;
  record: Awaited<ReturnType<typeof getFactoryReleases>>[number];
}) {
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const publish = record.status === "approved";
  const action = useMutation({
    mutationFn: () =>
      updateFactoryRelease({
        data: {
          site,
          id: record.id,
          reason,
          ...(publish
            ? { action: "publish" as const, expected: "approved" as const }
            : { action: "approve" as const, expected: "submitted" as const }),
        },
      }),
    onSuccess: async () => {
      setReason("");
      await client.invalidateQueries({ queryKey: ["factory-releases", site] });
    },
  });
  return (
    <article
      className="glass-panel min-w-0 space-y-3 rounded-lg p-4"
      aria-label={record.application_id + " revision " + record.workspace_revision}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words font-semibold">
          {record.application_id} · Revision {record.workspace_revision}
        </h3>
        <Badge variant="secondary" className="capitalize">
          {record.status}
        </Badge>
      </div>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer py-1 text-muted-foreground">
          Package fingerprint
        </summary>
        <code className="block break-all py-2 text-xs">{record.content_hash}</code>
      </details>
      {record.status === "published" ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/factory-assignment" search={{ site, release: record.id }}>
              Assign this package
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/ems/artifact?site=${site}&id=${record.id}`}>Download signed package</a>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/integrations" search={{ site }}>
              View delivery status
            </Link>
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate();
          }}
        >
          <label className="grid gap-1 text-sm">
            {publish ? "Publication reason" : "Approval reason"}
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
            variant="outline"
            disabled={reason.trim().length < 3 || action.isPending}
          >
            {action.isPending ? "Recording…" : publish ? "Publish package" : "Approve"}
          </Button>
        </form>
      )}
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error.message}
        </p>
      )}
      {action.isSuccess && (
        <p role="status" className="text-sm">
          {record.status === "published" ? "Package published." : "Decision recorded."}
        </p>
      )}
    </article>
  );
}
