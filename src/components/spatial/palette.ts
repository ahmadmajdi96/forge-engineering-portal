import type { CatalogTemplate, Connection } from "@/lib/spatial/model";

export const equipmentColors: Partial<Record<CatalogTemplate["kind"], string>> = {
  conveyor: "#5e95a4",
  robot: "#cf794e",
  machine: "#8299be",
  fixture: "#7aa493",
  buffer: "#9e9565",
  terminal: "#ad8abd",
  hmi: "#cda2d6",
  cabinet: "#94a5b7",
  assembly: "#8ab0ad",
  "edge-node": "#836bd1",
};
export const connectionColors: Record<Connection["kind"], string> = {
  material: "#63c4a3",
  power: "#e19c4a",
  network: "#81a9eb",
  air: "#c69bec",
  other: "#afbcce",
};
