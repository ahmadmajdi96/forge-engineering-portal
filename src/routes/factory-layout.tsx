import "@/components/spatial/viewer-layout.css";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FactoryWorkspace } from "@/components/spatial/workspace";
import { editPermission, siteKey, viewPermission } from "@/lib/production/contracts";

const targetId = z.string().trim().min(1).max(180).optional().catch(undefined);

export const Route = createFileRoute("/factory-layout")({
  validateSearch: z.object({
    site: siteKey.optional().catch(undefined),
    traceRoute: targetId,
    traceStep: targetId,
    space: targetId,
    occurrence: targetId,
    line: targetId,
    station: targetId,
    asset: targetId,
    assetKind: z.enum(["equipment", "terminal"]).optional().catch(undefined),
  }),
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
  const { site, space, occurrence, line, station, asset, assetKind, traceRoute, traceStep } =
    Route.useSearch();
  const target = { traceRoute, traceStep, space, occurrence, line, station, asset, assetKind };
  const sites = ems.identity?.sites ?? [];
  const currentSite = site || sites[0]?.key || "";
  const selectedSite = sites.find(({ key }) => key === currentSite);
  const allowed = selectedSite?.actions?.includes(viewPermission.spatial);

  return (
    <div className="ems-layout-page w-full min-w-0 space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Factory layout</h1>
        {allowed && (
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedSite?.name} · Layout workspace
          </p>
        )}
      </header>
      {allowed ? (
        <FactoryWorkspace
          site={currentSite}
          key={JSON.stringify([currentSite, target])}
          target={target}
          canEdit={Boolean(selectedSite?.actions?.includes(editPermission.spatial))}
        />
      ) : (
        <p
          role="status"
          className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        >
          {ems.unavailable
            ? "Site permissions are currently unavailable."
            : !ems.identity
              ? "An authorized EMS session is required to open a factory workspace."
              : selectedSite
                ? "Layout access is required for this factory."
                : sites.length
                  ? "Choose a site you have access to."
                  : "Your account has no factory sites assigned."}
        </p>
      )}
    </div>
  );
}
