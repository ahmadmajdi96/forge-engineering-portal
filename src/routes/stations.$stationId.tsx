import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { useAssetStore } from "@/lib/engineering/asset-store";
import { AssignedApplications } from "@/components/engineering/assigned-applications";
import { HardwareAssignment } from "@/components/engineering/hardware-assignment";
import {
  KeyValues,
  Notice,
  ReferencePage,
  RefTable,
  Surface,
  DraftDialog,
} from "@/components/engineering/reference-ui";
import { WorkspaceHistory } from "@/components/engineering/workspace-history";
import { stationsForStep } from "@/lib/engineering/asset-flow";

export const Route = createFileRoute("/stations/$stationId")({
  head: ({ params }) => ({
    meta: [
      { title: `Station ${params.stationId} · Engineering Portal` },
      {
        name: "description",
        content: "Shared station profile, machine configuration and engineering assignments.",
      },
      { property: "og:title", content: `Station ${params.stationId} · Engineering Portal` },
      {
        property: "og:description",
        content: "Shared station profile, machine configuration and engineering assignments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StationProfile,
  notFoundComponent: () => (
    <div className="grid place-items-center p-12 text-sm text-muted-foreground">
      Station not found.
    </div>
  ),
});

function StationProfile() {
  const { stationId } = Route.useParams();
  const {
    workspaceModel: model,
    selected,
    select,
    loadState,
    site,
    revision,
    issues,
  } = useEngineering();
  const store = useAssetStore();
  const station = model.stations.find((s) => s.id === stationId),
    line = model.lines.find((l) => l.id === station?.lineId && !l.archived);
  const [saving, setSaving] = useState(false),
    [template, setTemplate] = useState("");
  const activeId = station?.id;
  useEffect(() => {
    if (loadState === "ready" && activeId && selected !== activeId) select(activeId);
  }, [loadState, activeId, selected, select]);
  if (loadState !== "ready")
    return (
      <p role="status">
        {loadState === "loading" ? "Loading station…" : "Factory records could not be loaded."}
      </p>
    );
  if (!station || !line)
    return (
      <Surface title="Station unavailable">
        <p>This station is archived or outside the selected factory.</p>
        <Button asChild variant="outline">
          <Link to="/stations" search={(p) => ({ ...p })}>
            Station registry
          </Link>
        </Button>
      </Surface>
    );
  const scope = { engLine: line.id, engStation: station.id };
  const hardware = model.records.filter(
    (r) =>
      !r.archived && (r.kind === "equipment" || r.kind === "terminal") && r.parent === station.id,
  );
  const operations = model.records.filter(
    (r) =>
      !r.archived &&
      r.kind === "operation" &&
      stationsForStep(model, r).some((s) => s.id === station.id),
  );
  const findings = issues.filter(
    (i) => i.object === station.id || hardware.some((h) => h.id === i.object),
  );
  const configured = store.stations.find((s) => s.id === station.id);
  const templateIds = configured?.templateIds ?? [];
  const available = store.stepTemplates.filter((t) => !templateIds.includes(t.id));
  return (
    <ReferencePage
      title={station.name}
      sub={[
        site ?? model.scope,
        line.name,
        station.id,
        revision ? "Engineering revision r" + revision : "Working draft",
      ].join(" / ")}
      actions={<Button onClick={() => setSaving(true)}>Save draft</Button>}
    >
      <div className="ref-actions">
        <Button asChild variant="outline">
          <Link to="/stations" search={(p) => ({ ...p, ...scope })}>
            All stations
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/workstations" search={(p) => ({ ...p, ...scope })}>
            Station composition
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link
            to="/factory-layout"
            search={(p) => ({ ...p, ...scope, station: station.id, line: line.id })}
          >
            Locate in layout
          </Link>
        </Button>
      </div>
      <div className="ref-two-col">
        <Surface title="Engineering configuration">
          <KeyValues
            items={[
              ["Station identifier", station.id],
              ["Production line", line.name],
              ["Location", line.plant || "Unassigned"],
              ["Control mode", station.mode],
              ["Tracking", station.tracking],
              [
                "Configured cycle time",
                station.config?.cycleTimeSec ? station.config.cycleTimeSec + " s" : "Unspecified",
              ],
              ["Configured target", station.config?.target || "Unspecified"],
              [
                "Capabilities",
                [...new Set(hardware.map((r) => r.hardware?.capabilities).filter(Boolean))].join(
                  ", ",
                ) || "Unspecified",
              ],
            ]}
          />
        </Surface>
        <AssignedApplications stationId={station.id} />
      </div>
      <Surface title="Equipment and connected hardware">
        {hardware.length ? (
          <RefTable
            headers={["Hardware", "Identifier", "Type", "Document", "Detail"]}
            rows={hardware.map((r) => [
              r.name,
              r.id,
              r.hardware?.category || r.kind,
              r.hardware?.document || "No reference",
              <Link
                className="ref-issue-link"
                to={r.kind === "terminal" ? "/terminals" : "/machines"}
                search={(p) => ({ ...p, ...scope, engAsset: r.id })}
              >
                Inspect
              </Link>,
            ])}
          />
        ) : (
          <p className="ref-empty">No equipment or terminals assigned to this station.</p>
        )}
        <HardwareAssignment key={station.id} stationId={station.id} />
      </Surface>
      <div className="ref-two-col">
        <Surface title="Production use">
          {operations.length ? (
            <ul>
              {operations.map((r) => (
                <li key={r.id}>
                  <Link
                    className="ref-issue-link"
                    to="/asset-steps"
                    search={(p) => ({ ...p, ...scope, step: r.id })}
                  >
                    {r.name} · {r.id}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No manufacturing steps reference this station.</p>
          )}
          <h3 className="ref-section-label">Step templates</h3>
          {templateIds.map((id) => (
            <div key={id} className="flex items-center justify-between gap-2">
              <span>{store.stepTemplates.find((t) => t.id === id)?.name ?? id}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => store.removeTemplateFromStation(station.id, id)}
              >
                Unassign
              </Button>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <label>
              Available template
              <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="">Choose template</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              disabled={!available.some((t) => t.id === template)}
              onClick={() => {
                store.applyTemplateToStation(station.id, template);
                setTemplate("");
              }}
            >
              Assign
            </Button>
          </div>
        </Surface>
        <Surface title="Readiness and evidence">
          {findings.length ? (
            <ul>
              {findings.map((issue) => (
                <li key={issue.id}>
                  <Link
                    className="ref-issue-link"
                    to={issue.category === "Signals" ? "/station-connectivity" : "/workstations"}
                    search={(p) => ({ ...p, ...scope })}
                  >
                    {issue.object} · {issue.message}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No station-specific validation findings.</p>
          )}
          <Notice>
            Live telemetry, downtime and operator presence are unavailable for this engineering
            workspace.
          </Notice>
          <Button asChild variant="outline">
            <Link to="/commissioning" search={(p) => ({ ...p, ...scope })}>
              Commissioning evidence
            </Link>
          </Button>
        </Surface>
      </div>
      <details className="ref-surface p-4">
        <summary className="cursor-pointer">Engineering revision history</summary>
        <WorkspaceHistory />
      </details>
      <DraftDialog open={saving} onClose={() => setSaving(false)} />
    </ReferencePage>
  );
}
