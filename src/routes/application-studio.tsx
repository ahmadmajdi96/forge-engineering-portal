import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApplicationStudioPage } from "@/components/studio/studio-page";
import { useServerFn } from "@tanstack/react-start";
import { loadReleasedStudioApplication } from "@/lib/production/workspace.functions";
import { ApplicationPlayer } from "@/components/studio/application-player";
import { ReleasedStudioView } from "@/components/engineering/released-studio-view";
import { StudioToolsMenu } from "@/components/engineering/studio-tools-menu";
import { AssignedApplications } from "@/components/engineering/assigned-applications";
import { useEngineering } from "@/lib/engineering/context";
import { allowedWorkspace } from "@/lib/engineering/navigation";
import { Button } from "@/components/ui/button";
import { workspaceScopedSearch } from "@/lib/engineering/navigation";
import { studioPanes, type StudioPane } from "@/lib/studio/legacy-route";
import { siteKey } from "@/lib/production/contracts";

const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/);

export const Route = createFileRoute("/application-studio")({
  validateSearch: z.object({
    site: z.string().optional().catch(undefined),
    source: z.enum(["stationId", "machineId", "stepId", "terminalId"]).optional().catch(undefined),
    profile: z.literal("station").optional().catch(undefined),
    entity: z.string().min(1).max(180).optional().catch(undefined),
    app: z.string().optional().catch(undefined),
    kind: z.enum(["operator", "hmi", "procedure"]).optional().catch(undefined),
    terminal: ref.optional().catch(undefined),
    revision: z.unknown().optional(),
    view: z.enum(studioPanes).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Application Studio · EMS" },
      { property: "og:title", content: "Application Studio · EMS" },
      {
        property: "og:description",
        content: "Factory-scoped authoring and preview for operator apps, HMIs and procedures.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const { native, actions, site: engineeringSite } = useEngineering();
  const loadReleased = useServerFn(loadReleasedStudioApplication);
  const sites = ems.identity?.sites ?? [];
  const site = search.site
    ? (sites.find((item) => item.key === search.site) ?? null)
    : (sites[0] ?? null);
  const setApp = (app: string) => {
    void navigate({
      search: { ...search, app, kind: undefined, revision: undefined },
      replace: true,
    });
  };
  const setPane = (view: StudioPane) => {
    void navigate({ search: { ...search, view }, replace: true });
  };
  const explicitRevision = search.revision !== undefined;
  const revision =
    typeof search.revision === "number"
      ? search.revision
      : typeof search.revision === "string" && /^\d+$/.test(search.revision)
        ? Number(search.revision)
        : NaN;
  const validApp = search.app !== undefined && ref.safeParse(search.app).success;
  const terminal = search.source === "terminalId" ? search.entity : search.terminal;
  const terminalEntry = search.source === "terminalId" || search.terminal !== undefined;
  const terminalConflict =
    search.source === "terminalId" && search.terminal && search.entity !== search.terminal;
  const scopeVerified = native ? !!site && engineeringSite === site.key : !search.site || !!site;
  const studioReadable = !native || actions.includes("ems.application_studio.view");
  const studioEditable = !native || actions.includes("ems.application_studio.edit");
  const failure = !scopeVerified
    ? "Choose an authorized factory before opening Studio."
    : !studioReadable
      ? "Application Studio access is required."
      : search.app !== undefined && !validApp
        ? "The application identity is invalid. Select an application or return to its assignments."
        : explicitRevision &&
            (!validApp || !Number.isSafeInteger(revision) || revision <= 0 || !native)
          ? "An assigned revision requires a specific application and a positive whole version in a native factory. No current definition has been opened."
          : terminalEntry && (!terminal || !ref.safeParse(terminal).success || terminalConflict)
            ? "Choose one exact terminal to review its assignments. No other terminal or application has been selected."
            : undefined;
  const currentDraftSearch = workspaceScopedSearch(
    search,
    { site: site?.key, revision: undefined, kind: undefined },
    "/application-studio",
  );
  const tools = scopeVerified
    ? [
        ["/edge-app-studio", "Workflow", /workflow|flow/],
        ["/operator-apps", "Operator app workflows", /workflow|flow/],
        ["/procedure-designer", "Procedure designer", /workflow|flow/],
        ["/screen-editor", "Screen Editor", /screen/],
        ["/hmi-layouts", "HMI Designer", /screen/],
        ["/factory-releases", "Factory releases", null],
        ["/factory-assignment", "Factory assignments", null],
      ].flatMap(([pathValue, labelValue, panePattern]) => {
        const path = String(pathValue);
        const editor = panePattern instanceof RegExp;
        if (native && !allowedWorkspace(path, actions)) return [];
        const destination = native && editor ? "/application-studio" : path;
        const pane =
          panePattern instanceof RegExp
            ? studioPanes.find((value) => panePattern.test(value))
            : undefined;
        // Legacy editors use different records. Never transfer native app identity into them.
        const context = workspaceScopedSearch(
          search,
          {
            site: site?.key,
            ...(editor
              ? {
                  revision: undefined,
                  kind: undefined,
                  view: pane,
                  ...(!native
                    ? { app: undefined, terminal: undefined, source: undefined, entity: undefined }
                    : {}),
                }
              : {}),
          },
          destination,
        );
        return [
          {
            id: path,
            link: (
              <Link to={destination as never} search={context as never}>
                {String(labelValue)}
                {native && editor ? " · native current definition" : ""}
              </Link>
            ),
          },
        ];
      })
    : [];
  return (
    <>
      <StudioToolsMenu tools={tools} native={native} />
      {search.source === "stationId" && search.entity && search.profile === "station" ? (
        <Link
          className="ref-issue-link mb-3"
          to="/stations/$stationId"
          params={{ stationId: search.entity }}
          search={
            workspaceScopedSearch(
              search,
              { site: site?.key, engLine: search.engLine, engStation: search.entity },
              "/stations",
            ) as never
          }
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
            search={
              workspaceScopedSearch(
                search,
                {
                  site: site?.key,
                  engLine: search.engLine,
                  engStation: search.source === "stationId" ? search.entity : search.engStation,
                  ...(search.source === "stepId"
                    ? { step: search.entity }
                    : search.source === "stationId"
                      ? {}
                      : { engAsset: search.engAsset ?? search.entity }),
                },
                (
                  {
                    stationId: "/workstations",
                    machineId: "/machines",
                    terminalId: "/terminals",
                    stepId: "/asset-steps",
                  } as const
                )[search.source],
              ) as never
            }
          >
            Back to {search.entity}
          </Link>
        )
      )}
      {failure ? (
        <p role="alert" className="ref-notice">
          {failure}
        </p>
      ) : explicitRevision && site && search.app ? (
        <ReleasedStudioView
          key={JSON.stringify([site.key, search.app, revision])}
          site={site.key}
          application={search.app}
          revision={revision}
          load={loadReleased}
          preview={(definition) => (
            <ApplicationPlayer
              key={JSON.stringify([site.key, search.app, revision])}
              app={definition}
              mode="simulation"
            />
          )}
          editDraft={
            studioEditable ? (
              <Button variant="outline" asChild>
                <Link to="/application-studio" search={currentDraftSearch as never}>
                  Edit current draft
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : terminalEntry && !search.app && terminal ? (
        <section className="space-y-3" aria-label="Terminal Studio assignments">
          <h1 className="text-xl font-semibold">Terminal applications · {terminal}</h1>
          <p className="text-sm text-muted-foreground">
            Choose an exact assigned version. No authoring application has been selected.
          </p>
          <AssignedApplications terminalId={terminal} showStudioEntry={false} />
        </section>
      ) : (
        <ApplicationStudioPage
          mode={ems.mode}
          site={site}
          requestedSite={search.site}
          requestedApp={search.app}
          requestedKind={search.kind}
          terminal={terminal}
          initialPane={search.view ?? (search.terminal ? "preview" : undefined)}
          selectApp={setApp}
          selectPane={setPane}
        />
      )}
    </>
  );
}
