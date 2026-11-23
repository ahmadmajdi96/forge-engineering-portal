import {
  catalogLimit,
  createOccurrence,
  placementLimit,
  templateKey,
  type CatalogTemplate,
  type SpatialDocument,
  type Vector,
} from "./model";

type Assembly = {
  model: NonNullable<CatalogTemplate["stationModel"]>;
  label: string;
  kind: CatalogTemplate["kind"];
  size: Vector;
};
const assemblies: Assembly[] = [
  {
    model: "commissioning-bench",
    label: "Commissioning workbench",
    kind: "fixture",
    size: { x: 2, y: 1.55, z: 1 },
  },
  {
    model: "inspection-station",
    label: "Quality inspection station",
    kind: "machine",
    size: { x: 2, y: 1.8, z: 1.25 },
  },
  {
    model: "production-cell",
    label: "Robot and conveyor cell",
    kind: "assembly",
    size: { x: 4.2, y: 2.4, z: 2.6 },
  },
  {
    model: "storage-rack",
    label: "Warehouse storage rack",
    kind: "buffer",
    size: { x: 2.4, y: 2.1, z: 1.2 },
  },
  {
    model: "access-gate",
    label: "Access control gate",
    kind: "fixture",
    size: { x: 1.85, y: 2.2, z: 0.5 },
  },
];

const stationTemplates: CatalogTemplate[] = assemblies.map(({ model, label, kind, size }) => ({
  id: "manuqube-" + model,
  revision: 1,
  label,
  kind,
  size,
  stationModel: model,
  allowDimensionOverride: true,
  provenance: {
    manufacturer: "ManuQube",
    documentReference: "Factory viewer · illustrative station assembly",
    accuracy: "approximate",
  },
  ports: [],
  capabilities: [],
  subcomponents: [],
  artifactId: null,
}));

export function placementLibrary(saved: CatalogTemplate[]) {
  const savedIds = new Set(saved.map((t) => t.id));
  return [...saved, ...stationTemplates.filter((t) => !savedIds.has(t.id))];
}

export function placeLibraryTemplate(
  document: SpatialDocument,
  template: CatalogTemplate,
  stationId: string,
  position: Vector,
) {
  const key = templateKey(template);
  const stored = document.catalog.find((t) => templateKey(t) === key);
  if (!stored && document.catalog.length >= catalogLimit)
    throw new Error("The template catalog is full. Choose an existing template.");
  if (document.occurrences.length >= placementLimit)
    throw new Error("This layout has reached its placement limit.");
  const record = createOccurrence(stored ?? template, stationId, position);
  return {
    record,
    document: {
      ...document,
      catalog: stored ? document.catalog : [...document.catalog, template],
      occurrences: [...document.occurrences, record],
    },
  };
}
