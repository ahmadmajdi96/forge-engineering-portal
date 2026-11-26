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
  setupLayoutSearch,
  setupPickSearch,
  setupSearch,
  setupStageIndex,
  setupStages,
  setupUnavailable,
  stripSetup,
  type SetupDocument,
} from "./setup-wizard-state";

/** The host supplies the existing authorized layout reader; this is not another data store. */
export function FactorySetupProvider({
  children,
  site,
  actions,
  readLayout,
}: {
  children: ReactNode;
  site: string | undefined;
  actions: readonly string[];
  readLayout: (site: string) => Promise<{ revision: number; payload: unknown }>;
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
  const scope = useMemo(
    () =>
      valid && item && document
        ? resolveSetupItem(item, document, engineering.workspaceModel)
        : undefined,
    [valid, item, document, engineering.workspaceModel],
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
        loading: loading || engineeringLoading,
        error: failure,
        layoutDirty,
        publish,
        retry: () => setAttempt((value) => value + 1),
        registerFocus,
        focusItem: () => focus.current?.(),
      }}
    >
      {children}
    </Wizard.Provider>
  );
}

function SetupLink({
  to,
  search,
  children,
  label,
  current,
  params,
}: {
  to: string;
  search: Record<string, unknown>;
  children: ReactNode;
  label?: string | undefined;
  current?: boolean | undefined;
  params?: Record<string, string>;
}) {
  // These destinations are from the authoritative EMS route table, not arbitrary URLs.
  return (
    <Link
      to={to as never}
      {...(params ? { params: params as never } : {})}
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
  const index = setupStageIndex(location.pathname);
  const stage = setupStages[index];
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
  const reason = scope && stage ? setupUnavailable(stage, scope, actions) : undefined;
  const blocked = !layout && (loading || error || !scope || mismatch || reason);
  const search = scope ? setupSearch(scope) : {};
  const canLeave = !(layout && layoutDirty);
  const synchronized =
    scope &&
    rawSearch["engLine"] === scope.line &&
    rawSearch["engStation"] === scope.station &&
    rawSearch["engAsset"] === scope.asset;
  const leave = (finish: boolean) => {
    if (!canLeave) return;
    const clean = error ? clearSetupScope(rawSearch) : stripSetup(rawSearch);
    void router.navigate({
      to: (finish ? "/factory-layout" : location.pathname) as never,
      search: (finish && scope ? stripSetup(setupLayoutSearch(scope)) : clean) as never,
    });
  };
  const adjacent = (direction: -1 | 1) => {
    if (!scope) return undefined;
    for (let at = index + direction; at >= 0 && at < setupStages.length; at += direction) {
      const candidate = setupStages[at];
      if (candidate && !error && !setupUnavailable(candidate, scope, actions)) return candidate;
    }
    return undefined;
  };
  const previous = adjacent(-1),
    next = adjacent(1);
  const targetSearch = (path: string) =>
    scope && path === "/factory-layout" ? setupLayoutSearch(scope) : search;
  return (
    <>
      <section className="sentinel-setup" aria-label="Sentinel factory setup">
        <header className="sentinel-setup-header">
          <div className="sentinel-setup-identity">
            <Box size={20} aria-hidden="true" />
            <div>
              <strong>Sentinel setup · {scope?.label ?? "Selected physical item"}</strong>
              <small>
                {site} · {scope?.type} {scope?.id} · Stage {index + 1} of 14: {stage?.name}
              </small>
            </div>
          </div>
          <div className="sentinel-setup-controls">
            {previous && canLeave && !loading && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  to={previous.path as never}
                  search={targetSearch(previous.path) as never}
                  aria-label={`Previous setup stage: ${previous.name}`}
                >
                  <ArrowLeft size={14} />
                  Previous
                </Link>
              </Button>
            )}
            {next && canLeave && !loading && (
              <Button size="sm" asChild>
                <Link
                  to={next.path as never}
                  search={targetSearch(next.path) as never}
                  aria-label={`Next setup stage: ${next.name}`}
                >
                  Next
                  <ArrowRight size={14} />
                </Link>
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
            {index === 13 && (
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
        <details className="sentinel-setup-stages">
          <summary>All 14 setup stages · {stage?.name}</summary>
          <ol aria-label="Ordered factory setup stages">
            {setupStages.map((entry, at) => {
              const unavailable =
                error ||
                (scope
                  ? setupUnavailable(entry, scope, actions)
                  : "Select and verify a saved physical item first");
              return (
                <li key={entry.path}>
                  {unavailable || !canLeave || loading ? (
                    <div className="sentinel-setup-stage" aria-disabled="true">
                      <span>{at + 1}</span>
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
                    <SetupLink
                      to={entry.path}
                      search={targetSearch(entry.path)}
                      current={at === index}
                    >
                      <span>{at + 1}</span>
                      <span>{entry.name}</span>
                    </SetupLink>
                  )}
                </li>
              );
            })}
          </ol>
          {scope?.line && actions.includes("ems.engineering.view") && canLeave && (
            <SetupLink to="/lines/$lineId" params={{ lineId: scope.line }} search={search}>
              Linked line details · {scope.line}
            </SetupLink>
          )}
          {scope?.station && actions.includes("ems.engineering.view") && canLeave && (
            <SetupLink
              to="/stations/$stationId"
              params={{ stationId: scope.station }}
              search={search}
            >
              Linked station details · {scope.station}
            </SetupLink>
          )}
        </details>
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
