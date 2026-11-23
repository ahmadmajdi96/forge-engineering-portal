import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FactoryWorkspace } from "@/components/spatial/workspace";
import { siteKey } from "@/lib/production/contracts";

export const Route = createFileRoute("/factory-layout")({
  validateSearch: z.object({ site: siteKey.optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Factory layout · EMS" },
      { name: "description", content: "Author scoped factory layouts and equipment placements." },
    ],
  }),
  component: FactoryLayout,
});

function FactoryLayout() {
  const { ems } = Route.useRouteContext();
  const { site } = Route.useSearch();
  const sites = ems.identity?.sites ?? [];
  const currentSite = site || sites[0]?.key || "";
  const allowed = sites.some(({ key }) => key === currentSite);

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-3 sm:p-5">
      <h1 className="text-2xl font-semibold tracking-tight">Factory layout</h1>
      {allowed ? (
        <FactoryWorkspace site={currentSite} key={currentSite} />
      ) : (
        <p
          role="status"
          className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        >
          {ems.unavailable
            ? "Site permissions are currently unavailable."
            : !ems.identity
              ? "An authorized EMS session is required to open a factory workspace."
              : sites.length
                ? "Choose a site you have access to."
                : "Your account has no factory sites assigned."}
        </p>
      )}
    </div>
  );
}
