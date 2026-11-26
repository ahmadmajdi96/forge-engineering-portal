import { useMemo } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { useStore } from "@/lib/store";
import { Notice, ReferencePage, RefTable, RefTabs, Surface } from "./reference-ui";
import { csvCell } from "./report-export";

const tabs = [
  { id: "inventory", label: "Master data inventory" },
  { id: "assignments", label: "Dated assignments" },
  { id: "calibration", label: "Machine calibration" },
  { id: "crosswalk", label: "Legacy crosswalk" },
  { id: "changes", label: "Signed change history" },
] as const;
type ReportTab = (typeof tabs)[number]["id"];

type CsvValue = string | number;
function downloadCsv(name: string, rows: CsvValue[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
function validDate(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function assignmentDates(record: unknown) {
  if (!record || typeof record !== "object") return { from: "", to: "", policy: "" };
  const source = record as Record<string, unknown>;
  const hardware =
    source["hardware"] && typeof source["hardware"] === "object"
      ? (source["hardware"] as Record<string, unknown>)
      : {};
  const assignment =
    source["assignment"] && typeof source["assignment"] === "object"
      ? (source["assignment"] as Record<string, unknown>)
      : {};
  const from = text(
    assignment["from"] ??
      assignment["effectiveFrom"] ??
      hardware["effectiveFrom"] ??
      source["effectiveFrom"],
  );
  const to = text(
    assignment["to"] ??
      assignment["effectiveTo"] ??
      hardware["effectiveTo"] ??
      source["effectiveTo"],
  );
  const exclusive = assignment["exclusive"] ?? hardware["exclusive"];
  return {
    from,
    to,
    policy: typeof exclusive === "boolean" ? (exclusive ? "Exclusive" : "Shared") : "",
  };
}

/** Legacy Reports capabilities, presented against the current engineering revision where available. */
export function AssetReports() {
  const engineering = useEngineering();
  const native = (engineering as typeof engineering & { native?: boolean }).native;
  return native ? <ReportContent /> : <SandboxReportContent />;
}
function SandboxReportContent() {
  const legacy = useStore();
  return <ReportContent legacy={legacy} />;
}
function ReportContent({
  legacy,
}: {
  legacy?: Pick<ReturnType<typeof useStore>, "entities" | "log"> | undefined;
}) {
  const engineering = useEngineering();
  const { workspaceModel: model, revision } = engineering;
  const { site, native, dirty } = engineering as typeof engineering & {
    site?: string | undefined;
    native?: boolean | undefined;
    dirty?: boolean | undefined;
  };
  const entities = legacy?.entities;
  const log = legacy?.log;
  const navigate = useNavigate();
  const locationSearch = useRouterState({ select: (state) => state.location.search }) as Record<
    string,
    unknown
  >;
  const selected = tabs.some((tab) => tab.id === locationSearch["report"])
    ? (locationSearch["report"] as ReportTab)
    : "inventory";
  const revisionLabel = revision ? `r${revision}` : "Working draft";
  const archivedStations = (
    model as typeof model & {
      archivedStations?: typeof model.stations;
    }
  ).archivedStations;
  const inventory = useMemo(
    () => [
      ...model.lines.map((line) => ({
        id: line.id,
        name: line.name,
        kind: "line",
        version: revisionLabel,
        parent: line.plant,
        state: line.archived ? "Archived" : "Active",
      })),
      ...model.stations.map((station) => ({
        id: station.id,
        name: station.name,
        kind: "station",
        version: revisionLabel,
        parent: station.lineId,
        state: "Active",
      })),
      ...(archivedStations ?? []).map((station) => ({
        id: station.id,
        name: station.name,
        kind: "station",
        version: revisionLabel,
        parent: station.lineId,
        state: "Archived",
      })),
      ...model.records.map((record) => ({
        id: record.id,
        name: record.name,
        kind: record.kind,
        version: record.version || revisionLabel,
        parent: record.parent,
        state: record.archived ? "Archived" : "Active",
      })),
    ],
    [model, revisionLabel, archivedStations],
  );
  const assignments = useMemo(
    () =>
      model.stations.flatMap((station) => {
        const placed = model.records.filter(
          (record) =>
            !record.archived &&
            ["equipment", "terminal"].includes(record.kind) &&
            record.parent === station.id,
        );
        const ids = new Set([...station.equipment, ...placed.map((record) => record.id)]);
        return [...ids].flatMap((asset) => {
          const record = model.records.find(
            (item) =>
              !item.archived && item.id === asset && ["equipment", "terminal"].includes(item.kind),
          );
          if (record && record.parent !== station.id) return [];
          return [
            {
              station: station.id,
              asset,
              name: record?.name ?? "Unregistered asset reference",
              role: record?.kind ?? "Unregistered",
              ...(native ? { from: "", to: "", policy: "" } : assignmentDates(record)),
            },
          ];
        });
      }),
    [model, native],
  );
  const mappings = useMemo(
    () => model.records.filter((record) => record.kind === "mapping" && !record.archived),
    [model.records],
  );
  const calibration = useMemo(
    () =>
      (native
        ? model.records
            .filter((record) => record.kind === "equipment" && !record.archived)
            .map((record) => ({
              name: record.name,
              data: { serial: record.value, lastCal: undefined, calInterval: undefined },
            }))
        : (entities ?? [])
      )
        .filter((entity) => !("kind" in entity) || entity.kind === "machines")
        .map((machine) => {
          const last = validDate(machine.data.lastCal);
          const interval = Number(machine.data.calInterval);
          const candidate =
            last && Number.isFinite(interval) && interval > 0
              ? new Date(last.getTime() + interval * 864e5)
              : undefined;
          const due = candidate && Number.isFinite(candidate.getTime()) ? candidate : undefined;
          const days = due ? Math.ceil((due.getTime() - Date.now()) / 864e5) : undefined;
          return {
            machine,
            last,
            interval: Number.isFinite(interval) && interval > 0 ? interval : undefined,
            due,
            days,
          };
        }),
    [entities, native, model.records],
  );
  const signed = native ? [] : (log ?? []).filter((entry) => entry.signature);
  const evidenceUnavailable = native && selected === "changes";

  const setTab = (tab: ReportTab) => {
    void navigate({
      to: "/registry",
      replace: true,
      search: (old) => ({ ...old, view: "reports", report: tab }) as never,
    });
  };
  const exportRows = (name: string, rows: CsvValue[][]) =>
    downloadCsv(name, [
      [
        "Source",
        native
          ? "Canonical engineering revision; not production calibration or signed evidence"
          : "Browser-local sandbox records; not production evidence",
      ],
      ["Revision", dirty ? `Unsaved working draft based on ${revisionLabel}` : revisionLabel],
      ...rows,
    ]);
  const exportCurrent = () => {
    if (evidenceUnavailable) return;
    if (selected === "inventory")
      exportRows(native ? "engineering-asset-inventory" : "sandbox-asset-inventory", [
        ["Type", "Name", "Identifier", "Revision", "Parent", "State"],
        ...inventory.map((row) => [row.kind, row.name, row.id, row.version, row.parent, row.state]),
      ]);
    if (selected === "assignments")
      exportRows(
        native
          ? "engineering-memberships-not-effective-assignments"
          : "sandbox-dated-asset-assignments",
        [
          ["Station", "Asset", "Name", "Role", "Effective from", "Effective to", "Policy"],
          ...assignments.map((row) => [
            row.station,
            row.asset,
            row.name,
            row.role,
            native ? "Unavailable in native asset contract" : row.from,
            native ? "Unavailable in native asset contract" : row.to,
            native ? "Unavailable in native asset contract" : row.policy,
          ]),
        ],
      );
    if (selected === "crosswalk")
      exportRows("legacy-identity-crosswalk", [
        ["Mapping", "Engineering station", "External resource", "Operation", "Revision"],
        ...mappings.map((row) => [row.id, row.parent, row.binding, row.value, row.version]),
      ]);
    if (selected === "calibration")
      exportRows(
        native ? "engineering-equipment-calibration-unavailable" : "sandbox-machine-calibration",
        [
          ["Machine", "Serial", "Last calibration", "Interval (days)", "Due", "Days left"],
          ...calibration.map(({ machine, last, interval, due, days }) => [
            machine.name,
            text(machine.data.serial),
            last?.toISOString().slice(0, 10) ?? (native ? "Unavailable" : ""),
            interval ?? (native ? "Unavailable" : ""),
            due?.toISOString().slice(0, 10) ?? (native ? "Unavailable" : ""),
            days ?? (native ? "Unavailable" : ""),
          ]),
        ],
      );
    if (selected === "changes")
      exportRows("sandbox-local-signature-history", [
        ["Time", "User", "Item", "Revision", "Action", "Reason", "Signature"],
        ...signed.map((entry) => [
          entry.at,
          entry.user,
          entry.entityName,
          entry.version,
          entry.action,
          entry.note ?? "",
          entry.signature ?? "",
        ]),
      ]);
  };

  return (
    <ReferencePage
      title="Assets · Reports & export"
      sub={`${site ?? model.scope} · Asset registry and engineering evidence`}
      actions={
        <div className="ems-asset-report-actions">
          <Button variant="outline" asChild>
            <Link
              to="/registry"
              search={(old) => ({ ...old, view: undefined, report: undefined }) as never}
            >
              Back to asset registry
            </Link>
          </Button>
          <Button
            onClick={exportCurrent}
            disabled={evidenceUnavailable}
            title={
              evidenceUnavailable
                ? "Native signed history is not exposed by this report"
                : undefined
            }
          >
            <Download size={15} />
            Export CSV
          </Button>
        </div>
      }
    >
      <div className="ems-asset-report-meta">
        <span>
          {native
            ? dirty
              ? "Unsaved working revision"
              : `Saved engineering revision ${revisionLabel}`
            : "Engineering workspace"}
        </span>
        <span>Inventory, assignments and crosswalk use the canonical asset model.</span>
      </div>
      <Surface
        title={tabs.find((tab) => tab.id === selected)?.label ?? "Engineering reports"}
        sub="Exports retain source identity; unavailable evidence is never substituted from browser-local records."
      >
        <div className="ems-asset-report-tabs">
          <RefTabs
            items={tabs.map((tab) => tab.label)}
            value={tabs.find((tab) => tab.id === selected)?.label ?? tabs[0].label}
            onChange={(label) => {
              const tab = tabs.find((item) => item.label === label);
              if (tab) setTab(tab.id);
            }}
          />
        </div>
        {selected === "inventory" && (
          <RefTable
            headers={["Type", "Name", "Identifier", "Revision", "Parent", "State"]}
            rows={inventory.map((row) => [
              row.kind,
              row.name,
              row.id,
              row.version,
              row.parent,
              row.state,
            ])}
          />
        )}
        {selected === "assignments" && (
          <>
            <RefTable
              headers={["Station", "Asset", "Role", "Effective interval", "Policy"]}
              rows={assignments.map((row) => [
                row.station,
                `${row.name} · ${row.asset}`,
                row.role,
                native
                  ? "Effective dates unavailable in the native asset contract"
                  : row.from || row.to
                    ? `${row.from || "Open"} → ${row.to || "Open"}`
                    : "Not recorded",
                row.policy || (native ? "Policy unavailable" : "Not recorded"),
              ])}
            />
            {native && (
              <Notice>
                These are engineering station memberships, not effective deployment intervals.
                Native date and exclusivity evidence are unavailable in this asset contract.
              </Notice>
            )}
            {!assignments.length && (
              <p className="ref-empty">No equipment assignments are recorded in this revision.</p>
            )}
          </>
        )}
        {selected === "crosswalk" && (
          <>
            <RefTable
              headers={[
                "Mapping",
                "Engineering station",
                "External resource",
                "Operation",
                "Revision",
              ]}
              rows={mappings.map((row) => [
                row.id,
                row.parent,
                row.binding || "Not recorded",
                row.value || "Not recorded",
                row.version || revisionLabel,
              ])}
            />
            {!mappings.length && (
              <p className="ref-empty">
                No external identity mappings are recorded in this revision.
              </p>
            )}
            <Notice>
              Crosswalk rows are engineering mappings, not MES acceptance or production identity
              confirmation.
            </Notice>
          </>
        )}
        {selected === "calibration" && (
          <>
            <p className="text-xs text-muted-foreground">
              {native
                ? "Source: canonical engineering equipment. Native calibration dates, intervals and certificates are unavailable; no production eligibility is inferred."
                : "Source: browser-local sandbox machine records, not production calibration evidence."}
            </p>
            <RefTable
              headers={[
                "Machine",
                "Serial",
                "Last calibration",
                "Interval (days)",
                "Due",
                "Status",
              ]}
              rows={calibration.map(({ machine, last, interval, due, days }) => [
                machine.name,
                text(machine.data.serial) || "Not recorded",
                last?.toISOString().slice(0, 10) ?? (native ? "Unavailable" : "Not recorded"),
                interval ?? (native ? "Unavailable" : "Not recorded"),
                due?.toISOString().slice(0, 10) ?? (native ? "Unavailable" : "Not recorded"),
                days === undefined
                  ? native
                    ? "Native calibration evidence unavailable"
                    : "No sandbox calibration evidence"
                  : days < 0
                    ? `Overdue by ${-days} days`
                    : days <= 30
                      ? `Due in ${days} days`
                      : `Current · ${days} days remaining`,
              ])}
            />
            {!calibration.length && (
              <p className="ref-empty">No machine calibration records are available.</p>
            )}
          </>
        )}
        {selected === "changes" && native && (
          <Notice>
            Native signed change history is unavailable in this report. Browser-local signatures are
            neither displayed nor exported as production evidence.
            {(
              engineering as typeof engineering & { actions?: readonly string[] }
            ).actions?.includes("ems.factory_releases.view") && (
              <p>
                <Link to={"/factory-releases" as never} search={{ site } as never}>
                  Open signed factory releases
                </Link>
              </p>
            )}
          </Notice>
        )}
        {selected === "changes" && !native && (
          <>
            <Notice>
              Historical browser-local sandbox signatures. These are not independently verified
              production signatures.
            </Notice>
            <RefTable
              headers={["Time", "User", "Item", "Revision", "Action", "Reason"]}
              rows={signed.map((entry) => [
                new Date(entry.at).toLocaleString(),
                entry.user,
                entry.entityName,
                `v${entry.version}`,
                entry.action,
                entry.note ?? "",
              ])}
            />
            {!signed.length && (
              <p className="ref-empty">No signed changes are recorded in this workspace.</p>
            )}
          </>
        )}
      </Surface>
    </ReferencePage>
  );
}
