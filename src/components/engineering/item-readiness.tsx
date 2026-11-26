import { Link } from "@tanstack/react-router";
import { AlertTriangle, Box, ShieldCheck } from "lucide-react";
import { useEngineering } from "@/lib/engineering/context";
import { Button } from "@/components/ui/button";
import { useFactorySetup } from "./setup-wizard-context";
import { setupLayoutSearch, setupSearch, type SetupScope } from "./setup-wizard-state";

/** Read-only findings from the existing workspace and the saved-layout verified item. */
export function ItemReadiness() {
  const engineering = useEngineering();
  const wizard = useFactorySetup();
  // The active host exposes these fields; the older delivery draft does not.
  const state = engineering as typeof engineering & {
    native?: boolean;
    fixture?: boolean;
    site?: string;
    dirty?: boolean;
    loadState?: "loading" | "ready" | "error";
    actions?: readonly string[];
  };
  const scope = wizard?.scope;
  const native = state.native === true;
  const actions = state.actions ?? wizard?.actions ?? [];
  const canEngineering = !native || actions.includes("ems.engineering.view");
  const canLayout = !native || actions.includes("ems.factory_layout.view");
  const failure = !wizard?.active
    ? "No active verified item setup. Choose the physical item in Factory Layout."
    : wizard.loading || state.loadState === "loading"
      ? "Loading the saved item and engineering findings…"
      : wizard.error ||
        (state.loadState === "error" ? "Engineering findings could not be loaded." : "") ||
        (!scope
          ? "The selected item is unavailable. No other item or release has been selected."
          : "") ||
        (native && (scope?.site !== state.site || scope?.site !== wizard.site)
          ? "The verified item and engineering factory do not match. Choose the item again."
          : "") ||
        (!canEngineering || !canLayout
          ? "Engineering and layout access are required to review this item."
          : "");
  const loading = wizard?.loading || state.loadState === "loading";
  if (failure || !scope)
    return (
      <section
        className="reference-page ems-engineering-page space-y-3"
        aria-label="Item readiness"
      >
        <h1 className="text-xl font-semibold">Item readiness</h1>
        <p role={loading ? "status" : "alert"}>{failure}</p>
        {!loading && wizard?.active && (
          <Button variant="outline" onClick={wizard.retry}>
            Retry item verification
          </Button>
        )}
      </section>
    );

  const { workspaceModel: model, issues, revision } = engineering;
  const line = model.lines.find((record) => record.id === scope.line && !record.archived);
  const station = line
    ? model.stations.find((record) => record.id === scope.station && record.lineId === line.id)
    : undefined;
  const asset = station
    ? model.records.find(
        (record) =>
          !record.archived &&
          record.id === scope.asset &&
          record.kind === scope.assetKind &&
          record.parent === station.id,
      )
    : undefined;
  const sourceSignals = model.signals as ReadonlyArray<
    (typeof model.signals)[number] & {
      stationId?: string;
      equipmentId?: string;
    }
  >;
  const signals =
    station && (scope.type !== "occurrence" || asset)
      ? sourceSignals.filter(
          (signal) =>
            scope.signalKeys?.includes(signal.key) &&
            signal.stationId === station.id &&
            (scope.type !== "occurrence" || signal.equipmentId === asset?.id),
        )
      : [];
  const ambiguousKeys = signals
    .filter((signal) =>
      sourceSignals.some(
        (other) =>
          other.key === signal.key &&
          (other.stationId !== signal.stationId || other.equipmentId !== signal.equipmentId),
      ),
    )
    .map((signal) => signal.key);
  const mappings = station
    ? model.records.filter(
        (record) =>
          !record.archived &&
          record.kind === "mapping" &&
          scope.mappingIds?.includes(record.id) &&
          record.parent === station.id,
      )
    : [];
  const spatial =
    scope.type === "space" &&
    ["organization", "site", "building", "floor", "area"].includes(scope.kind);
  const missing = [
    ...(scope.reason ? [scope.reason] : []),
    ...(!spatial && !line ? ["No verified engineering line relationship."] : []),
    ...(!spatial && scope.kind !== "line" && !station
      ? ["No verified station relationship under the linked line."]
      : []),
    ...(scope.type === "occurrence" && !asset
      ? ["No exact active hardware record is linked at the verified station."]
      : []),
    ...(scope.line && !line ? [`Linked line ${scope.line} is unavailable.`] : []),
    ...(scope.station && !station
      ? [`Linked station ${scope.station} is unavailable in the verified line.`]
      : []),
    ...(scope.asset && !asset
      ? [`Linked asset ${scope.asset} is unavailable at the verified station.`]
      : []),
    ...(scope.signalKeys ?? [])
      .filter((key) => !signals.some((signal) => signal.key === key))
      .map((key) => `Signal ${key} is no longer verified for this item.`),
    ...(scope.mappingIds ?? [])
      .filter((id) => !mappings.some((mapping) => mapping.id === id))
      .map((id) => `Mapping ${id} is no longer verified for this station.`),
    ...(!spatial && !signals.length
      ? [
          "No configured item signals were verified. This does not establish that signals are unnecessary.",
        ]
      : []),
    ...(!spatial && scope.mappingReason ? [scope.mappingReason] : []),
    ...ambiguousKeys.map(
      (key) =>
        `Signal key ${key} is also used by another source. The validator reports keys only, so its finding cannot be safely attributed to this item.`,
    ),
  ];
  const directIds = new Set([
    ...(asset ? [asset.id] : []),
    ...signals.filter((signal) => !ambiguousKeys.includes(signal.key)).map((signal) => signal.key),
    ...mappings.map((mapping) => mapping.id),
    ...(scope.kind === "station" && station ? [station.id] : []),
    ...(scope.kind === "line" && line ? [line.id] : []),
  ]);
  const relatedStations =
    scope.kind === "line" && line
      ? model.stations.filter((record) => record.lineId === line.id)
      : station
        ? [station]
        : [];
  const relatedIds = new Set([
    ...(line ? [line.id] : []),
    ...relatedStations.map((record) => record.id),
  ]);
  const direct = issues.filter((issue) => directIds.has(issue.object));
  const related = issues.filter(
    (issue) => !directIds.has(issue.object) && relatedIds.has(issue.object),
  );
  const guarded = Boolean(
    state.dirty || wizard.layoutDirty || (native && revision <= 0) || missing.length,
  );
  const link = (
    path: string,
    label: string,
    extra: Record<string, string> = {},
    target: SetupScope = scope,
    params?: Record<string, string>,
  ) => {
    const grant = path === "/factory-layout" ? "ems.factory_layout.view" : "ems.engineering.view";
    if ((native && !actions.includes(grant)) || wizard.layoutDirty)
      return (
        <span>
          {label}
          {wizard.layoutDirty ? " · save layout before leaving" : " · access unavailable"}
        </span>
      );
    return (
      <Link
        className="ref-issue-link inline-block min-h-10 py-2 break-words focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        to={path as never}
        {...(params ? { params: params as never } : {})}
        search={
          {
            ...(path === "/factory-layout" ? setupLayoutSearch(target) : setupSearch(target, path)),
            ...extra,
          } as never
        }
      >
        {label}
      </Link>
    );
  };
  const findingLink = (issue: (typeof issues)[number]) => {
    if (signals.some((signal) => signal.key === issue.object))
      return link("/station-connectivity", `Inspect signal ${issue.object}`, {
        signal: issue.object,
      });
    if (mappings.some((mapping) => mapping.id === issue.object))
      return link("/mes-integration", `Inspect mapping ${issue.object}`, { mapping: issue.object });
    if (asset?.id === issue.object)
      return link(
        asset.kind === "terminal" ? "/terminals" : "/machines",
        `Inspect ${issue.object}`,
      );
    const targetStation = relatedStations.find((record) => record.id === issue.object);
    if (targetStation)
      return link(
        scope.kind === "line" ? "/stations/$stationId" : "/workstations",
        `Inspect station ${issue.object} · ${issue.category}`,
        {},
        { ...scope, station: targetStation.id, asset: undefined, assetKind: undefined },
        scope.kind === "line" ? { stationId: targetStation.id } : undefined,
      );
    if (line?.id === issue.object) return link("/line-engineering", `Inspect line ${issue.object}`);
    return link("/factory-layout", "Inspect exact placement in Properties");
  };
  const findings = (entries: typeof issues, empty: string) =>
    entries.length ? (
      <ul className="divide-y">
        {entries.map((issue, index) => (
          <li key={`${issue.id}:${index}`} className="py-3 break-words">
            <p className="font-medium">{issue.message}</p>
            <p className="text-sm text-muted-foreground">
              {issue.object} · {issue.category}
            </p>
            {findingLink(issue)}
          </li>
        ))}
      </ul>
    ) : (
      <p className="py-3 text-sm">{empty}</p>
    );
  return (
    <section
      className="reference-page ems-engineering-page space-y-4 min-w-0"
      aria-label="Item-scoped readiness"
    >
      <header className="ref-page-head flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 break-words">
          <p className="text-sm text-muted-foreground">
            Sentinel ·{" "}
            {native
              ? state.fixture
                ? "Native training configuration"
                : "Native engineering configuration"
              : "Local sandbox · not production evidence"}
          </p>
          <h1 className="text-xl font-semibold">Item readiness · {scope.label}</h1>
          <p className="text-sm">
            {scope.site} · {scope.kind} · {scope.id} ·{" "}
            {revision > 0 ? `Workspace r${revision}` : "No saved engineering revision"}
            {state.dirty ? " · unsaved engineering changes" : ""}
          </p>
        </div>
        <div>{link("/factory-layout", "Return to exact item in 3D")}</div>
      </header>
      <p role="status" className="flex items-start gap-2 rounded-md border p-3 text-sm">
        {guarded ? (
          <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
        ) : (
          <ShieldCheck size={18} className="shrink-0" aria-hidden="true" />
        )}
        <span>
          {guarded
            ? "Readiness is guarded: resolve missing relationships and save changes before treating this as a saved configuration review."
            : "Configuration findings reviewed for the identities below. This is not release approval or a commissioning result."}{" "}
          No release is selected and no changes are made here.
        </span>
      </p>
      {wizard.layoutDirty && (
        <p role="alert">
          The layout has unsaved changes. Save it in the existing layout editor before leaving;
          these links do not save automatically.
        </p>
      )}
      <details className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer min-h-10 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          Checked identities &amp; source limits
        </summary>
        <dl className="grid grid-cols-1 gap-2 py-3 text-sm sm:grid-cols-2">
          {[
            ["Physical item", `${scope.type}: ${scope.id}`],
            [
              "Hierarchy",
              scope.hierarchy?.map((node) => `${node.label} (${node.id})`).join(" / ") ||
                "Unavailable",
            ],
            [
              "Dimensions",
              scope.size
                ? `${scope.size.x} × ${scope.size.z} × ${scope.size.y} m (width × depth × height)`
                : "Not defined",
            ],
            ["Engineering asset", asset?.id ?? "Not linked"],
            ["Station", station?.id ?? "Not linked"],
            ["Line", line?.id ?? "Not linked"],
            ["Signals", signals.map((signal) => signal.key).join(", ") || "None verified"],
            ["MES mappings", mappings.map((mapping) => mapping.id).join(", ") || "None verified"],
          ].map(([name, value]) => (
            <div key={name} className="min-w-0 break-words">
              <dt className="text-muted-foreground">{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground pb-3">
          Findings use the current engineering workspace validator, not live signal readback, signed
          commissioning, MES acknowledgement or device activation. Unattributed/global findings are
          not presented as item findings. No findings does not mean all dependencies have been
          tested.
        </p>
      </details>
      {!!missing.length && (
        <section aria-label="Missing relationships" className="border-b pb-3">
          <h2 className="font-semibold">Missing relationships / verification limits</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm pt-2">
            {Array.from(new Set(missing)).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Direct item findings">
        <h2 className="font-semibold">Direct item findings</h2>
        {findings(
          direct,
          "No current validator findings match the exact item, asset, verified signals or mappings. Coverage and evidence limits still apply.",
        )}
      </section>
      <details className="rounded-md border px-3 py-2" open={related.length > 0}>
        <summary className="cursor-pointer min-h-10 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          Related station / line findings ({related.length})
        </summary>
        <p className="text-sm text-muted-foreground">
          These belong to the verified containing station or line, not necessarily the selected
          hardware.
        </p>
        {findings(related, "No findings match the verified related station or line identities.")}
      </details>
      <section aria-label="Exact configuration links" className="border-t pt-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Box size={18} aria-hidden="true" />
          Inspect exact configuration
        </h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {signals.map((signal) => (
            <li key={signal.key}>
              {link("/station-connectivity", signal.key, { signal: signal.key })}
            </li>
          ))}
          {mappings.map((mapping) => (
            <li key={mapping.id}>
              {link("/mes-integration", mapping.id, { mapping: mapping.id })}
            </li>
          ))}
          <li>{link("/factory-layout", "Placement / dimensions / hierarchy")}</li>
        </ul>
      </section>
      <p className="text-sm text-muted-foreground border-t pt-3">
        Finishing setup only returns to the exact physical item. Approval, release, commissioning,
        safety certification and activation require their separate authorized processes and
        independent evidence.
      </p>
    </section>
  );
}
