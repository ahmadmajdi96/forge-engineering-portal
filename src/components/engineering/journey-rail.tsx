import "./engineering-journey.css";
import { useGuidedSetup } from "./setup-wizard-context";
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  ChevronDown,
  Cable,
  ClipboardCheck,
  GitBranch,
  Lock,
  Network,
  Rotate3d,
} from "lucide-react";

/**
 * Engineering journey: line setup → process sections and steps → station & hardware →
 * signals → 3D layout → readiness. It only reports *where* the engineer is and which scoped
 * destinations their access allows. It never claims completion or progress.
 */
export type JourneyStage = "line" | "process" | "station" | "signals" | "layout" | "readiness";

export type JourneyScope = {
  site?: string | null | undefined;
  lineId?: string | undefined;
  lineName?: string | undefined;
  stationId?: string | undefined;
  stationName?: string | undefined;
};

export type JourneyAccess = {
  /** Native factory session (Hub/EMS identity). Sandbox drafts pass false. */
  native: boolean;
  /** Site action grants; matched against the same keys as the sidebar. */
  actions: readonly string[];
};

type Target = {
  to: string;
  search: Record<string, string | undefined>;
};

type StageDef = {
  id: JourneyStage;
  title: string;
  icon: typeof Network;
  detail: (scope: JourneyScope) => string;
  target: (scope: JourneyScope, access: JourneyAccess) => Target | { locked: string };
};

const scoped = ({ site, lineId, stationId }: JourneyScope) => ({
  ...(site ? { site } : {}),
  ...(lineId ? { engLine: lineId } : {}),
  ...(stationId ? { engStation: stationId } : {}),
});

const engineeringAllowed = ({ native, actions }: JourneyAccess) =>
  !native || actions.includes("ems.engineering.view");

export const journeyStages: readonly StageDef[] = [
  {
    id: "line",
    title: "Line setup",
    icon: Network,
    detail: (s) =>
      s.lineId ? `${s.lineId}${s.lineName ? " · " + s.lineName : ""}` : "Choose a line",
    target: (s, a) =>
      engineeringAllowed(a)
        ? { to: "/line-engineering", search: scoped({ ...s, stationId: undefined }) }
        : { locked: "Needs engineering access" },
  },
  {
    id: "process",
    title: "Sections & steps",
    icon: GitBranch,
    detail: () => "Process outline",
    target: (s, a) =>
      a.native
        ? a.actions.includes("ems.factory_process.view")
          ? {
              to: "/factory-process",
              search: { ...(s.site ? { site: s.site } : {}), engLine: s.lineId },
            }
          : { locked: "Needs process access" }
        : { to: "/asset-steps", search: scoped(s) },
  },
  {
    id: "station",
    title: "Station & hardware",
    icon: Boxes,
    detail: (s) => s.stationName ?? s.stationId ?? "Select a station",
    target: (s, a) =>
      engineeringAllowed(a)
        ? { to: "/workstations", search: scoped(s) }
        : { locked: "Needs engineering access" },
  },
  {
    id: "signals",
    title: "Signals",
    icon: Cable,
    detail: (s) => (s.stationId ? `${s.stationId} bindings` : "Bindings & commands"),
    target: (s, a) =>
      engineeringAllowed(a)
        ? { to: "/station-connectivity", search: scoped(s) }
        : { locked: "Needs engineering access" },
  },
  {
    id: "layout",
    title: "3D layout",
    icon: Rotate3d,
    detail: () => "Placement in the factory",
    target: (s, a) =>
      a.native && a.actions.includes("ems.factory_layout.view")
        ? {
            to: "/factory-layout",
            search: {
              ...(s.site ? { site: s.site } : {}),
              ...(s.lineId ? { line: s.lineId } : {}),
              ...(s.stationId ? { station: s.stationId } : {}),
            },
          }
        : { locked: a.native ? "Needs layout access" : "Factory session only" },
  },
  {
    id: "readiness",
    title: "Readiness",
    icon: ClipboardCheck,
    detail: () => "Findings & evidence",
    target: (s) => ({ to: "/release-readiness", search: scoped({ ...s, stationId: undefined }) }),
  },
];

/**
 * Router link for destinations that are defined across EMS builds. Paths and search keys come
 * from the journey table above, whose routes all accept the shared engineering scope keys.
 */
export function ScopedLink({
  to,
  search,
  ...rest
}: Omit<ComponentProps<typeof Link>, "to" | "search"> & {
  to: string;
  search?: Record<string, unknown>;
}) {
  return <Link {...rest} to={to as never} search={(search ?? {}) as never} />;
}

const JourneyPresence = createContext(false);
/** True when a page already shows the journey rail, so duplicate link rows can step aside. */
export const useJourneyPresent = () => { const present = useContext(JourneyPresence); const guided = useGuidedSetup(); return present || guided; };
export function JourneyProvider({ children }: { children: ReactNode }) {
  return <JourneyPresence.Provider value>{children}</JourneyPresence.Provider>;
}

export function EngineeringJourney({
  stage,
  scope,
  access,
  primary,
  more,
  density = "full",
}: {
  /** "compact" keeps the journey to one low row (used where a canvas must dominate). */
  density?: "full" | "compact";
  stage: JourneyStage;
  scope: JourneyScope;
  access: JourneyAccess;
  /** The page's own primary action (save, design, …), shown at the band's end. */
  primary?: ReactNode;
  /** Secondary pages, rendered in a disclosure so they never compete with the journey. */
  more?: ReactNode;
}) {
  const guided = useGuidedSetup();
  if (guided) return primary ? <div className="ems-journey-primary">{primary}</div> : null;
  const index = journeyStages.findIndex((item) => item.id === stage);
  const resolved = journeyStages.map((item) => ({ item, target: item.target(scope, access) }));
  const reachable = (from: number, step: 1 | -1) => {
    for (let at = from + step; at >= 0 && at < resolved.length; at += step) {
      const entry = resolved[at];
      if (entry && "to" in entry.target) return entry as { item: StageDef; target: Target };
    }
    return undefined;
  };
  const previous = reachable(index, -1);
  const next = reachable(index, 1);
  const currentStage = resolved[index]?.item;
  const compactMenu = (
    <details className="ems-journey-compact">
      <summary>
        <span className="ems-journey-index" aria-hidden="true">
          {index + 1}
        </span>
        <span className="ems-journey-compact-label">
          <small>
            Stage {index + 1} of {resolved.length}
          </small>
          <strong>{currentStage?.title ?? "Engineering journey"}</strong>
        </span>
        <ChevronDown size={14} aria-hidden="true" className="ems-journey-chevron" />
      </summary>
      <ol aria-label="All engineering stages">
        {resolved.map(({ item, target }, at) => (
          <li key={item.id}>
            {"locked" in target ? (
              <span className="ems-journey-menu-item is-locked" aria-disabled="true">
                <span aria-hidden="true">{at + 1}.</span> {item.title}
                <small>{target.locked}</small>
              </span>
            ) : (
              <ScopedLink
                className="ems-journey-menu-item"
                to={target.to}
                search={target.search}
                aria-current={at === index ? "step" : undefined}
              >
                <span aria-hidden="true">{at + 1}.</span> {item.title}
                <small>{item.detail(scope)}</small>
              </ScopedLink>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
  return (
    <section className="ems-journey" data-density={density} aria-label="Engineering journey">
      {compactMenu}
      <nav aria-label="Engineering journey stages" className="ems-journey-track">
        <ol>
          {resolved.map(({ item, target }, at) => {
            const Icon = item.icon;
            const current = at === index;
            const body = (
              <>
                <span className="ems-journey-index" aria-hidden="true">
                  {at + 1}
                </span>
                <Icon size={16} aria-hidden="true" className="ems-journey-icon" />
                <span className="ems-journey-text">
                  <strong>{item.title}</strong>
                  <small>{"locked" in target ? target.locked : item.detail(scope)}</small>
                </span>
              </>
            );
            return (
              <li
                key={item.id}
                data-current={current || undefined}
                data-near={Math.abs(at - index) === 1 || undefined}
              >
                {"locked" in target ? (
                  <span className="ems-journey-step is-locked" aria-disabled="true">
                    {body}
                    <Lock size={12} aria-label="Unavailable" className="ems-journey-lock" />
                  </span>
                ) : (
                  <ScopedLink
                    className="ems-journey-step"
                    to={target.to}
                    search={target.search}
                    aria-current={current ? "step" : undefined}
                  >
                    {body}
                  </ScopedLink>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="ems-journey-actions">
        {previous ? (
          <ScopedLink
            className="ems-journey-adjacent"
            to={previous.target.to}
            search={previous.target.search}
            aria-label={`Previous stage: ${previous.item.title}`}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span className="ems-journey-adjacent-label">{previous.item.title}</span>
          </ScopedLink>
        ) : null}
        {next ? (
          <ScopedLink
            className="ems-journey-adjacent is-next"
            to={next.target.to}
            search={next.target.search}
            aria-label={`Next stage: ${next.item.title}`}
          >
            <span className="ems-journey-adjacent-label">{next.item.title}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </ScopedLink>
        ) : null}
        {primary ? <div className="ems-journey-primary">{primary}</div> : null}
      </div>
      {more ? <div className="ems-journey-more">{more}</div> : null}
    </section>
  );
}
