import "./engineering-journey.css";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  FileSignature,
  GitBranch,
  Hand,
  History,
  Network,
  Server,
  Settings2,
  Workflow,
} from "lucide-react";
import { useEngineering } from "@/lib/engineering/context";
import { ScopedLink } from "./journey-rail";

type Finding = { id: string; object: string; message: string; category: string };
type Destination = { to: string; search: Record<string, string | undefined> };
type NextTask = { title: string; reason: string; action: string } & Destination;

const modeLabel = (mode: string) =>
  mode === "automatic" ? "Automatic" : mode === "semi_auto" ? "Semi-automatic" : "Manual";
const ModeIcon = ({ mode }: { mode: string }) =>
  mode === "automatic" ? (
    <Cpu size={18} aria-hidden="true" />
  ) : mode === "semi_auto" ? (
    <Settings2 size={18} aria-hidden="true" />
  ) : (
    <Hand size={18} aria-hidden="true" />
  );

/**
 * Working landing page for factory engineering. Everything shown is derived from the loaded
 * engineering draft (lines, stations, records, validation findings); nothing is estimated.
 */
export function EngineeringOverviewWorkspace({
  site,
  scopeSelectors,
  brief,
  layout,
}: {
  site?: string | null | undefined;
  /** Plant / line selectors for the header. */
  scopeSelectors: ReactNode;
  /** Sentinel engineering brief. */
  brief: ReactNode;
  /** Saved factory layout summary, when the session has layout access. */
  layout?: ReactNode;
}) {
  const { model, workspaceModel, issues, lineId } = useEngineering();
  const siteScope = site ? { site } : {};
  const lines = workspaceModel.lines.filter((line) => !line.archived);
  const stations = model.stations;
  const findings: Finding[] = issues.filter((issue) => issue.category !== "Workflow");
  const hardware = workspaceModel.records.filter(
    (r) => !r.archived && ["equipment", "terminal", "node"].includes(r.kind),
  );

  const destinationFor = (issue: Finding): Destination => {
    const signal =
      issue.category === "Signals"
        ? (workspaceModel.signals as ReadonlyArray<{ key: string; stationId?: string }>).find(
            (s) => s.key === issue.object,
          )
        : undefined;
    const record = workspaceModel.records.find((r) => r.id === issue.object && !r.archived);
    const station = workspaceModel.stations.find(
      (s) => s.id === (signal?.stationId ?? record?.parent ?? issue.object),
    );
    const to = signal
      ? "/station-connectivity"
      : record?.kind === "operation"
        ? "/asset-steps"
        : station
          ? "/workstations"
          : issue.category === "Process"
            ? "/process-routes"
            : "/registry";
    return {
      to,
      search: {
        ...siteScope,
        engLine: station?.lineId ?? lineId,
        engStation: station?.id,
        ...(signal ? { signal: signal.key } : {}),
        ...(record?.kind === "operation" ? { step: record.id } : {}),
        ...(record ? { engAsset: record.kind + ":" + record.id } : {}),
      },
    };
  };

  const findingsFor = (stationId: string) =>
    findings.filter(
      (issue) =>
        issue.object === stationId ||
        workspaceModel.records.some(
          (r) => r.id === issue.object && !r.archived && r.parent === stationId,
        ),
    ).length;

  const stationWithoutHardware = stations.find((s) => !s.equipment.length);
  const firstFinding = findings[0];
  const next: NextTask = !lines.length
    ? {
        title: "Create the first production line",
        reason: "This factory has no active production lines yet.",
        action: "Create a line",
        to: "/lines",
        search: siteScope,
      }
    : !stations.length
      ? {
          title: `Add stations to ${model.name}`,
          reason: `${lineId} has no stations, so steps and hardware cannot be assigned.`,
          action: "Open line design",
          to: "/line-engineering",
          search: { ...siteScope, engLine: lineId },
        }
      : firstFinding
        ? {
            title: `Resolve ${firstFinding.object}`,
            reason: `${firstFinding.message}. ${findings.length > 1 ? `${findings.length - 1} more finding${findings.length === 2 ? "" : "s"} after this one.` : "This is the only open finding."}`,
            action: "Inspect finding",
            ...destinationFor(firstFinding),
          }
        : stationWithoutHardware
          ? {
              title: `Assign hardware to ${stationWithoutHardware.id}`,
              reason: `${stationWithoutHardware.name} has no equipment or terminal records.`,
              action: "Configure station",
              to: "/workstations",
              search: { ...siteScope, engLine: lineId, engStation: stationWithoutHardware.id },
            }
          : {
              title: "Review release readiness",
              reason:
                "No open design findings on this line. Readiness still needs evidence and approvals.",
              action: "Open readiness",
              to: "/release-readiness",
              search: { ...siteScope, engLine: lineId },
            };

  const visibleFindings = findings.slice(0, 4);
  const moreFindings = findings.slice(4);
  const findingRow = (issue: Finding) => {
    const target = destinationFor(issue);
    return (
      <li key={issue.id}>
        <ScopedLink to={target.to} search={target.search} className="ems-finding">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>
            <strong>{issue.object}</strong>
            <small>{issue.message}</small>
          </span>
          <ArrowRight size={14} aria-hidden="true" />
        </ScopedLink>
      </li>
    );
  };

  return (
    <div className="ems-overview">
      <div className="ems-overview-context">
        {scopeSelectors}
        <dl className="ems-facts" aria-label="Factory scope">
          <div>
            <dt>Lines</dt>
            <dd>{lines.length}</dd>
          </div>
          <div>
            <dt>Stations on line</dt>
            <dd>{stations.length}</dd>
          </div>
          <div>
            <dt>Hardware records</dt>
            <dd>{hardware.length}</dd>
          </div>
          <div data-tone={findings.length ? "warn" : undefined}>
            <dt>Findings</dt>
            <dd>{findings.length}</dd>
          </div>
        </dl>
      </div>

      <section className="ems-next-task" aria-labelledby="ems-next-task-title">
        <div className="ems-next-task-icon" aria-hidden="true">
          {firstFinding ? <AlertTriangle size={22} /> : <Workflow size={22} />}
        </div>
        <div className="ems-next-task-body">
          <span className="ems-eyebrow">Next engineering task</span>
          <h2 id="ems-next-task-title">{next.title}</h2>
          <p>{next.reason}</p>
        </div>
        <ScopedLink to={next.to} search={next.search} className="ems-button-primary">
          {next.action}
          <ArrowRight size={16} aria-hidden="true" />
        </ScopedLink>
      </section>

      <div className="ems-overview-main">
        <section className="ems-workarea" aria-labelledby="ems-line-title">
          <header className="ems-workarea-head">
            <div>
              <span className="ems-eyebrow">
                <Network size={13} aria-hidden="true" /> {model.scope}
              </span>
              <h2 id="ems-line-title">
                {lineId ? `${lineId} · ${model.name}` : "No line selected"}
              </h2>
            </div>
            <ScopedLink
              to={lineId ? "/line-engineering" : "/lines"}
              search={{ ...siteScope, ...(lineId ? { engLine: lineId } : {}) }}
              className="ems-button-quiet"
            >
              {lineId ? "Open line design" : "Create a line"}
              <ArrowRight size={14} aria-hidden="true" />
            </ScopedLink>
          </header>
          {stations.length ? (
            <ol className="ems-line-flow" aria-label="Stations in line order">
              {stations.map((s, at) => {
                const open = findingsFor(s.id);
                return (
                  <li key={s.id}>
                    <ScopedLink
                      to="/workstations"
                      search={{ ...siteScope, engLine: lineId, engStation: s.id }}
                      className="ems-station"
                      data-attention={open ? true : undefined}
                    >
                      <span className="ems-station-glyph">
                        <ModeIcon mode={s.mode} />
                      </span>
                      <span className="ems-station-order">{String(at + 1).padStart(2, "0")}</span>
                      <span className="ems-station-id">{s.id}</span>
                      <strong>{s.name}</strong>
                      <span className="ems-station-meta">
                        <span>{modeLabel(s.mode)}</span>
                        <span>
                          <Server size={12} aria-hidden="true" /> {s.equipment.length}
                        </span>
                        {open ? (
                          <span className="is-warn">
                            <AlertTriangle size={12} aria-hidden="true" /> {open}
                          </span>
                        ) : null}
                      </span>
                      <span className="ems-station-binding">
                        {s.app ? `App · ${s.app}` : "No application bound"}
                      </span>
                    </ScopedLink>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="ems-empty">
              Add a line and assign its first station to start engineering.
            </p>
          )}
          <nav className="ems-start-points" aria-label="Engineering workflow">
            <ScopedLink to="/lines" search={siteScope}>
              <Network size={16} aria-hidden="true" />
              <span>
                <strong>Define production lines</strong>
                <small>Line identity and operating area</small>
              </span>
            </ScopedLink>
            <ScopedLink to="/asset-steps" search={{ ...siteScope, engLine: lineId }}>
              <GitBranch size={16} aria-hidden="true" />
              <span>
                <strong>Design manufacturing steps</strong>
                <small>Sequence, station options, dependencies</small>
              </span>
            </ScopedLink>
            <ScopedLink to="/registry" search={siteScope}>
              <Boxes size={16} aria-hidden="true" />
              <span>
                <strong>Inspect physical assets</strong>
                <small>Equipment, ownership, external IDs</small>
              </span>
            </ScopedLink>
          </nav>
        </section>

        <aside className="ems-overview-side" aria-label="Review and evidence">
          {brief}
          <section className="ems-side-block" aria-labelledby="ems-findings-title">
            <header>
              <h2 id="ems-findings-title">Engineering findings</h2>
              <ScopedLink
                to="/release-readiness"
                search={{ ...siteScope, engLine: lineId }}
                className="ref-issue-link"
              >
                Readiness
                <ArrowRight size={14} aria-hidden="true" />
              </ScopedLink>
            </header>
            {findings.length ? (
              <>
                <ul className="ems-findings">{visibleFindings.map(findingRow)}</ul>
                {moreFindings.length ? (
                  <details className="ems-disclosure">
                    <summary>Show {moreFindings.length} more</summary>
                    <ul className="ems-findings">{moreFindings.map(findingRow)}</ul>
                  </details>
                ) : null}
              </>
            ) : (
              <p className="ems-empty">
                <CheckCircle2 size={16} aria-hidden="true" /> No current engineering findings.
              </p>
            )}
          </section>
          <section className="ems-side-block" aria-labelledby="ems-reviews-title">
            <h2 id="ems-reviews-title">Engineering reviews</h2>
            <nav className="ems-review-links" aria-label="Engineering reviews">
              <ScopedLink to="/approvals" search={siteScope}>
                <FileSignature size={15} aria-hidden="true" /> Approval chain
              </ScopedLink>
              <ScopedLink to="/commissioning" search={siteScope}>
                <ClipboardCheck size={15} aria-hidden="true" /> Commissioning evidence
              </ScopedLink>
              <ScopedLink to="/changes" search={siteScope}>
                <History size={15} aria-hidden="true" /> Change history
              </ScopedLink>
            </nav>
          </section>
          {layout}
        </aside>
      </div>
    </div>
  );
}
