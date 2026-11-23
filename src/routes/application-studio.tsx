import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApplicationStudioPage } from "@/components/studio/studio-page";
import { studioPanes, type StudioPane } from "@/lib/studio/legacy-route";
import { siteKey } from "@/lib/production/contracts";

const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/);

export const Route = createFileRoute("/application-studio")({
  validateSearch: z.object({
    site: siteKey.optional().catch(undefined),
    source: z.enum(["stationId", "machineId", "stepId", "terminalId"]).optional().catch(undefined),
    profile: z.literal("station").optional().catch(undefined),
    entity: z.string().min(1).max(180).optional().catch(undefined),
    app: ref.optional().catch(undefined),
    kind: z.enum(["operator", "hmi", "procedure"]).optional().catch(undefined),
    terminal: ref.optional().catch(undefined),
    view: z.enum(studioPanes).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Application Studio · EMS" },
      {
        name: "description",
        content: "Factory-scoped authoring and preview for operator apps, HMIs and procedures.",
      },
    ],
  }),
  component: StudioRoute,
});

function StudioRoute() {
  const { ems } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const sites = ems.identity?.sites ?? [];
  const site = search.site
    ? (sites.find((item) => item.key === search.site) ?? null)
    : (sites[0] ?? null);
  const setApp = (app: string) => {
    void navigate({ search: { ...search, app }, replace: true });
  };
  const setPane = (view: StudioPane) => {
    void navigate({ search: { ...search, view }, replace: true });
  };
  return (
    <>
      {search.source === "stationId" && search.entity && search.profile === "station" ? (
        <Link
          className="ref-issue-link mb-3"
          to="/stations/$stationId"
          params={{ stationId: search.entity }}
          search={{ site: site?.key, engLine: search.engLine, engStation: search.entity }}
        >
          Back to {search.entity}
        </Link>
      ) : (
        search.source &&
        search.entity && (
          <Link
            className="ref-issue-link mb-3"
            to={
              (
                {
                  stationId: "/workstations",
                  machineId: "/machines",
                  terminalId: "/terminals",
                  stepId: "/asset-steps",
                } as const
              )[search.source]
            }
            search={{
              site: site?.key,
              engLine: search.engLine,
              engStation: search.source === "stationId" ? search.entity : search.engStation,
              ...(search.source === "stepId"
                ? { step: search.entity }
                : search.source === "stationId"
                  ? {}
                  : { engAsset: search.entity }),
            }}
          >
            Back to {search.entity}
          </Link>
        )
      )}
      <ApplicationStudioPage
        mode={ems.mode}
        site={site}
        requestedSite={search.site}
        requestedApp={search.app}
        requestedKind={search.kind}
        terminal={search.terminal}
        initialPane={search.view ?? (search.terminal ? "preview" : undefined)}
        selectApp={setApp}
        selectPane={setPane}
      />
    </>
  );
}
