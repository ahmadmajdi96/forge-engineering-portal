import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApplicationStudioPage } from "@/components/studio/studio-page";
import { studioPanes, type StudioPane } from "@/lib/studio/legacy-route";
import { siteKey } from "@/lib/production/contracts";

const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/);

export const Route = createFileRoute("/application-studio")({
  validateSearch: z.object({
    site: siteKey.optional().catch(undefined),
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
  );
}
