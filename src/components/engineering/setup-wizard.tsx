import "./setup-wizard.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Box, Check, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { FactorySetupContext as Wizard, useFactorySetup } from "./setup-wizard-context";
import {
  clearSetupScope,
  isSetupRoute,
  readSetup,
  resolveSetupItem,
  setupAuthorized,
  setupJourney,
  setupLayoutSearch,
  setupPickSearch,
  setupSearch,
  setupStageAtPath,
  setupStages,
  setupUnavailable,
  stripSetup,
  type SetupDocument,
  type SetupProcessDocument,
  type SetupScope,
  type SetupStage,
} from "./setup-wizard-state";

/** The host supplies the existing authorized layout reader; this is not another data store. */
export function FactorySetupProvider({
  children,
  site,
  actions,
  readLayout,
  readProcess,
  terminalAssignments,
}: {
  children: ReactNode;
  site: string | undefined;
  actions: readonly string[];
  readLayout: (site: string) => Promise<{ revision: number; payload: unknown }>;
  readProcess?: ((site: string) => Promise<{ revision: number; payload: unknown }>) | undefined;
  terminalAssignments?: ((scope: SetupScope) => ReactNode) | undefined;
}) {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const search = location.search as Record<string, unknown>;
  const item = useMemo(() => readSetup(search), [search]);
  const allowedRoute = isSetupRoute(location.pathname);
  const requested = search["setup"] === "guided";
  const active = requested && allowedRoute;
  const valid = Boolean(item && item.site === site && search["site"] === site);
  const engineering = useEngineering();
  const loadState = (engineering as typeof engineering & { loadState?: string }).loadState;
  const [document, setDocument] = useState<SetupDocument>();
  const [processes, setProcesses] = useState<SetupProcessDocument>();
  const [processLoading, setProcessLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reader = useRef(readLayout);
  const focus = useRef<(() => void) | undefined>(undefined);
  const registerFocus = useCallback((callback: () => void) => {
    focus.current = callback;
    return () => {
      if (focus.current === callback) focus.current = undefined;
    };
  }, []);
  reader.current = readLayout;
  const processReader = useRef(readProcess);
  processReader.current = readProcess;
  const readKey = valid && item ? `${item.site}/${item.type}/${item.id}` : "";
  useEffect(() => {
    if (!active || !valid || !site || !actions.includes("ems.factory_layout.view")) {
      setDocument(undefined);
      setLoading(false);
      setLayoutDirty(false);
      return;
    }
    let alive = true;
    setDocument(undefined);
    setError("");
    setLoading(true);
    void reader
      .current(site)
      .then((result) => {
        if (!alive) return;
        const payload = result.payload as SetupDocument | null;
        if (
          !payload ||
          payload.siteCode !== site ||
          !Array.isArray(payload.spaces) ||
          !Array.isArray(payload.occurrences)
        )
          throw new Error(
            "No saved layout contains this item. Return to layout and save it first.",
          );
        setDocument(payload);
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(cause instanceof Error ? cause.message : "The saved item could not be loaded.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, valid, readKey, site, attempt, actions]);
  useEffect(() => {
    setProcesses(undefined);
    setProcessLoading(false);
    if (
      !active ||
      !valid ||
      !site ||
      !actions.includes("ems.factory_process.view") ||
      !processReader.current
    )
      return;
    let alive = true;
    setProcessLoading(true);
    void processReader
      .current(site)
      .then((result) => {
        const payload = result.payload as SetupProcessDocument | null;
        if (
          alive &&
          payload &&
          Array.isArray(payload.routes) &&
          payload.routes.every((route) => Array.isArray(route.steps))
        )
          setProcesses({ siteCode: site, routes: payload.routes });
      })
      .catch(() => {
        /* Missing relationships remain explicitly unavailable. */
      })
      .finally(() => {
        if (alive) setProcessLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, valid, site, readKey, attempt, actions]);
  const scope = useMemo(
    () =>
      valid && item && document
        ? resolveSetupItem(item, document, engineering.workspaceModel, processes)
        : undefined,
    [valid, item, document, engineering.workspaceModel, processes],
  );
  const engineeringLoading = actions.includes("ems.engineering.view") && loadState === "loading";
  const failure =
    !valid && active
      ? "Setup belongs to a different factory or has an invalid item. Choose the item again in layout."
      : !actions.includes("ems.factory_layout.view") && active
        ? "Layout access is required to verify the selected physical item."
        : error ||
          (actions.includes("ems.engineering.view") && loadState === "error"
            ? "Engineering records could not be verified. Reload the engineering workspace before choosing linked stages."
            : "") ||
          (active && !loading && document && !scope
            ? "The selected item no longer exists in this factory. No other item has been selected."
            : "");
  useEffect(() => {
    if (search["setup"] && (!allowedRoute || (search["setup"] !== "pick" && !valid))) {
      void router.navigate({
        to: location.pathname,
        replace: true,
        resetScroll: false,
        search: clearSetupScope(search) as never,
      });
      return;
    }
    if (
      !scope ||
      loading ||
      engineeringLoading ||
      (location.pathname === "/factory-layout" && layoutDirty)
    )
      return;
    const differs =
      search["engLine"] !== scope.line ||
      search["engStation"] !== scope.station ||
      search["engAsset"] !== scope.asset;
    if (differs)
      void router.navigate({
        to: location.pathname,
        replace: true,
        resetScroll: false,
        search: {
          ...search,
          engLine: scope.line,
          engStation: scope.station,
          engAsset: scope.asset,
        } as never,
      });
  }, [
    requested,
    allowedRoute,
    valid,
    scope,
    search,
    loading,
    engineeringLoading,
    layoutDirty,
    location.pathname,
    location.searchStr,
    router,
  ]);
  const publish = useCallback(
    (next: SetupDocument, dirty: boolean) => {
      if (next.siteCode === site) {
        setDocument(next);
        setLayoutDirty(dirty);
      }
    },
    [site],
  );
  return (
    <Wizard.Provider
      value={{
        active,
        scope,
        site,
        actions,
        loading: loading || engineeringLoading || processLoading,
        error: failure,
        layoutDirty,
        publish,
        retry: () => setAttempt((value) => value + 1),
        registerFocus,
        focusItem: () => focus.current?.(),
        terminalAssignments,
      }}
    >
      {children}
    </Wizard.Provider>
  );
}

function SetupLink({
  stage,
  search,
  children,
  label,
  current,
}: {
  stage: SetupStage;
  search: Record<string, unknown>;
  children: ReactNode;
  label?: string | undefined;
  current?: boolean | undefined;
}) {
  return (
    <Link
      to={stage.path as never}
      {...(stage.params ? { params: stage.params as never } : {})}
      search={search as never}
      aria-label={label}
      aria-current={current ? "step" : undefined}
      className="sentinel-setup-stage"
    >
      {children}
    </Link>
  );
}

/** Mounted around the real Outlet, not around a disconnected preview. */
export function SetupWizardFrame({ children }: { children: ReactNode }) {
  const wizard = useFactorySetup();
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const rawSearch = location.search as Record<string, unknown>;
  if (!wizard || !isSetupRoute(location.pathname)) return <>{children}</>;
  const { scope, actions, active, loading, error, layoutDirty, site } = wizard;
  const journey = scope ? setupJourney(scope) : [];
  const catalogStage = setupStageAtPath(location.pathname);
  const index = journey.findIndex((entry) => entry.path === catalogStage?.path);
  const stage = index >= 0 ? journey[index] : undefined;
  const layout = location.pathname === "/factory-layout";
  if (!active)
    return (
      <>
        {!layout && actions.includes("ems.factory_layout.view") && (
          <section
            className="sentinel-setup sentinel-setup-empty"
            aria-label="Sentinel factory setup"
          >
            <Box size={18} aria-hidden="true" />
            <p>Sentinel · Set up a physical space or placed item.</p>
            <Button variant="outline" size="sm" asChild>
              <Link to={"/factory-layout" as never} search={setupPickSearch(site) as never}>
                Start setup in 3D
              </Link>
            </Button>
          </section>
        )}
        {children}
      </>
    );
  const mismatch =
    scope &&
    ((location.pathname.startsWith("/lines/") &&
      location.pathname.split("/")[2] !== encodeURIComponent(scope.line ?? "")) ||
      (location.pathname.startsWith("/stations/") &&
        location.pathname.split("/")[2] !== encodeURIComponent(scope.station ?? "")));
  const reason = scope && catalogStage ? setupUnavailable(catalogStage, scope, actions) : undefined;
  const blocked = !layout && (loading || error || !scope || mismatch || reason);
  const canLeave = !(layout && layoutDirty);
  const synchronized =
    scope &&
    rawSearch["engLine"] === scope.line &&
    rawSearch["engStation"] === scope.station &&
    rawSearch["engAsset"] === scope.asset;
  const leave = (finish: boolean) => {
    if (!canLeave) return;
    const stripped = stripSetup(rawSearch);
    const clean = error
      ? clearSetupScope(rawSearch)
      : location.pathname === "/application-studio"
        ? {
            ...stripped,
            app: undefined,
            terminal: undefined,
            source: undefined,
            entity: undefined,
            kind: undefined,
            view: undefined,
          }
        : stripped;
    void router.navigate({
      to: (finish ? "/factory-layout" : location.pathname) as never,
      search: (finish && scope ? stripSetup(setupLayoutSearch(scope)) : clean) as never,
    });
  };
  const adjacent = (direction: -1 | 1) => {
    if (!scope || index < 0) return undefined;
    for (let at = index + direction; at >= 0 && at < journey.length; at += direction) {
      const candidate = journey[at];
      if (candidate && !error && !setupUnavailable(candidate, scope, actions)) return candidate;
    }
    return undefined;
  };
  const previous = adjacent(-1),
    next = adjacent(1);
  const targetSearch = (entry: SetupStage) =>
    scope
      ? entry.path === "/factory-layout"
        ? setupLayoutSearch(scope)
        : setupSearch(scope, entry.path)
      : {};
  const spatialFinish = Boolean(
    scope &&
    scope.type === "space" &&
    ["organization", "site", "building", "floor", "area"].includes(scope.kind),
  );
  const canFinish =
    index === journey.length - 1 &&
    (stage?.path === "/release-readiness" || (layout && spatialFinish));
  return (
    <>
      <section className="sentinel-setup" aria-label="Sentinel factory setup">
        <header className="sentinel-setup-header">
          <div className="sentinel-setup-identity">
            <Box size={20} aria-hidden="true" />
            <div>
              <strong>Sentinel setup · {scope?.label ?? "Selected physical item"}</strong>
              <small>
                {site} · {scope?.kind ?? scope?.type} {scope?.id} ·{" "}
                {stage
                  ? `Stage ${index + 1} of ${journey.length}: ${stage.name}`
                  : `Optional page: ${catalogStage?.name ?? "Engineering"}`}
              </small>
            </div>
          </div>
          <div className="sentinel-setup-controls">
            {previous && canLeave && !loading && (
              <Button variant="outline" size="sm" asChild>
                <SetupLink
                  stage={previous}
                  search={targetSearch(previous)}
                  label={`Previous setup stage: ${previous.name}`}
                >
                  <ArrowLeft size={14} />
                  Previous
                </SetupLink>
              </Button>
            )}
            {next && canLeave && !loading && (
              <Button size="sm" asChild>
                <SetupLink
                  stage={next}
                  search={targetSearch(next)}
                  label={`Next setup stage: ${next.name}`}
                >
                  Next
                  <ArrowRight size={14} />
                </SetupLink>
              </Button>
            )}
            {scope && layout && (
              <Button variant="outline" size="sm" onClick={wizard.focusItem}>
                Return to item in 3D
              </Button>
            )}
            {scope && !layout && canLeave && (
              <Button variant="outline" size="sm" asChild>
                <Link to={"/factory-layout" as never} search={setupLayoutSearch(scope) as never}>
                  Return to item in 3D
                </Link>
              </Button>
            )}
            {canFinish && (
              <Button
                size="sm"
                disabled={!canLeave || !scope || loading}
                onClick={() => leave(true)}
              >
                <Check size={14} />
                Finish setup
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={!canLeave} onClick={() => leave(false)}>
              <X size={14} />
              Leave setup
            </Button>
          </div>
        </header>
        {loading && (
          <p className="sentinel-setup-note" role="status">
            Verifying the saved item and its engineering links…
          </p>
        )}
        {error && (
          <p className="sentinel-setup-note" role="alert">
            {error}{" "}
            <Button variant="outline" size="sm" onClick={wizard.retry}>
              Retry item verification
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={"/factory-layout" as never} search={setupPickSearch(site) as never}>
                Choose item in 3D
              </Link>
            </Button>
          </p>
        )}
        {spatialFinish && scope && (
          <details className="sentinel-setup-stages">
            <summary>Review physical dimensions &amp; hierarchy</summary>
            <nav aria-label="Selected item hierarchy">
              <ol>
                {scope.hierarchy?.map((node) => (
                  <li key={node.id}>
                    <span>
                      {node.label} · {node.kind}
                    </span>
                  </li>
                ))}
              </ol>
            </nav>
            <p className="sentinel-setup-note">
              {scope.size
                ? `Width ${scope.size.x} m · Depth ${scope.size.z} m · Height ${scope.size.y} m`
                : "Physical dimensions are not defined for this item. Review its boundaries in Properties."}
            </p>
            <p className="sentinel-setup-note">
              Review this exact item in the layout inspector, then Finish setup to leave guidance.
              Finishing does not save or activate equipment.
            </p>
          </details>
        )}
        {scope?.kind === "terminal" && !loading && !error && (
          <details className="sentinel-setup-stages">
            <summary>Terminal application assignments</summary>
            {scope.terminalId ? (
              (wizard.terminalAssignments?.(scope) ?? (
                <p className="sentinel-setup-note">
                  Native assignment details are unavailable in this workspace.
                </p>
              ))
            ) : (
              <p className="sentinel-setup-note">
                Link the enrolled terminal in Properties. No other terminal is selected.
              </p>
            )}
            {scope.app && canLeave && actions.includes("ems.application_studio.view") && (
              <p className="sentinel-setup-note">
                <Link
                  to={"/application-studio" as never}
                  search={setupSearch(scope, "/application-studio") as never}
                >
                  Current authoring definition · {scope.app}
                </Link>{" "}
                · separate from assigned releases listed above.
              </p>
            )}
            {!scope.app && (
              <p className="sentinel-setup-note">
                No current authoring definition is recorded on the placement. Choose an exact
                assigned release in the terminal panel; no application kind is assumed.
              </p>
            )}
            {canLeave && scope.terminalId && actions.includes("ems.factory_assignments.view") && (
              <SetupLink
                stage={{
                  path: "/factory-assignment",
                  name: "Manage terminal assignments",
                  need: "item",
                }}
                search={setupSearch(scope, "/factory-assignment")}
              >
                Manage terminal assignments
              </SetupLink>
            )}
          </details>
        )}
        {scope?.reason && (
          <p className="sentinel-setup-note" role="status">
            {scope.reason}
          </p>
        )}
        {!canLeave && (
          <p className="sentinel-setup-note" role="status">
            Save this layout revision before moving to another setup stage. No automatic save will
            occur.
          </p>
        )}
        {scope && journey.length > 0 && (
          <details className="sentinel-setup-stages">
            <summary>
              Item setup stages · {journey.length} relevant{" "}
              {journey.length === 1 ? "stage" : "stages"}
            </summary>
            <ol aria-label="Ordered relevant item setup stages">
              {journey.map((entry, at) => {
                const unavailable = error || setupUnavailable(entry, scope, actions);
                return (
                  <li key={entry.path}>
                    {unavailable || !canLeave || loading ? (
                      <div className="sentinel-setup-stage" aria-disabled="true">
                        <span className="sentinel-setup-stage-number">{at + 1}</span>
                        <span>
                          {entry.name}
                          <small>
                            <Lock size={12} aria-hidden="true" />{" "}
                            {unavailable ??
                              (!canLeave ? "Save layout before leaving" : "Verifying item")}
                          </small>
                        </span>
                      </div>
                    ) : (
                      <SetupLink stage={entry} search={targetSearch(entry)} current={at === index}>
                        <span className="sentinel-setup-stage-number">{at + 1}</span>
                        <span>{entry.name}</span>
                      </SetupLink>
                    )}
                  </li>
                );
              })}
            </ol>
            {scope.line && actions.includes("ems.engineering.view") && canLeave && (
              <SetupLink
                stage={{
                  need: "line",
                  action: "ems.engineering.view",
                  path: "/lines/$lineId",
                  params: { lineId: scope.line },
                  name: "Linked line details",
                }}
                search={setupSearch(scope)}
              >
                Linked line details · {scope.line}
              </SetupLink>
            )}
            {scope.station && actions.includes("ems.engineering.view") && canLeave && (
              <SetupLink
                stage={{
                  need: "station",
                  action: "ems.engineering.view",
                  path: "/stations/$stationId",
                  params: { stationId: scope.station },
                  name: "Linked station details",
                }}
                search={setupSearch(scope)}
              >
                Linked station details · {scope.station}
              </SetupLink>
            )}
          </details>
        )}
        {scope && (
          <details className="sentinel-setup-catalog">
            <summary>Other authorized engineering pages</summary>
            <ol aria-label="Other authorized engineering pages">
              {setupStages
                .filter(
                  (entry) =>
                    setupAuthorized(entry, actions) &&
                    !journey.some((relevant) => relevant.path === entry.path),
                )
                .map((entry) => {
                  const unavailable = error || setupUnavailable(entry, scope, actions);
                  return (
                    <li key={entry.path}>
                      {unavailable || !canLeave || loading ? (
                        <div className="sentinel-setup-stage" aria-disabled="true">
                          <span>
                            {entry.name}
                            <small>
                              {unavailable ??
                                (!canLeave ? "Save layout before leaving" : "Verifying item")}
                            </small>
                          </span>
                        </div>
                      ) : (
                        <SetupLink
                          stage={entry}
                          search={targetSearch(entry)}
                          current={catalogStage?.path === entry.path}
                        >
                          {entry.name}
                        </SetupLink>
                      )}
                    </li>
                  );
                })}
            </ol>
          </details>
        )}
      </section>
      {blocked || (!layout && !synchronized) ? (
        <section className="sentinel-setup sentinel-setup-empty" role="status">
          <p>
            {loading || (!layout && scope && !synchronized)
              ? "Loading the selected item's scope…"
              : mismatch
                ? "This detail page does not belong to the selected physical item. Use its linked details in the setup stages."
                : reason || error || "Select a saved item in layout to continue."}
          </p>
        </section>
      ) : (
        children
      )}
    </>
  );
}
