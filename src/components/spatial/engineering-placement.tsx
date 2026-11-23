import { useState, type FormEvent } from "react";
import { useEngineering } from "@/lib/engineering/context";
import type { DraftEdit } from "@/lib/spatial/draft";
import type { LayoutTarget } from "@/lib/spatial/engineering-links";
import {
  createSpace,
  type Occurrence,
  type SpaceNode,
  type SpatialDocument,
} from "@/lib/spatial/model";
import { button, control, Field, panel } from "./editor-controls";

type Option = { id: string; name: string; kind?: "equipment" | "terminal" };
const optionKey = (option: Option) => (option.kind ? option.kind + "/" + option.id : option.id);
function RecordPicker({
  label,
  options,
  initial,
  onApply,
}: {
  label: string;
  options: Option[];
  initial?: string | undefined;
  onApply: (option: Option) => void;
}) {
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState(initial ?? "");
  const filtered = options.filter((option) =>
    (option.name + " " + option.id).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const shown = filtered.slice(0, 100);
  const selected = shown.find((option) => optionKey(option) === choice);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected) onApply(selected);
  };
  return (
    <form className="space-y-2 border-t border-border pt-2" onSubmit={submit}>
      <Field name={label}>
        <input
          type="search"
          className={control + " w-full"}
          placeholder="Search by name or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      <select
        aria-label={label + " choices"}
        className={control + " w-full"}
        value={selected ? optionKey(selected) : ""}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Choose a record</option>
        {shown.map((option) => (
          <option key={optionKey(option)} value={optionKey(option)}>
            {option.name} · {option.kind} {option.id}
          </option>
        ))}
      </select>
      {filtered.length > 100 && (
        <p className="text-xs text-muted-foreground">
          Showing 100 of {filtered.length}. Refine your search.
        </p>
      )}
      {!filtered.length && (
        <p className="text-xs text-muted-foreground">No eligible records in this scope.</p>
      )}
      <button type="submit" className={button} disabled={!selected}>
        {label}
      </button>
    </form>
  );
}

export function EngineeringPlacement({
  site,
  scope,
  placed,
  document,
  readonly,
  target,
  apply,
  selectSpace,
}: {
  site: string;
  scope: SpaceNode;
  placed: Occurrence | undefined;
  document: SpatialDocument;
  readonly: boolean;
  target: LayoutTarget;
  apply: (change: DraftEdit) => void;
  selectSpace: (id: string) => void;
}) {
  const engineering = useEngineering();
  const [moveTo, setMoveTo] = useState("");
  const entity = placed ? document.spaces.find((s) => s.id === placed.stationId) : scope;
  if (!entity || !["area", "line", "station"].includes(entity.kind)) return null;
  const model = engineering.workspaceModel;
  const parent = document.spaces.find((s) => s.id === entity.parentId);
  const ownId = placed
    ? placed.asset?.system === "EMS"
      ? placed.asset.id
      : undefined
    : entity.engineeringId;
  const ready =
    engineering.site === site && engineering.authenticated && engineering.loadState === "ready";
  const canLink =
    ready && !readonly && !engineering.dirty && engineering.revision > 0 && !placed?.locked;
  const layoutLine =
    entity.kind === "line" ? entity : entity.kind === "station" ? parent : undefined;
  const line = layoutLine?.engineeringId;
  const station = entity.kind === "station" ? entity.engineeringId : undefined;
  const candidates =
    placed && ownId
      ? model.records.filter(
          (r) =>
            r.id === ownId &&
            ["terminal", "equipment"].includes(r.kind) &&
            r.parent === station &&
            (!placed.asset?.kind || r.kind === placed.asset.kind),
        )
      : [];
  const record = candidates.length === 1 ? candidates[0] : undefined;
  const url = new URLSearchParams({ site });
  if (line) url.set("engLine", line);
  if (station) url.set("engStation", station);
  if (record) url.set("engAsset", record.id);
  const path = placed
    ? record?.kind === "terminal"
      ? "/terminals"
      : "/machines"
    : entity.kind === "line"
      ? "/lines/" + encodeURIComponent(ownId ?? "")
      : "/stations/" + encodeURIComponent(ownId ?? "");
  const linkedNodes = new Set(
    document.spaces.flatMap((s) => (s.engineeringId ? [s.kind + "/" + s.engineeringId] : [])),
  );
  const availableLines = model.lines.filter((l) => !l.archived && !linkedNodes.has("line/" + l.id));
  const availableStations = model.stations.filter(
    (s) => s.lineId === line && !linkedNodes.has("station/" + s.id),
  );
  const occupied = document.occurrences.flatMap((o) =>
    o.asset?.system === "EMS" ? [o.asset] : [],
  );
  const availableAssets: Option[] = model.records.flatMap((r) =>
    !r.archived &&
    (r.kind === "equipment" || r.kind === "terminal") &&
    r.parent === station &&
    !occupied.some((a) => a.id === r.id && (!a.kind || a.kind === r.kind))
      ? [{ id: r.id, name: r.name, kind: r.kind }]
      : [],
  );
  const requestedAssets = availableAssets.filter(
    (a) => a.id === target.asset && (!target.assetKind || target.assetKind === a.kind),
  );
  const requestedAsset = requestedAssets.length === 1 ? requestedAssets[0] : undefined;
  const modify = (id: string, patch: Partial<SpaceNode>) =>
    apply((current) => ({
      ...current,
      spaces: current.spaces.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  const bind = (record: Option) => modify(entity.id, { engineeringId: record.id });
  const add = (record: Option) => {
    const node = { ...createSpace(entity, record.name), engineeringId: record.id };
    apply((current) => ({ ...current, spaces: [...current.spaces, node] }));
    selectSpace(node.id);
  };
  const linkAsset = (asset: Occurrence["asset"]) =>
    apply((current) => ({
      ...current,
      occurrences: current.occurrences.map((o) => (o.id === placed?.id ? { ...o, asset } : o)),
    }));
  const hasDependents =
    document.spaces.some((s) => s.parentId === entity.id && s.engineeringId) ||
    document.occurrences.some((o) => o.stationId === entity.id && o.asset?.system === "EMS");
  const sameFloorAreas =
    entity.kind === "line" && parent
      ? document.spaces.filter(
          (s) => s.kind === "area" && s.parentId === parent.parentId && s.id !== parent.id,
        )
      : [];
  return (
    <section className={panel + " space-y-2"} aria-label="Engineering relationships">
      <h2 className="text-sm font-semibold">Engineering record</h2>
      {ownId ? (
        <div className="space-y-2">
          <p className="break-all text-xs">{ownId}</p>
          {ready && (!placed || record) && (
            <a className="text-sm text-primary underline" href={path + "?" + url}>
              Open {placed ? "asset" : entity.kind} details
            </a>
          )}
          {canLink && (placed || !hasDependents) && (
            <button
              type="button"
              className={button}
              onClick={() =>
                placed ? linkAsset(null) : modify(entity.id, { engineeringId: undefined })
              }
            >
              Unlink record
            </button>
          )}
          {canLink && !placed && hasDependents && (
            <p className="text-xs text-muted-foreground">
              Unlink child records before changing this relationship.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {placed?.asset
            ? "External asset · " + placed.asset.system + " / " + placed.asset.id
            : entity.kind === "area"
              ? "Place a saved production line in this area."
              : "No linked engineering record."}
        </p>
      )}
      {!readonly && !canLink && (
        <p className="text-xs text-muted-foreground">
          {placed?.locked
            ? "Unlock the placement to change its link."
            : engineering.dirty || (ready && !engineering.revision)
              ? "Save an engineering revision to link its records."
              : engineering.loadState === "loading"
                ? "Loading engineering records…"
                : "Engineering records are unavailable in this session."}
        </p>
      )}
      {canLink && !placed && (
        <>
          {!ownId && entity.kind === "line" && (
            <RecordPicker
              label="Link existing line"
              options={availableLines}
              initial={target.line}
              onApply={bind}
            />
          )}
          {!ownId &&
            entity.kind === "station" &&
            (line ? (
              <RecordPicker
                label="Link existing station"
                options={availableStations}
                initial={target.station}
                onApply={bind}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Link the parent line first.</p>
            ))}
          {entity.kind === "area" && (
            <RecordPicker
              label="Place engineering line"
              options={availableLines}
              initial={target.line}
              onApply={add}
            />
          )}
          {entity.kind === "line" && line && (
            <RecordPicker
              label="Place engineering station"
              options={availableStations}
              initial={target.station}
              onApply={add}
            />
          )}
        </>
      )}
      {canLink &&
        placed &&
        !placed.asset &&
        (station ? (
          <RecordPicker
            label="Link equipment or terminal"
            options={availableAssets}
            initial={requestedAsset ? optionKey(requestedAsset) : undefined}
            onApply={(r) => linkAsset({ system: "EMS", id: r.id, kind: r.kind, exclusive: true })}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Link this placement's station to an engineering station first.
          </p>
        ))}
      {!readonly && !placed && sameFloorAreas.length > 0 && (
        <form
          className="space-y-2 border-t border-border pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (sameFloorAreas.some((s) => s.id === moveTo)) {
              modify(entity.id, { parentId: moveTo });
              setMoveTo("");
            }
          }}
        >
          <Field name="Move line to area">
            <select
              className={control + " w-full"}
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
            >
              <option value="">Choose an area on this floor</option>
              {sameFloorAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-muted-foreground">
            The line and its stations keep their floor coordinates.
          </p>
          <button type="submit" className={button} disabled={!moveTo}>
            Change area
          </button>
        </form>
      )}
    </section>
  );
}
