import { sameValue } from "./draft";
import {
  add,
  childKind,
  compatiblePorts,
  floorOf,
  portPosition,
  rotate,
  subtract,
  templateKey,
  type CatalogTemplate,
  type Connection,
  type Occurrence,
  type SpatialDocument,
  type Vector,
} from "./model";

export type SpatialIssue = {
  rule: string;
  severity: "error" | "warning";
  ids: string[];
  toleranceM: number | null;
  message: string;
  guidance: string;
};

const epsilon = 0.001;
type Bounds = { min: Vector; max: Vector };
const axes = ["x", "y", "z"] as const;

export function occurrenceBounds(
  record: Occurrence,
  template: CatalogTemplate,
  margin = 0,
): Bounds {
  const size = record.sizeOverride ?? template.size;
  if (record.rotation.x === 0 && record.rotation.y === 0 && record.rotation.z === 0) {
    const { x, y, z } = record.position;
    return {
      min: { x: x - size.x / 2 - margin, y: y - margin, z: z - size.z / 2 - margin },
      max: { x: x + size.x / 2 + margin, y: y + size.y + margin, z: z + size.z / 2 + margin },
    };
  }
  const local = [-1, 1].flatMap((x) =>
    [0, 1].flatMap((y) =>
      [-1, 1].map((z) =>
        add(
          record.position,
          rotate({ x: (x * size.x) / 2, y: y * size.y, z: (z * size.z) / 2 }, record.rotation),
        ),
      ),
    ),
  );
  return {
    min: {
      x: Math.min(...local.map((point) => point.x)) - margin,
      y: Math.min(...local.map((point) => point.y)) - margin,
      z: Math.min(...local.map((point) => point.z)) - margin,
    },
    max: {
      x: Math.max(...local.map((point) => point.x)) + margin,
      y: Math.max(...local.map((point) => point.y)) + margin,
      z: Math.max(...local.map((point) => point.z)) + margin,
    },
  };
}

const intersects = (a: Bounds, b: Bounds) =>
  axes.every(
    (axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > epsilon,
  );

export function validateSpatialRelationships(document: SpatialDocument): SpatialIssue[] {
  const issues: SpatialIssue[] = [];
  const error = (rule: string, ids: string[], message: string, guidance: string) =>
    issues.push({ rule: `${rule}@1`, severity: "error", ids, message, guidance, toleranceM: null });
  const unique = (values: string[], label: string, id?: string) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value))
        error(
          "duplicate-id",
          [id ?? value],
          `Duplicate ${label} ${value}`,
          "Assign a distinct stable identifier.",
        );
      seen.add(value);
    }
  };
  const spaces = new Map(document.spaces.map((node) => [node.id, node]));
  const templates = new Map(document.catalog.map((item) => [templateKey(item), item]));
  const artifacts = new Map(document.artifacts.map((item) => [item.id, item]));
  const occurrences = new Map(document.occurrences.map((item) => [item.id, item]));
  unique(
    document.spaces.map((node) => node.id),
    "space",
  );
  unique(document.catalog.map(templateKey), "template version");
  unique(
    document.occurrences.map((record) => record.id),
    "occurrence",
  );
  unique(
    document.connections.map((record) => record.id),
    "connection",
  );
  unique(
    document.artifacts.map((artifact) => artifact.id),
    "artifact",
  );
  unique(
    document.cameras.map((camera) => camera.id),
    "saved view",
  );
  unique(
    document.occurrences.flatMap((record) => (record.terminalId ? [record.terminalId] : [])),
    "terminal identity",
  );

  if (
    document.spaces.filter((node) => node.kind === "organization" && !node.parentId).length !== 1 ||
    document.spaces.filter((node) => node.kind === "site").length !== 1
  ) {
    error(
      "site-root",
      [],
      "A workspace must belong to one organization root and exactly one site",
      "Correct the site hierarchy.",
    );
  }

  const linkedSpaceIds = new Map<string, string>();
  for (const node of document.spaces) {
    if (node.engineeringId) {
      const key = node.kind + "/" + node.engineeringId;
      const prior = linkedSpaceIds.get(key);
      if (prior)
        error(
          "engineering-placement",
          [prior, node.id],
          `Engineering ${node.kind} ${node.engineeringId} has multiple locations`,
          "Keep one location for this engineering record.",
        );
      linkedSpaceIds.set(key, node.id);
    }
    if (node.engineeringId && node.kind !== "line" && node.kind !== "station")
      error(
        "engineering-link-kind",
        [node.id],
        "Only lines and stations can reference engineering definitions",
        "Clear the engineering link.",
      );
    const parent = node.parentId ? spaces.get(node.parentId) : undefined;
    const b = node.boundary;
    if (
      b &&
      (node.kind !== "area" ||
        !parent?.floor ||
        b.x < 0 ||
        b.z < 0 ||
        b.x + b.width > parent.floor.size.x + epsilon ||
        b.z + b.depth > parent.floor.size.z + epsilon)
    )
      error(
        "section-boundary",
        [node.id],
        "A section footprint must fit inside its parent floor",
        "Adjust the section position, footprint or floor dimensions.",
      );
    if (
      (node.kind === "organization"
        ? !!node.parentId
        : !parent || childKind[parent.kind] !== node.kind) ||
      (node.kind === "floor") !== !!node.floor
    ) {
      error(
        "space-containment",
        [node.id],
        `${node.label} has an invalid parent or floor configuration`,
        "Use the hierarchy parent required by its space type.",
      );
    }
  }

  for (const template of document.catalog) {
    unique(
      template.ports.map((port) => port.id),
      "port",
      template.id,
    );
    unique(
      template.subcomponents.map((part) => part.id),
      "assembly component",
      template.id,
    );
    const artifact = template.artifactId ? artifacts.get(template.artifactId) : undefined;
    if (
      template.artifactId &&
      (!artifact ||
        template.allowDimensionOverride ||
        axes.some((axis) => Math.abs(template.size[axis] - artifact.size[axis]) > epsilon))
    ) {
      error(
        "template-artifact",
        [template.id],
        `${template.label} has incompatible model dimensions or scaling`,
        "Use the imported bounds and lock dimensional overrides.",
      );
    }
  }

  const assets = new Map<string, Occurrence[]>();
  const groups = new Map<string, string>();
  for (const record of document.occurrences) {
    const template = templates.get(
      templateKey({ id: record.templateId, revision: record.templateRevision }),
    );
    const floor = floorOf(spaces, record.stationId);
    if (
      spaces.get(record.stationId)?.kind !== "station" ||
      !floor?.floor ||
      !template ||
      (record.sizeOverride && (!template.allowDimensionOverride || template.artifactId)) ||
      ((record.terminalId || record.authoringAppId) &&
        template.kind !== "terminal" &&
        template.kind !== "hmi")
    ) {
      error(
        "occurrence-reference",
        [record.id],
        `${record.label} has an invalid station, template version, override, or terminal link`,
        "Correct the placement or equipment references.",
      );
    }
    if (record.group && floor) {
      const existing = groups.get(record.group);
      if (existing && existing !== floor.id)
        error(
          "group-scope",
          [record.id],
          "A placement group spans multiple floors",
          "Group occurrences within one floor.",
        );
      groups.set(record.group, floor.id);
    }
    if (record.asset) {
      const kinds =
        record.asset.system === "EMS"
          ? record.asset.kind
            ? [record.asset.kind]
            : ["equipment", "terminal"]
          : [""];
      for (const kind of kinds) {
        const key = JSON.stringify([record.asset.system, record.asset.id, kind]);
        const bucket = assets.get(key) ?? [];
        bucket.push(record);
        assets.set(key, bucket);
      }
    }
  }
  for (const records of assets.values()) {
    if (records.length > 1 && records.some((record) => record.asset?.exclusive)) {
      error(
        "exclusive-asset",
        records.map((record) => record.id),
        "An exclusive physical asset has multiple placements in this site",
        "Use a distinct asset reference or correct its exclusivity.",
      );
    }
  }

  const endpoint = (end: Connection["from"]) => {
    const record = occurrences.get(end.occurrenceId);
    const template = record
      ? templates.get(templateKey({ id: record.templateId, revision: record.templateRevision }))
      : undefined;
    const port = template?.ports.find((entry) => entry.id === end.portId);
    return record && template && port
      ? { record, template, port, floor: floorOf(spaces, record.stationId) }
      : undefined;
  };
  const pairs = new Set<string>();
  for (const link of document.connections) {
    const from = endpoint(link.from),
      to = endpoint(link.to);
    const key = JSON.stringify([
      link.from.occurrenceId,
      link.from.portId,
      link.to.occurrenceId,
      link.to.portId,
    ]);
    if (
      !from ||
      !to ||
      !from.floor ||
      from.floor.id !== to.floor?.id ||
      from.record.id === to.record.id ||
      link.kind !== from.port.kind ||
      !compatiblePorts(from.port, to.port) ||
      pairs.has(key)
    ) {
      error(
        "connection-endpoint",
        [link.from.occurrenceId, link.to.occurrenceId],
        "Invalid, incompatible, or repeated connection",
        "Choose matching interfaces and directions on two occurrences on this floor.",
      );
    }
    pairs.add(key);
  }

  for (const camera of document.cameras) {
    if (
      spaces.get(camera.floorId)?.kind !== "floor" ||
      axes.every((axis) => camera.position[axis] === camera.target[axis])
    ) {
      error(
        "camera-preset",
        [camera.floorId],
        "Saved view has an invalid floor or direction",
        "Save a valid view on its floor.",
      );
    }
  }
  return issues;
}

export function validateSpatialGeometry(document: SpatialDocument): SpatialIssue[] {
  const issues: SpatialIssue[] = [];
  const warn = (rule: string, ids: string[], message: string, guidance: string) =>
    issues.push({
      rule: `${rule}@1`,
      severity: "warning",
      ids,
      message,
      guidance,
      toleranceM: epsilon,
    });
  const spaces = new Map(document.spaces.map((node) => [node.id, node]));
  const templates = new Map(document.catalog.map((item) => [templateKey(item), item]));
  const records = new Map(document.occurrences.map((item) => [item.id, item]));
  const byFloor = new Map<string, { record: Occurrence; bounds: Bounds; clearance: Bounds }[]>();
  for (const record of document.occurrences) {
    const template = templates.get(
      templateKey({ id: record.templateId, revision: record.templateRevision }),
    );
    const floor = floorOf(spaces, record.stationId);
    if (!template || !floor?.floor) continue;
    const bounds = occurrenceBounds(record, template);
    const size = floor.floor.size;
    if (
      bounds.min.x < -epsilon ||
      bounds.min.y < -epsilon ||
      bounds.min.z < -epsilon ||
      bounds.max.x > size.x + epsilon ||
      bounds.max.y > size.y + epsilon ||
      bounds.max.z > size.z + epsilon
    ) {
      warn(
        "floor-envelope",
        [record.id],
        `${record.label} crosses the floor envelope`,
        "Review its location, rotation, floor dimensions and the equipment envelope.",
      );
    }
    const clearance = occurrenceBounds(record, template, record.clearance?.distance ?? 0);
    const entries = byFloor.get(floor.id) ?? [];
    entries.push({ record, bounds, clearance });
    byFloor.set(floor.id, entries);
  }

  for (const entries of byFloor.values()) {
    entries.sort((left, right) => left.clearance.min.x - right.clearance.min.x);
    for (const [i, left] of entries.entries()) {
      for (let j = i + 1; j < entries.length; j++) {
        const right = entries[j];
        if (!right || right.clearance.min.x >= left.clearance.max.x - epsilon) break;
        if (intersects(left.bounds, right.bounds)) {
          warn(
            "overlapping-envelope",
            [left.record.id, right.record.id],
            `${left.record.label} and ${right.record.label} have overlapping envelopes`,
            "Review the exact geometry or adjust placement.",
          );
        } else if (
          intersects(left.clearance, right.bounds) ||
          intersects(left.bounds, right.clearance)
        ) {
          warn(
            "configured-clearance",
            [left.record.id, right.record.id],
            `${left.record.label} and ${right.record.label} intersect a configured clearance`,
            "Review the referenced clearance rule and relocate or reconfigure the equipment.",
          );
        }
        if (issues.length >= 500) return issues;
      }
    }
  }

  for (const link of document.connections) {
    if (link.kind !== "material") continue;
    const left = records.get(link.from.occurrenceId),
      right = records.get(link.to.occurrenceId);
    if (!left || !right) continue;
    const lt = templates.get(templateKey({ id: left.templateId, revision: left.templateRevision }));
    const rt = templates.get(
      templateKey({ id: right.templateId, revision: right.templateRevision }),
    );
    const lp = lt?.ports.find((item) => item.id === link.from.portId);
    const rp = rt?.ports.find((item) => item.id === link.to.portId);
    if (!lt || !rt || !lp || !rp) continue;
    const distance = subtract(portPosition(left, lt, lp), portPosition(right, rt, rp));
    if (Math.hypot(distance.x, distance.y, distance.z) > epsilon) {
      warn(
        "material-port-gap",
        [left.id, right.id],
        `Material connection has a ${Math.hypot(distance.x, distance.y, distance.z).toFixed(3)} m port gap`,
        "Review the route or snap the sending port to its receiver.",
      );
    }
  }
  return issues;
}

export type OccurrenceChange = {
  id: string;
  label: string;
  kinds: ("added" | "removed" | "moved" | "replaced" | "reconfigured")[];
};

export function comparePlacements(
  draft: SpatialDocument,
  prior: SpatialDocument,
): OccurrenceChange[] {
  const baseline = new Map(prior.occurrences.map((item) => [item.id, item]));
  const changes: OccurrenceChange[] = [];
  for (const record of draft.occurrences) {
    const previous = baseline.get(record.id);
    if (!previous) {
      changes.push({ id: record.id, label: record.label, kinds: ["added"] });
      continue;
    }
    baseline.delete(record.id);
    const { position, rotation, stationId, templateId, templateRevision, asset, ...configuration } =
      record;
    const {
      position: beforePosition,
      rotation: beforeRotation,
      stationId: beforeStation,
      templateId: beforeTemplate,
      templateRevision: beforeVersion,
      asset: beforeAsset,
      ...beforeConfig
    } = previous;
    const changed = (left: unknown, right: unknown) => !sameValue(left, right);
    const kinds: OccurrenceChange["kinds"] = [];
    if (
      changed(position, beforePosition) ||
      changed(rotation, beforeRotation) ||
      stationId !== beforeStation
    )
      kinds.push("moved");
    if (
      templateId !== beforeTemplate ||
      templateRevision !== beforeVersion ||
      changed(asset, beforeAsset)
    )
      kinds.push("replaced");
    if (changed(configuration, beforeConfig)) kinds.push("reconfigured");
    if (kinds.length) changes.push({ id: record.id, label: record.label, kinds });
  }
  return [
    ...changes,
    ...Array.from(baseline.values(), (item): OccurrenceChange => ({
      id: item.id,
      label: item.label,
      kinds: ["removed"],
    })),
  ];
}
