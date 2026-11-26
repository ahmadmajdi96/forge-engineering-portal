import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useEngineering } from "@/lib/engineering/context";
import { getEngineeringAssignments } from "@/lib/production/engineering-relations.functions";
import { Button } from "@/components/ui/button";
import { workspaceScopedSearch } from "@/lib/engineering/navigation";
import { useFactorySetup } from "./setup-wizard-context";

type Props = {
  showStudioEntry?: boolean | undefined;
  stationId?: string | undefined;
  machineId?: string | undefined;
  terminalId?: string | undefined;
  stepId?: string | undefined;
};
export function AssignedApplications(props: Props) {
  const field = props.terminalId
    ? "terminalId"
    : props.machineId
      ? "machineId"
      : props.stepId
        ? "stepId"
        : "stationId";
  const id = props[field];
  if (!id) return null;
  return (
    <AssignmentList
      key={field + ":" + id}
      field={field}
      id={id}
      showStudioEntry={props.showStudioEntry ?? true}
    />
  );
}
function AssignmentList({
  field,
  id,
  showStudioEntry,
}: {
  field: "stationId" | "machineId" | "terminalId" | "stepId";
  id: string;
  showStudioEntry: boolean;
}) {
  const { native, site, actions, workspaceModel, lineId, selected } = useEngineering();
  const get = useServerFn(getEngineeringAssignments);
  const [cursors, setCursors] = useState<string[]>([]);
  const after = cursors.at(-1);
  const readable = !!site && actions.includes("ems.factory_assignments.view");
  const studio = !!site && actions.includes("ems.application_studio.view");
  const setup = useFactorySetup();
  const contextAsset =
    field === "machineId" || field === "terminalId"
      ? field === "terminalId" && setup?.active && setup.scope?.terminalId === id
        ? setup.scope.asset
        : workspaceModel.records.find(
            (record) =>
              !record.archived &&
              record.id === id &&
              record.kind === (field === "terminalId" ? "terminal" : "equipment"),
          )?.id
      : undefined;
  const currentSearch = useRouterState({ select: (state) => state.location.search }) as Record<
    string,
    unknown
  >;
  const query = useQuery({
    queryKey: ["engineering-assignments", site, field, id, after],
    enabled: native && readable,
    queryFn: () => get({ data: { site: site ?? "", field, id, ...(after ? { after } : {}) } }),
    retry: false,
  });
  const stationProfile = useRouterState({
    select: (s) => s.location.pathname.startsWith("/stations/"),
  });
  const studioScope = workspaceScopedSearch(
    currentSearch,
    {
      ...(stationProfile ? { profile: "station" as const } : {}),
      site,
      engLine: lineId,
      engStation: selected,
      entity: id,
      source: field,
      app: undefined,
      kind: undefined,
      revision: undefined,
      view: undefined,
      engAsset: contextAsset,
      terminal: field === "terminalId" ? id : undefined,
    },
    "/application-studio",
  );
  const intended =
    field === "stationId" ? workspaceModel.stations.find((s) => s.id === id)?.app : undefined;
  return (
    <section className="ref-surface" aria-label="Assigned Applications/HMI">
      <header className="ref-surface-head">
        <div>
          <h2>Assigned Applications/HMI</h2>
          <p>{id} · release assignments</p>
        </div>
        {studio && showStudioEntry && (
          <Link className="ref-issue-link" to="/application-studio" search={studioScope}>
            Open in Application Studio
          </Link>
        )}
      </header>
      <div className="ref-surface-body space-y-2 text-sm">
        {native && readable && (
          <p>
            <Link
              className="ref-issue-link"
              to="/factory-assignment"
              search={
                workspaceScopedSearch(
                  currentSearch,
                  { site, ...(field === "terminalId" ? { terminal: id } : {}) },
                  "/factory-assignment",
                ) as never
              }
            >
              Manage application assignments
            </Link>
          </p>
        )}
        {intended && (
          <p>
            Engineering application reference <strong>{intended}</strong>
          </p>
        )}
        {!native ? (
          <p>Deployment assignments are unavailable in the sandbox.</p>
        ) : !readable ? (
          <p>Factory assignment access is required to view release details.</p>
        ) : query.isPending ? (
          <p role="status">Loading assignments…</p>
        ) : query.isError ? (
          <p role="alert">
            Assignments could not be loaded.{" "}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </p>
        ) : (
          <>
            {query.data.records.length === 0 ? (
              <p>No matching published release assignment.</p>
            ) : (
              <ul className="space-y-3">
                {query.data.records.map((a) => (
                  <li key={a.id} className="space-y-1 break-words">
                    <strong>
                      {a.application_id} · {a.kind.toUpperCase()} · Studio r{a.revision}
                    </strong>
                    <p>
                      {a.schedule} · configuration {a.config} · {a.node}
                    </p>
                    <p className="text-muted-foreground">
                      Release {a.release} · assignment {a.id}
                    </p>
                    {studio && (
                      <Link
                        className="ref-issue-link"
                        to="/application-studio"
                        search={
                          {
                            ...studioScope,
                            app: a.application_id,
                            kind: a.kind,
                            revision: String(a.revision),
                          } as never
                        }
                      >
                        Open assigned revision
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!!query.data.records.length && (
              <p className="text-muted-foreground">
                Assignment intervals describe intended deployment. Device activation requires
                separate readback evidence.
              </p>
            )}
            {(after || query.data.next) && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!after}
                  onClick={() => setCursors((c) => c.slice(0, -1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  disabled={!query.data.next}
                  onClick={() => {
                    const next = query.data.next;
                    if (next) setCursors((c) => [...c, next]);
                  }}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
