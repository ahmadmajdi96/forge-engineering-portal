import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { placedHardware, updateHardware } from "@/lib/engineering/hardware-lifecycle";
import type { DesignRecord } from "@/lib/engineering/design-records";

export function HardwareAssignment({
  record,
  stationId,
}: {
  record?: DesignRecord;
  stationId?: string;
}) {
  const { workspaceModel: model, setWorkspaceModel } = useEngineering();
  const [query, setQuery] = useState(""),
    [chosen, setChosen] = useState(""),
    [review, setReview] = useState(false),
    [error, setError] = useState(""),
    [action, setAction] = useState("assign");
  const candidates = record
    ? model.stations.map((s) => ({ id: s.id, name: s.name + " · " + s.lineId }))
    : model.records
        .filter(
          (r) =>
            !r.archived &&
            placedHardware(r) &&
            (action === "unassign" ? r.parent === stationId : r.parent !== stationId),
        )
        .map((r) => ({
          id: r.kind + ":" + r.id,
          name: r.name + " · " + (r.parent || "Unassigned"),
        }));
  const matches = candidates.filter((s) =>
    (s.name + " " + s.id).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const asset = record ?? model.records.find((r) => r.kind + ":" + r.id === chosen && !r.archived);
  const destination = record ? chosen : action === "unassign" ? "" : (stationId ?? "");
  const target = destination === "__unassigned__" ? "" : destination;
  const blocked = asset && (asset.binding || model.signals.some((s) => s.equipmentId === asset.id));
  return (
    <div className="space-y-3">
      <div className="ref-form-grid">
        {!record && (
          <label>
            Assignment action
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setChosen("");
                setReview(false);
                setQuery("");
                setError("");
              }}
            >
              <option value="assign">Assign to this station</option>
              <option value="unassign">Unassign from this station</option>
            </select>
          </label>
        )}
        <label>
          Search {record ? "stations" : "hardware"}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setChosen("");
              setReview(false);
            }}
            placeholder="Name or identifier"
          />
        </label>
        <label>
          {record ? "Destination" : "Equipment or terminal"}
          <select
            value={chosen}
            onChange={(e) => {
              setChosen(e.target.value);
              setReview(false);
              setError("");
            }}
          >
            <option value="">Choose {record ? "a station" : "hardware"}</option>
            {record && record.parent && (
              <option value="__unassigned__">Unassign from station</option>
            )}
            {matches.slice(0, 100).map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {matches.length > 100 && (
        <p className="ref-sub">Showing 100 of {matches.length} matches. Refine the search.</p>
      )}
      {chosen && asset && (
        <p>
          {asset.name} · {asset.parent || "Unassigned"} → {target || "Unassigned"}
        </p>
      )}
      {blocked && chosen && (
        <p role="status">
          Rebind this asset’s signals in Station connectivity before reassignment.
        </p>
      )}
      {review && asset && (
        <p role="status">
          This change updates the hardware owner and both station compositions in the working draft.
          The asset keeps its identifier {asset.id}.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <Button
        size="sm"
        variant={review ? "default" : "outline"}
        disabled={!chosen || !asset || !!blocked || asset.parent === target}
        onClick={() => {
          if (!review) {
            setReview(true);
            return;
          }
          try {
            if (!asset) return;
            setWorkspaceModel(updateHardware(model, { ...asset, parent: target }));
            setChosen("");
            setReview(false);
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Assignment failed.");
          }
        }}
      >
        {review ? "Confirm assignment" : "Review assignment"}
      </Button>
      {review && (
        <Button size="sm" variant="ghost" onClick={() => setReview(false)}>
          Cancel
        </Button>
      )}
    </div>
  );
}
