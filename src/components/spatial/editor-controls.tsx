import { Link } from "@tanstack/react-router";
import { resolveFactoryAssignment } from "@/lib/production/assignment.functions";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  changeSizes,
  compatiblePorts,
  connectionKinds,
  equipmentKinds,
  floorReferenceSchema,
  importUnits,
  origin,
  portPosition,
  snapToPort,
  templateKey,
  type CatalogTemplate,
  type Connection,
  type FloorReference,
  type Occurrence,
  type Port,
  type SpaceNode,
  type SpatialDocument,
  type Vector,
} from "@/lib/spatial/model";
import {
  digestArtifact,
  encodeArtifact,
  readArtifactFile,
  readFloorDimensions,
} from "@/lib/spatial/artifacts";
import { add } from "@/lib/spatial/model";
import type { DraftEdit } from "@/lib/spatial/draft";
import type { VisualRecord } from "./scene";

export const control =
  "min-h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
export const button =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-45";
export const primary =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-45";
export const panel = "rounded-lg border border-border bg-card p-3";
const axes = ["x", "y", "z"] as const;
const submitted = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};
const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const number = (data: FormData, key: string) => Number(data.get(key));
const triple = (data: FormData, key: string): Vector => ({
  x: number(data, `${key}-x`),
  y: number(data, `${key}-y`),
  z: number(data, `${key}-z`),
});
const ids = (data: FormData, key: string) => [
  ...new Set(
    str(data, key)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
const idFormat = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
const terminalFormat = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;

export function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
      <span>{name}</span>
      {children}
    </label>
  );
}

function VectorFields({
  name,
  field,
  value,
  min = -10_000,
  max = 10_000,
}: {
  name: string;
  field: string;
  value: Vector;
  min?: number;
  max?: number;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{name}</legend>
      <div className="grid grid-cols-3 gap-1">
        {axes.map((axis) => (
          <Field key={axis} name={axis.toUpperCase()}>
            <input
              className={control + " w-full"}
              required
              type="number"
              name={`${field}-${axis}`}
              aria-label={`${name} ${axis.toUpperCase()}`}
              min={min}
              max={max}
              step="any"
              defaultValue={Number(value[axis].toFixed(6))}
            />
          </Field>
        ))}
      </div>
    </fieldset>
  );
}

export function OccurrenceInspector({
  item,
  stationPath,
  site,
  origin: floorOrigin,
  onApply,
  onRemove,
  onState,
}: {
  item: VisualRecord;
  stationPath: string;
  site: string;
  origin: Vector;
  onApply: (record: Occurrence) => void;
  onRemove: () => void;
  onState: (change: Partial<Pick<Occurrence, "locked" | "hidden">>) => void;
}) {
  const [error, setError] = useState("");
  const { record, template } = item;
  const size = record.sizeOverride ?? template.size;
  const canResize = template.allowDimensionOverride && !template.artifactId;
  const terminal = template.kind === "terminal" || template.kind === "hmi";
  const world = add(record.position, floorOrigin);
  function save(event: FormEvent<HTMLFormElement>) {
    const data = submitted(event);
    const list = ids(data, "steps");
    const assetId = str(data, "asset-id");
    const assetSystem = str(data, "asset-system");
    const terminalId = str(data, "terminal");
    const authoringAppId = str(data, "authoring-app");
    const distance = str(data, "clearance-space");
    const reference = str(data, "clearance-rule");
    if (
      list.some((id) => !idFormat.test(id)) ||
      (assetId && !idFormat.test(assetId)) ||
      [terminalId, authoringAppId].some((id) => id && !terminalFormat.test(id))
    ) {
      setError(
        "Enter valid identifiers. Terminal and application IDs accept letters, digits, periods, dashes, or underscores.",
      );
      return;
    }
    if (!!assetId !== !!assetSystem || !!distance !== !!reference) {
      setError(
        "Enter the complete asset reference and clearance rule, or clear both fields for each.",
      );
      return;
    }
    try {
      const next: Occurrence = {
        ...record,
        label: str(data, "label") || record.label,
        layer: str(data, "layer") || record.layer,
        position: triple(data, "position"),
        rotation: triple(data, "rotation"),
        clearance: distance ? { distance: Number(distance), ruleReference: reference } : null,
        asset: assetId
          ? { id: assetId, system: assetSystem, exclusive: data.get("exclusive") === "on" }
          : null,
        notes: str(data, "notes"),
        documents: ids(data, "documents"),
        processStepIds: list,
        terminalId: terminalId || null,
        authoringAppId: authoringAppId || null,
      };
      const nextSize = canResize ? triple(data, "size") : size;
      onApply(
        canResize && axes.some((axis) => nextSize[axis] !== size[axis])
          ? changeSizes(next, template, nextSize)
          : next,
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Placement could not be updated.");
    }
  }

  return (
    <div className={panel}>
      <h2 className="text-sm font-semibold">Placement</h2>
      <p className="mt-1 text-xs text-muted-foreground">{stationPath}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {template.label} · revision {template.revision} ·{" "}
        {template.provenance?.accuracy ?? "approximate"}
      </p>
      {template.provenance && (
        <p className="mt-1 text-xs text-muted-foreground">
          {template.provenance.manufacturer} · {template.provenance.documentReference}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          aria-pressed={record.locked}
          onClick={() => onState({ locked: !record.locked })}
        >
          {record.locked ? "Unlock" : "Lock"}
        </button>
        <button
          type="button"
          className={button}
          aria-pressed={record.hidden}
          onClick={() => onState({ hidden: !record.hidden })}
        >
          {record.hidden ? "Show" : "Hide"}
        </button>
      </div>
      <form onSubmit={save} className="mt-3 space-y-3">
        <fieldset disabled={record.locked} className="space-y-3">
          <Field name="Occurrence name">
            <input
              name="label"
              className={control}
              required
              defaultValue={record.label}
              maxLength={180}
            />
          </Field>
          <VectorFields field="position" name="Floor position (m)" value={record.position} />
          <p className="text-xs text-muted-foreground">
            Site position {world.x.toFixed(3)}, {world.y.toFixed(3)}, {world.z.toFixed(3)} m
          </p>
          <VectorFields
            field="rotation"
            name="Rotation (° XYZ)"
            value={record.rotation}
            min={-360}
            max={360}
          />
          {canResize ? (
            <VectorFields field="size" name="Dimensions (m)" value={size} min={0.001} max={2000} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Model dimensions {size.x.toFixed(3)} × {size.y.toFixed(3)} × {size.z.toFixed(3)} m
            </p>
          )}
          <Field name="Layer">
            <input
              name="layer"
              className={control}
              required
              maxLength={180}
              defaultValue={record.layer}
            />
          </Field>
          <details className="rounded border border-border p-2">
            <summary className="cursor-pointer text-sm font-medium">Process and hardware</summary>
            <div className="mt-2 space-y-2">
              <Field name="Process step IDs, comma separated">
                <input
                  name="steps"
                  className={control}
                  defaultValue={record.processStepIds.join(", ")}
                />
              </Field>
              <Field name="Physical asset system">
                <input
                  name="asset-system"
                  className={control}
                  defaultValue={record.asset?.system}
                  maxLength={180}
                />
              </Field>
              <Field name="Physical asset ID">
                <input
                  name="asset-id"
                  className={control}
                  defaultValue={record.asset?.id}
                  maxLength={96}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="exclusive"
                  type="checkbox"
                  defaultChecked={record.asset?.exclusive ?? true}
                />{" "}
                Exclusive equipment
              </label>
              {terminal && (
                <>
                  <Field name="Terminal engineering ID">
                    <input
                      name="terminal"
                      className={control}
                      defaultValue={record.terminalId ?? ""}
                      maxLength={96}
                    />
                  </Field>
                  <Field name="Authoring application ID">
                    <input
                      name="authoring-app"
                      className={control}
                      defaultValue={record.authoringAppId ?? ""}
                      maxLength={96}
                    />
                  </Field>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Deployment and state are resolved by runtime services.
              </p>
            </div>
          </details>
          <details className="rounded border border-border p-2">
            <summary className="cursor-pointer text-sm font-medium">
              Clearance and documentation
            </summary>
            <div className="mt-2 space-y-2">
              <Field name="Clearance envelope (m)">
                <input
                  name="clearance-space"
                  className={control}
                  type="number"
                  min={0.001}
                  max={1000}
                  step="any"
                  defaultValue={record.clearance?.distance}
                />
              </Field>
              <Field name="Approved rule reference">
                <input
                  name="clearance-rule"
                  className={control}
                  defaultValue={record.clearance?.ruleReference}
                  maxLength={180}
                />
              </Field>
              <Field name="Document references, comma separated">
                <input
                  name="documents"
                  className={control}
                  defaultValue={record.documents.join(", ")}
                />
              </Field>
              <Field name="Placement notes">
                <textarea
                  name="notes"
                  className={control + " min-h-16 py-2"}
                  defaultValue={record.notes}
                  maxLength={1024}
                />
              </Field>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button className={primary} type="submit">
              Apply properties
            </button>
            <button className={button} type="button" onClick={onRemove}>
              Remove
            </button>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      {terminal && (
        <TerminalContext
          site={site}
          terminalId={record.terminalId}
          appId={record.authoringAppId}
          kind={template.kind === "hmi" ? "hmi" : "operator"}
        />
      )}
    </div>
  );
}

export function TerminalContext({
  site,
  terminalId,
  appId,
  kind,
}: {
  site: string;
  terminalId: string | null;
  appId: string | null;
  kind: "operator" | "hmi";
}) {
  const [resolved, setResolved] = useState<Awaited<ReturnType<typeof resolveFactoryAssignment>>>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!terminalId) return;
    let active = true;
    setFailed(false);
    setResolved(undefined);
    void resolveFactoryAssignment({ data: { site, terminalId, kind } })
      .then((answer) => {
        if (active) setResolved(answer);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [site, terminalId, kind]);

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <h3 className="text-sm font-semibold">Terminal context</h3>
      {terminalId ? (
        <p className="break-all text-xs text-muted-foreground">{terminalId}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Set a terminal ID to resolve its assignment.
        </p>
      )}
      {terminalId && (
        <div role="status" className="space-y-1 text-xs text-muted-foreground">
          {resolved?.status === "resolved" ? (
            <>
              <p>
                Target {resolved.target.nodeId} · {resolved.target.provenance}
              </p>
              <p className="break-all">Release {resolved.assignment.releaseId}</p>
              <p className="break-all">Digest {resolved.assignment.releaseDigest}</p>
              <p>Configuration {resolved.assignment.configRevision}</p>
              <p>Active device version requires device readback.</p>
            </>
          ) : resolved ? (
            <p className="capitalize">
              {resolved.status} · {resolved.issues.join(" · ")}
            </p>
          ) : (
            <p>{failed ? "Assignment resolution unavailable." : "Resolving assignment…"}</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          className={button}
          to="/application-studio"
          search={{
            site,
            kind,
            ...(terminalId ? { terminal: terminalId } : {}),
            ...(appId ? { app: appId, view: "preview" } : {}),
          }}
        >
          {appId ? "Open application preview" : "Open Application Studio"}
        </Link>
        {terminalId && (
          <Link
            className={button}
            to="/factory-assignment"
            search={{ site, terminal: terminalId, kind, node: undefined }}
          >
            View assignment
          </Link>
        )}
      </div>
    </div>
  );
}

export function FloorControls({
  floor,
  onChange,
}: {
  floor: NonNullable<SpaceNode["floor"]>;
  onChange: (floor: NonNullable<SpaceNode["floor"]>) => void;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const reference = floor.reference;
  async function loadReference(event: FormEvent<HTMLFormElement>) {
    const data = submitted(event);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) {
      setStatus("Choose a floor-plan file.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await readArtifactFile(file);
      const image = readFloorDimensions(bytes);
      const next: FloorReference = floorReferenceSchema.parse({
        ...image,
        filename: file.name,
        source: str(data, "source"),
        sha256: await digestArtifact(bytes),
        bytes: bytes.length,
        base64: encodeArtifact(bytes),
        x: number(data, "x"),
        z: number(data, "z"),
        width: number(data, "width"),
        depth: number(data, "depth"),
        accuracy: data.get("verified") === "on" ? "verified" : "approximate",
      });
      onChange({ ...floor, reference: next });
      setStatus("Floor reference calibrated.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Floor reference could not be imported.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={panel}>
      <summary className="cursor-pointer text-sm font-semibold">
        Floor dimensions and reference
      </summary>
      <form
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          const data = submitted(event);
          onChange({ ...floor, size: triple(data, "bounds"), origin: triple(data, "origin") });
        }}
      >
        <VectorFields
          name="Floor extent (m)"
          field="bounds"
          value={floor.size}
          min={0.001}
          max={2_000}
        />
        <VectorFields name="Site anchor (m)" field="origin" value={floor.origin} />
        <button className={button} type="submit">
          Apply floor dimensions
        </button>
      </form>
      {reference && (
        <p className="mt-3 text-xs text-muted-foreground">
          {reference.filename} · {reference.width} × {reference.depth} m · {reference.accuracy}
        </p>
      )}
      <form
        className="mt-3 grid gap-2 border-t border-border pt-3"
        onSubmit={(event) => {
          void loadReference(event);
        }}
      >
        <Field name="Floor plan (PNG or JPEG)">
          <input
            name="file"
            type="file"
            className={control + " py-1.5"}
            accept="image/png,image/jpeg"
            required
          />
        </Field>
        <Field name="Source document">
          <input
            name="source"
            className={control}
            defaultValue={reference?.source}
            required
            maxLength={180}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field name="Plan width (m)">
            <input
              name="width"
              type="number"
              className={control + " w-full"}
              min={0.001}
              max={2000}
              step="any"
              required
              defaultValue={reference?.width ?? floor.size.x}
            />
          </Field>
          <Field name="Plan depth (m)">
            <input
              name="depth"
              type="number"
              className={control + " w-full"}
              min={0.001}
              max={2000}
              step="any"
              required
              defaultValue={reference?.depth ?? floor.size.z}
            />
          </Field>
          <Field name="Left anchor X (m)">
            <input
              name="x"
              type="number"
              className={control + " w-full"}
              min={-10000}
              max={10000}
              step="any"
              required
              defaultValue={reference?.x ?? 0}
            />
          </Field>
          <Field name="Top anchor Z (m)">
            <input
              name="z"
              type="number"
              className={control + " w-full"}
              min={-10000}
              max={10000}
              step="any"
              required
              defaultValue={reference?.z ?? 0}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="verified" type="checkbox" /> Calibrated against verified dimensions
        </label>
        <div className="flex flex-wrap gap-2">
          <button className={button} type="submit" disabled={busy}>
            {busy ? "Reading plan…" : "Import and calibrate"}
          </button>
          {reference && (
            <button
              className={button}
              type="button"
              onClick={() => onChange({ ...floor, reference: null })}
            >
              Remove reference
            </button>
          )}
        </div>
        {status && (
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
        )}
      </form>
    </details>
  );
}

type Endpoint = { record: Occurrence; port: Port; template: CatalogTemplate };
export function ConnectionEditor({
  document,
  records,
  links,
  apply,
  select,
}: {
  document: SpatialDocument;
  records: VisualRecord[];
  links: Connection[];
  apply: (edit: DraftEdit) => void;
  select: (id: string, multi: boolean) => void;
}) {
  const endpoints = useMemo(
    () =>
      new Map(
        records.flatMap(({ record, template }) =>
          template.ports.map((port): [string, Endpoint] => [
            JSON.stringify([record.id, port.id]),
            { record, port, template },
          ]),
        ),
      ),
    [records],
  );
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const from = endpoints.get(source);
  const eligible = [...endpoints.entries()].filter(
    ([, endpoint]) =>
      from && from.record.id !== endpoint.record.id && compatiblePorts(from.port, endpoint.port),
  );
  const byId = new Map(records.map(({ record, template }) => [record.id, { record, template }]));

  function addLink(snap: boolean) {
    const to = eligible.find(([key]) => key === target)?.[1];
    if (!from || !to) return;
    const link: Connection = {
      id: crypto.randomUUID(),
      kind: from.port.kind,
      from: { occurrenceId: from.record.id, portId: from.port.id },
      to: { occurrenceId: to.record.id, portId: to.port.id },
    };
    if (
      links.some(
        (item) =>
          item.from.occurrenceId === link.from.occurrenceId &&
          item.from.portId === link.from.portId &&
          item.to.occurrenceId === link.to.occurrenceId &&
          item.to.portId === link.to.portId,
      )
    ) {
      setMessage("These ports are already connected.");
      return;
    }
    apply((previous) => ({
      ...previous,
      connections: [...previous.connections, link],
      occurrences: snap ? snapToPort(previous, link) : previous.occurrences,
    }));
    setMessage("Connection recorded.");
  }

  return (
    <details className={panel}>
      <summary className="cursor-pointer text-sm font-semibold">
        Connections · {links.length}
      </summary>
      <div className="mt-3 space-y-2">
        {links.map((link) => {
          const a = byId.get(link.from.occurrenceId),
            b = byId.get(link.to.occurrenceId);
          const aPort = a?.template.ports.find((port) => port.id === link.from.portId);
          const bPort = b?.template.ports.find((port) => port.id === link.to.portId);
          if (!a || !b || !aPort || !bPort) return null;
          const start = portPosition(a.record, a.template, aPort);
          const end = portPosition(b.record, b.template, bPort);
          const gap = Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z);
          return (
            <div
              key={link.id}
              className="flex flex-wrap items-center gap-2 rounded border border-border p-2 text-xs"
            >
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => select(a.record.id, false)}
              >
                {a.record.label}
              </button>
              <span>→</span>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => select(b.record.id, false)}
              >
                {b.record.label}
              </button>
              <span className="text-muted-foreground">
                {link.kind} · {gap.toFixed(3)} m
              </span>
              <button
                type="button"
                className={button}
                aria-label={`Remove ${a.record.label} to ${b.record.label} connection`}
                onClick={() =>
                  apply((previous) => ({
                    ...previous,
                    connections: previous.connections.filter((item) => item.id !== link.id),
                  }))
                }
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field name="Sending port">
          <select
            className={control}
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setTarget("");
            }}
          >
            <option value="">Choose output</option>
            {[...endpoints.entries()]
              .filter(([, item]) => item.port.direction !== "input")
              .map(([key, item]) => (
                <option key={key} value={key}>
                  {item.record.label} · {item.port.label} · {item.port.kind}
                </option>
              ))}
          </select>
        </Field>
        <Field name="Receiving port">
          <select
            className={control}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={!source}
          >
            <option value="">Choose compatible input</option>
            {eligible.map(([key, item]) => (
              <option key={key} value={key}>
                {item.record.label} · {item.port.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={button}
          type="button"
          disabled={!source || !target}
          onClick={() => addLink(false)}
        >
          Connect
        </button>
        <button
          className={button}
          type="button"
          disabled={!source || !target || from?.record.locked}
          onClick={() => addLink(true)}
        >
          Snap sender and connect
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {!!document.connections.length && !links.length && (
        <p className="mt-2 text-sm text-muted-foreground">This floor has no connections.</p>
      )}
    </details>
  );
}

export function TemplateEditor({
  selected,
  document,
  apply,
}: {
  selected: CatalogTemplate | undefined;
  document: SpatialDocument;
  apply: (edit: DraftEdit) => void;
}) {
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const base = existing ? selected : undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    const data = submitted(event);
    setBusy(true);
    try {
      const file = data.get("model");
      const artifact =
        file instanceof File && file.size
          ? await (
              await import("@/lib/spatial/model-asset")
            ).inspectModelFile(
              file,
              str(data, "units") as "m" | "mm",
              str(data, "source"),
              str(data, "license"),
            )
          : undefined;
      const latest = base
        ? Math.max(
            ...document.catalog.filter((item) => item.id === base.id).map((item) => item.revision),
          )
        : 0;
      const portLabel = str(data, "port-label"),
        portInterface = str(data, "port-interface");
      if (!!portLabel !== !!portInterface)
        throw new Error("A port requires a label and an interface designation.");
      const ports: Port[] = !portLabel
        ? []
        : [
            {
              id: crypto.randomUUID(),
              label: portLabel,
              interface: portInterface,
              kind: str(data, "port-kind") as Port["kind"],
              direction: str(data, "direction") as Port["direction"],
              position: triple(data, "port"),
            },
          ];
      const partLabel = str(data, "part");
      const item: CatalogTemplate = {
        id: base?.id ?? crypto.randomUUID(),
        revision: latest + 1,
        label: str(data, "label"),
        kind: str(data, "kind") as CatalogTemplate["kind"],
        size: artifact?.size ?? (base?.artifactId ? base.size : triple(data, "size")),
        artifactId: artifact?.id ?? base?.artifactId ?? null,
        allowDimensionOverride: !artifact && !base?.artifactId && data.get("resizable") === "on",
        capabilities: ids(data, "capabilities"),
        provenance:
          str(data, "manufacturer") && str(data, "document")
            ? {
                manufacturer: str(data, "manufacturer"),
                documentReference: str(data, "document"),
                accuracy: str(data, "accuracy") as "approximate" | "supplier-declared" | "verified",
              }
            : null,
        ports: [...(base?.ports ?? []), ...ports],
        subcomponents: [
          ...(base?.subcomponents ?? []),
          ...(partLabel
            ? [
                {
                  id: crypto.randomUUID(),
                  label: partLabel,
                  position: triple(data, "part-position"),
                  size: triple(data, "part-size"),
                  rotation: { ...origin },
                  explodeOffset: triple(data, "part-offset"),
                },
              ]
            : []),
        ],
      };
      apply((previous) => ({
        ...previous,
        catalog: [...previous.catalog, item],
        artifacts: artifact ? [...previous.artifacts, artifact] : previous.artifacts,
      }));
      setMessage(
        `${item.label}, revision ${item.revision}, added to the component library. Existing placements keep their current version.`,
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The template could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className={panel}>
      <summary className="cursor-pointer text-sm font-semibold">
        Custom template and model import
      </summary>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={existing}
          onChange={(event) => setExisting(event.target.checked)}
          disabled={!selected}
        />{" "}
        Revise selected template
      </label>
      <form
        key={base ? templateKey(base) : "new"}
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <Field name="Template name">
          <input
            name="label"
            className={control}
            defaultValue={base?.label}
            required
            maxLength={180}
          />
        </Field>
        <Field name="Equipment kind">
          <select name="kind" className={control} defaultValue={base?.kind ?? "machine"}>
            {equipmentKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </Field>
        <VectorFields
          name="Procedural dimensions (m)"
          field="size"
          value={base?.size ?? { x: 1, y: 1, z: 1 }}
          min={0.001}
          max={2000}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            name="resizable"
            type="checkbox"
            defaultChecked={base?.allowDimensionOverride ?? false}
          />{" "}
          Allow procedural occurrence resizing
        </label>
        <Field name="Capabilities, comma separated">
          <input
            name="capabilities"
            className={control}
            defaultValue={base?.capabilities.join(", ")}
          />
        </Field>
        <details className="rounded border border-border p-2">
          <summary className="cursor-pointer text-sm font-medium">
            Supplier and source geometry
          </summary>
          <div className="mt-2 space-y-2">
            <Field name="Manufacturer">
              <input
                name="manufacturer"
                className={control}
                maxLength={180}
                defaultValue={base?.provenance?.manufacturer}
              />
            </Field>
            <Field name="Supplier document reference">
              <input
                name="document"
                className={control}
                maxLength={180}
                defaultValue={base?.provenance?.documentReference}
              />
            </Field>
            <Field name="Dimension accuracy">
              <select
                name="accuracy"
                className={control}
                defaultValue={base?.provenance?.accuracy ?? "approximate"}
              >
                <option value="approximate">Approximate</option>
                <option value="supplier-declared">Supplier declared</option>
                <option value="verified">Verified</option>
              </select>
            </Field>
            <Field name="Self-contained glTF or GLB">
              <input name="model" type="file" className={control + " py-1.5"} accept=".glb,.gltf" />
            </Field>
            <Field name="Source model units">
              <select name="units" className={control}>
                {importUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="Model source reference">
              <input name="source" className={control} maxLength={180} />
            </Field>
            <Field name="Model license">
              <input name="license" className={control} maxLength={180} />
            </Field>
          </div>
        </details>
        <details className="rounded border border-border p-2">
          <summary className="cursor-pointer text-sm font-medium">
            Add a typed connection port
          </summary>
          <div className="mt-2 space-y-2">
            <Field name="Port label">
              <input name="port-label" className={control} maxLength={180} />
            </Field>
            <Field name="Interface designation">
              <input name="port-interface" className={control} maxLength={180} />
            </Field>
            <Field name="Port medium">
              <select name="port-kind" className={control}>
                {connectionKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="Port direction">
              <select name="direction" className={control}>
                <option value="input">Input</option>
                <option value="output">Output</option>
                <option value="bidirectional">Bidirectional</option>
              </select>
            </Field>
            <VectorFields name="Port anchor (m)" field="port" value={origin} />
          </div>
        </details>
        <details className="rounded border border-border p-2">
          <summary className="cursor-pointer text-sm font-medium">
            Add an assembly component
          </summary>
          <div className="mt-2 space-y-2">
            <Field name="Component label">
              <input name="part" className={control} maxLength={180} />
            </Field>
            <VectorFields name="Component location (m)" field="part-position" value={origin} />
            <VectorFields
              name="Component envelope (m)"
              field="part-size"
              value={{ x: 0.4, y: 0.4, z: 0.4 }}
              min={0.001}
              max={2000}
            />
            <VectorFields
              name="Exploded offset (m)"
              field="part-offset"
              value={{ x: 0.7, y: 0.5, z: 0.4 }}
            />
          </div>
        </details>
        <button className={button} type="submit" disabled={busy}>
          {busy ? "Checking geometry…" : "Create template revision"}
        </button>
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
