import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** The host injects its authorized release reader and existing Studio player. */
export function ReleasedStudioView<T>({
  site,
  application,
  revision,
  load,
  preview,
  editDraft,
}: {
  site: string;
  application: string;
  revision: number;
  load: (input: { data: { site: string; application: string; revision: number } }) => Promise<{
    revision: number;
    application: T;
  }>;
  preview: (definition: T) => ReactNode;
  editDraft?: ReactNode;
}) {
  const query = useQuery({
    queryKey: ["released-studio-application", site, application, revision],
    queryFn: async () => {
      const result = await load({ data: { site, application, revision } });
      if (result.revision !== revision || !result.application)
        throw new Error("The requested immutable version was not returned.");
      return result;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  return (
    <section className="space-y-4 min-w-0" aria-label="Assigned Studio revision">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="min-w-0 break-words">
          <p className="text-sm text-muted-foreground">Sentinel · Assigned release</p>
          <h1 className="text-xl font-semibold">
            {application} · r{revision}
          </h1>
          <p className="text-sm text-muted-foreground">{site} · Immutable version · Read-only</p>
        </div>
        {editDraft}
      </header>
      {query.isPending ? (
        <p role="status">Loading exact assigned revision…</p>
      ) : query.isError ? (
        <div role="alert" className="space-y-3 rounded-md border border-destructive p-4">
          <p>
            This assigned version could not be loaded. It may be missing or access may be denied. No
            current draft has been opened.
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry assigned revision
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Interactive simulation of this exact version. Preview inputs do not modify the
            definition or operate equipment.
          </p>
          {preview(query.data.application)}
        </>
      )}
    </section>
  );
}
