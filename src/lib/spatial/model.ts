import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/);
const terminalKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/);
const text = z.string().trim().min(1).max(180);
const coordinate = z.number().finite().min(-10_000).max(10_000);
const dimension = z.number().finite().min(0.001).max(2_000);
const angle = z.number().finite().min(-360).max(360);
export const vectorSchema = z.object({ x: coordinate, y: coordinate, z: coordinate }).strict();
const dimensions = z.object({ x: dimension, y: dimension, z: dimension }).strict();
const optionalShape = dimensions.nullable();
export const rotationSchema = z.object({ x: angle, y: angle, z: angle }).strict();
export const connectionKinds = ["material", "power", "network", "air", "other"] as const;
export const equipmentKinds = [
  "machine",
  "robot",
  "conveyor",
  "buffer",
  "fixture",
  "tool",
  "sensor",
  "camera",
  "scanner",
  "scale",
  "printer",
  "plc",
  "cabinet",
  "gateway",
  "industrial-pc",
  "terminal",
  "hmi",
  "utility",
  "assembly",
  "edge-node",
] as const;
export const spaceKinds = [
  "organization",
  "site",
  "building",
  "floor",
  "area",
  "line",
  "station",
] as const;
export const childKind: Partial<Record<SpaceKind, SpaceKind>> = {
  organization: "site",
  site: "building",
  building: "floor",
  floor: "area",
  area: "line",
  line: "station",
};

const sourceInfo = z
  .object({
    manufacturer: text,
    documentReference: text,
    accuracy: z.enum(["approximate", "supplier-declared", "verified"]),
  })
  .strict();
const port = z
  .object({
    id,
    label: text,
    kind: z.enum(connectionKinds),
    direction: z.enum(["input", "output", "bidirectional"]),
    position: vectorSchema,
    interface: text,
  })
  .strict();
const subcomponent = z
  .object({
    id,
    label: text,
    position: vectorSchema,
    rotation: rotationSchema,
    size: dimensions,
    explodeOffset: vectorSchema,
  })
  .strict();

export const embeddedAssetLimit = 700_000;
export const embeddedEncodedLimit = 1_900_000;
export const importUnits = ["m", "mm"] as const;
const encoded = z
  .string()
  .min(4)
  .max(Math.ceil(embeddedAssetLimit / 3) * 4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const spatialArtifactSchema = z
  .object({
    id,
    filename: text,
    source: text,
    license: text,
    sha256,
    encoding: z.enum(["glb", "gltf"]),
    bytes: z.number().int().positive().max(embeddedAssetLimit),
    base64: encoded,
    units: z.enum(importUnits),
    frame: z.literal("right-handed-y-up"),
    converter: z.literal("three-glTF-bounds-v1"),
    min: vectorSchema,
    max: vectorSchema,
    size: dimensions,
  })
  .strict();

export const floorReferenceSchema = z
  .object({
    filename: text,
    source: text,
    sha256,
    base64: encoded,
    bytes: z.number().int().positive().max(embeddedAssetLimit),
    format: z.enum(["png", "jpeg"]),
    sourceWidth: z.number().int().min(1).max(3072),
    sourceHeight: z.number().int().min(1).max(3072),
    width: dimension,
    depth: dimension,
    x: coordinate,
    z: coordinate,
    accuracy: z.enum(["approximate", "verified"]),
  })
  .strict();

export const stationModels = [
  "commissioning-bench",
  "inspection-station",
  "production-cell",
  "storage-rack",
  "access-gate",
] as const;
export const catalogLimit = 500;
export const placementLimit = 2500;

const catalogTemplate = z
  .object({
    id,
    revision: z.number().int().positive(),
    label: text,
    kind: z.enum(equipmentKinds),
    stationModel: z.enum(stationModels).optional(),
    size: dimensions,
    allowDimensionOverride: z.boolean(),
    provenance: sourceInfo.nullable(),
    artifactId: id.nullable(),
    ports: z.array(port).max(32),
    subcomponents: z.array(subcomponent).max(24),
    capabilities: z.array(text).max(24),
  })
  .strict();

const space = z
  .object({
    id,
    label: text,
    kind: z.enum(spaceKinds),
    parentId: id.nullable(),
    engineeringId: z.string().trim().min(1).max(180).optional(),
    floor: z
      .object({
        origin: vectorSchema,
        size: dimensions,
        reference: floorReferenceSchema.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const occurrence = z
  .object({
    id,
    label: text,
    stationId: id,
    templateId: id,
    templateRevision: z.number().int().positive(),
    position: vectorSchema,
    rotation: rotationSchema,
    sizeOverride: optionalShape,
    clearance: z
      .object({
        distance: z.number().finite().positive().max(1_000),
        ruleReference: text,
      })
      .strict()
      .nullable(),
    layer: text,
    group: id.nullable(),
    locked: z.boolean(),
    hidden: z.boolean(),
    asset: z
      .object({
        system: text,
        id,
        kind: z.enum(["equipment", "terminal"]).optional(),
        exclusive: z.boolean(),
      })
      .strict()
      .nullable(),
    processStepIds: z.array(id).max(32),
    notes: z.string().max(1024),
    documents: z.array(text).max(12),
    terminalId: terminalKey.nullable(),
    authoringAppId: terminalKey.nullable().default(null),
  })
  .strict();

const connection = z
  .object({
    id,
    kind: z.enum(connectionKinds),
    from: z.object({ occurrenceId: id, portId: id }).strict(),
    to: z.object({ occurrenceId: id, portId: id }).strict(),
  })
  .strict();

const savedCamera = z
  .object({
    id,
    label: text,
    floorId: id,
    mode: z.enum(["perspective", "orthographic"]),
    position: vectorSchema,
    target: vectorSchema,
    zoom: z.number().finite().positive().max(1_000),
  })
  .strict();

export const spatialDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    siteCode: id,
    spaces: z.array(space).max(1500),
    catalog: z.array(catalogTemplate).max(catalogLimit),
    occurrences: z.array(occurrence).max(placementLimit),
    connections: z.array(connection).max(3500),
    artifacts: z.array(spatialArtifactSchema).max(14),
    cameras: z.array(savedCamera).max(50),
  })
  .strict()
  .superRefine((document, ctx) => {
    const encodedTotal =
      document.artifacts.reduce((n, artifact) => n + artifact.base64.length, 0) +
      document.spaces.reduce((n, node) => n + (node.floor?.reference?.base64.length ?? 0), 0);
    if (encodedTotal > embeddedEncodedLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Embedded model and plan files exceed the workspace limit",
      });
    }
    for (const artifact of [
      ...document.artifacts,
      ...document.spaces.flatMap((node) => (node.floor?.reference ? [node.floor.reference] : [])),
    ]) {
      const padding = artifact.base64.endsWith("==") ? 2 : artifact.base64.endsWith("=") ? 1 : 0;
      if (
        artifact.base64.length % 4 ||
        (artifact.base64.length / 4) * 3 - padding !== artifact.bytes
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Embedded bytes do not match the declared artifact length",
        });
      }
    }
  });

export type SpatialDocument = z.infer<typeof spatialDocumentSchema>;
export type SpaceNode = z.infer<typeof space>;
export type SpaceKind = (typeof spaceKinds)[number];
export type CatalogTemplate = z.infer<typeof catalogTemplate>;
export type Occurrence = z.infer<typeof occurrence>;
export type Connection = z.infer<typeof connection>;
export type Vector = z.infer<typeof vectorSchema>;
export type Port = z.infer<typeof port>;
export type SpatialArtifact = z.infer<typeof spatialArtifactSchema>;
export type FloorReference = z.infer<typeof floorReferenceSchema>;
export type SavedCamera = z.infer<typeof savedCamera>;

export const origin: Vector = { x: 0, y: 0, z: 0 };

const library: Array<Pick<CatalogTemplate, "kind" | "label" | "size" | "capabilities">> = [
  {
    kind: "machine",
    label: "Machine envelope",
    size: { x: 2.8, y: 2.3, z: 1.7 },
    capabilities: [],
  },
  {
    kind: "robot",
    label: "Robot cell envelope",
    size: { x: 2.4, y: 2.4, z: 2.4 },
    capabilities: [],
  },
  {
    kind: "conveyor",
    label: "Belt conveyor",
    size: { x: 3.2, y: 0.9, z: 0.85 },
    capabilities: ["material transfer"],
  },
  {
    kind: "buffer",
    label: "Material buffer",
    size: { x: 1.8, y: 1.4, z: 0.9 },
    capabilities: ["material storage"],
  },
  {
    kind: "fixture",
    label: "Fixture envelope",
    size: { x: 1.4, y: 0.92, z: 0.7 },
    capabilities: [],
  },
  {
    kind: "terminal",
    label: "Operator terminal",
    size: { x: 0.55, y: 1.55, z: 0.44 },
    capabilities: ["display"],
  },
  {
    kind: "hmi",
    label: "HMI panel",
    size: { x: 0.38, y: 0.28, z: 0.12 },
    capabilities: ["display"],
  },
  {
    kind: "cabinet",
    label: "Control cabinet",
    size: { x: 0.85, y: 1.95, z: 0.5 },
    capabilities: [],
  },
  {
    kind: "scanner",
    label: "Barcode scanner",
    size: { x: 0.15, y: 0.2, z: 0.22 },
    capabilities: ["barcode input"],
  },
  {
    kind: "edge-node",
    label: "Industrial edge node",
    size: { x: 0.27, y: 0.2, z: 0.2 },
    capabilities: [],
  },
];

function defaultPorts(template: (typeof library)[number]): Port[] {
  if (template.kind !== "conveyor") return [];
  return [
    {
      id: "feed",
      label: "Material inlet",
      kind: "material",
      direction: "input",
      position: { x: -template.size.x / 2, y: template.size.y, z: 0 },
      interface: "belt handoff",
    },
    {
      id: "exit",
      label: "Material exit",
      kind: "material",
      direction: "output",
      position: { x: template.size.x / 2, y: template.size.y, z: 0 },
      interface: "belt handoff",
    },
  ];
}

export function emptySpatialDocument(siteCode: string): SpatialDocument {
  const hierarchy: SpaceNode[] = [
    {
      id: "organization",
      kind: "organization",
      label: "Organization",
      parentId: null,
      floor: null,
    },
    { id: "site", kind: "site", label: siteCode, parentId: "organization", floor: null },
  ];
  return {
    schemaVersion: 1,
    siteCode,
    spaces: hierarchy,
    catalog: library.map((template) => ({
      ...template,
      id: template.kind,
      revision: 1,
      allowDimensionOverride: true,
      provenance: null,
      artifactId: null,
      ports: defaultPorts(template),
      subcomponents: [],
    })),
    occurrences: [],
    connections: [],
    artifacts: [],
    cameras: [],
  };
}

export function createSpace(parent: SpaceNode, label: string): SpaceNode {
  const kind = childKind[parent.kind];
  if (!kind) throw new Error("Stations contain equipment occurrences");
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    parentId: parent.id,
    floor:
      kind === "floor"
        ? {
            origin: { ...origin },
            size: { x: 24, y: 8, z: 18 },
            reference: null,
          }
        : null,
  };
}

export function floorOf(spaces: ReadonlyMap<string, SpaceNode>, id: string): SpaceNode | undefined {
  let node = spaces.get(id);
  for (let depth = 0; node && depth < spaceKinds.length; depth++) {
    if (node.kind === "floor") return node;
    node = node.parentId ? spaces.get(node.parentId) : undefined;
  }
  return undefined;
}

export const templateKey = (record: { id: string; revision: number }) =>
  `${record.id}@${record.revision}`;

export function templateFor(document: SpatialDocument, occurrence: Occurrence) {
  return document.catalog.find(
    (template) =>
      template.id === occurrence.templateId && template.revision === occurrence.templateRevision,
  );
}

export function createOccurrence(
  template: CatalogTemplate,
  stationId: string,
  position: Vector,
): Occurrence {
  return {
    id: crypto.randomUUID(),
    label: template.label,
    stationId,
    templateId: template.id,
    templateRevision: template.revision,
    position,
    rotation: { ...origin },
    sizeOverride: null,
    clearance: null,
    layer: "Equipment",
    group: null,
    locked: false,
    hidden: false,
    asset: null,
    processStepIds: [],
    notes: "",
    documents: [],
    terminalId: null,
    authoringAppId: null,
  };
}

export function duplicateOccurrences(records: Occurrence[], offset: Vector): Occurrence[] {
  const groups = new Map<string, string>();
  return records.map((record) => {
    if (record.group && !groups.has(record.group)) groups.set(record.group, crypto.randomUUID());
    return {
      ...record,
      id: crypto.randomUUID(),
      label: `${record.label.slice(0, 173)} (copy)`,
      position: add(record.position, offset),
      locked: false,
      group: record.group ? (groups.get(record.group) ?? null) : null,
      asset: null,
      terminalId: null,
      authoringAppId: null,
      processStepIds: [],
    };
  });
}

export function add(a: Vector, b: Vector): Vector {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vector, b: Vector): Vector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function rotate(vector: Vector, angles: Vector): Vector {
  const ax = (angles.x * Math.PI) / 180,
    ay = (angles.y * Math.PI) / 180,
    az = (angles.z * Math.PI) / 180;
  const cx = Math.cos(ax),
    sx = Math.sin(ax),
    cy = Math.cos(ay),
    sy = Math.sin(ay),
    cz = Math.cos(az),
    sz = Math.sin(az);
  const xz = vector.x * cz - vector.y * sz,
    yz = vector.x * sz + vector.y * cz;
  const xy = xz * cy + vector.z * sy,
    zy = -xz * sy + vector.z * cy;
  return { x: xy, y: yz * cx - zy * sx, z: yz * sx + zy * cx };
}

export function portPosition(record: Occurrence, template: CatalogTemplate, item: Port): Vector {
  const size = record.sizeOverride ?? template.size;
  const local = {
    x: (item.position.x * size.x) / template.size.x,
    y: (item.position.y * size.y) / template.size.y,
    z: (item.position.z * size.z) / template.size.z,
  };
  return add(record.position, rotate(local, record.rotation));
}

export function compatiblePorts(from: Port, to: Port) {
  return (
    from.kind === to.kind &&
    from.interface === to.interface &&
    from.direction !== "input" &&
    to.direction !== "output"
  );
}

export function snapVector(position: Vector, step: number): Vector {
  const snap = (n: number) => (step > 0 ? Number((Math.round(n / step) * step).toFixed(6)) : n);
  return { x: snap(position.x), y: snap(position.y), z: snap(position.z) };
}

export function snapToPort(document: SpatialDocument, connection: Connection): Occurrence[] {
  const from = document.occurrences.find((record) => record.id === connection.from.occurrenceId);
  const to = document.occurrences.find((record) => record.id === connection.to.occurrenceId);
  if (!from || !to || from.locked || from.id === to.id) return document.occurrences;
  const fromTemplate = templateFor(document, from),
    toTemplate = templateFor(document, to);
  const fromPort = fromTemplate?.ports.find((item) => item.id === connection.from.portId);
  const toPort = toTemplate?.ports.find((item) => item.id === connection.to.portId);
  if (!fromTemplate || !toTemplate || !fromPort || !toPort || !compatiblePorts(fromPort, toPort))
    return document.occurrences;
  const delta = subtract(
    portPosition(to, toTemplate, toPort),
    portPosition(from, fromTemplate, fromPort),
  );
  return document.occurrences.map((record) =>
    record.id === from.id ? { ...record, position: add(record.position, delta) } : record,
  );
}

export function changeSizes(
  record: Occurrence,
  template: CatalogTemplate,
  size: Vector,
): Occurrence {
  return template.allowDimensionOverride && !template.artifactId && !record.locked
    ? { ...record, sizeOverride: dimensions.parse(size) }
    : record;
}
