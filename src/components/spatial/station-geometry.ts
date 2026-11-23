import { BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CatalogTemplate } from "@/lib/spatial/model";

type Vector = [number, number, number];
type StationShape = CatalogTemplate["kind"] | NonNullable<CatalogTemplate["stationModel"]>;
type Part = {
  at: Vector;
  size: Vector;
  color: string;
  cylinder?: boolean;
  roll?: number;
  detail?: boolean;
};

// Charcoal castings, brushed steel and warm painted faces from the ManuQube factory viewer.
// Amber is the EMS accent. All surface colors are static schematic materials.
const casting = "#404348",
  steel = "#969d9e",
  graphite = "#26292c";
const amber = "#f2b53d",
  panel = "#ded6c5",
  display = "#48737a";
const block = (at: Vector, size: Vector, color: string, detail = false): Part => ({
  at,
  size,
  color,
  detail,
});
const cylinder = (at: Vector, size: Vector, color: string, roll = 0): Part => ({
  at,
  size,
  color,
  cylinder: true,
  roll,
});

function bench(): Part[] {
  return [
    block([0, 0.34, 0], [1.8, 0.68, 0.92], casting),
    block([0, 0.72, 0], [2, 0.12, 1.1], steel),
    block([0, 0.41, 0.467], [1.25, 0.29, 0.025], graphite, true),
    block([-0.76, 0.41, 0.473], [0.13, 0.29, 0.035], amber, true),
  ];
}

function commissioningBench(): Part[] {
  return [
    ...bench(),
    block([0.17, 0.93, 0.09], [0.85, 0.3, 0.63], steel),
    block([0.17, 1.14, 0.09], [0.72, 0.12, 0.52], amber),
    block([-0.67, 1.19, -0.36], [0.11, 0.87, 0.12], steel),
    block([-0.24, 1.6, -0.36], [0.96, 0.11, 0.12], steel),
    block([0.15, 1.5, -0.36], [0.18, 0.14, 0.15], graphite, true),
  ];
}

function inspection(): Part[] {
  return [
    ...bench(),
    ...[-0.78, 0.78].map((x) => block([x, 1.12, -0.08], [0.14, 0.7, 0.24], steel)),
    block([0, 1.49, -0.08], [1.71, 0.15, 0.31], steel),
    block([0, 1.38, -0.08], [1.28, 0.07, 0.27], amber),
    block([0, 0.86, 0.1], [0.58, 0.17, 0.52], graphite, true),
    block([0, 0.96, 0.1], [0.45, 0.04, 0.42], panel, true),
  ];
}

function robotArm(): Part[] {
  return [
    cylinder([-0.5, 0.13, 0], [0.68, 0.26, 0.68], steel),
    block([-0.5, 0.4, 0], [0.37, 0.31, 0.34], casting),
    { ...block([-0.25, 0.86, 0], [0.24, 0.91, 0.25], amber), roll: -0.58 },
    { ...block([0.4, 1.13, 0], [0.19, 0.91, 0.21], amber), roll: -1.83 },
    block([0.86, 0.98, 0], [0.23, 0.18, 0.25], graphite),
    block([0.91, 0.82, 0], [0.09, 0.19, 0.23], steel, true),
    block([-0.48, 0.52, 0.18], [0.21, 0.21, 0.06], panel, true),
    block([0, 1.23, 0.12], [0.19, 0.18, 0.06], panel, true),
  ];
}

function conveyor(): Part[] {
  return [
    ...[-1.16, 1.16].map((x) => block([x, 0.23, 0], [0.15, 0.46, 0.86], steel)),
    block([0, 0.49, 0], [3.15, 0.18, 1.04], casting),
    block([0, 0.62, 0], [3.1, 0.11, 0.94], graphite),
    ...[-1.3, -0.95, -0.6, -0.25, 0.1, 0.45, 0.8, 1.15].map((x) =>
      block([x, 0.68, 0], [0.033, 0.035, 0.91], steel, true),
    ),
    block([0, 0.49, 0.525], [2.86, 0.055, 0.035], amber, true),
  ];
}

function rack(): Part[] {
  const parts: Part[] = [];
  for (const x of [-0.86, 0.86]) {
    for (const z of [-0.43, 0.43]) parts.push(block([x, 0.91, z], [0.1, 1.82, 0.1], steel));
  }
  for (const y of [0.12, 0.95, 1.75]) {
    parts.push(block([0, y, 0], [1.83, 0.1, 1], casting));
    parts.push(block([0, y, 0.502], [1.83, 0.085, 0.02], amber, true));
  }
  // Empty bays keep the schematic independent of stock and occupancy.
  return parts;
}

function monitor(): Part[] {
  return [
    block([0, 0, 0], [1, 0.66, 0.13], graphite),
    block([0, 0.015, 0.07], [0.86, 0.5, 0.025], display),
    block([-0.25, -0.27, 0.07], [0.25, 0.025, 0.025], amber, true),
    block([-0.21, 0.12, 0.086], [0.3, 0.034, 0.012], panel, true),
  ];
}

function shifted(parts: Part[], offset: Vector): Part[] {
  return parts.map((part) => ({
    ...part,
    at: [part.at[0] + offset[0], part.at[1] + offset[1], part.at[2] + offset[2]],
  }));
}

// The landing viewer gives each station a raised steel bay, painted front lip and corner post.
// They belong to the same occurrence and are included in its configured envelope.
function stationBay(parts: Part[], width: number, depth: number, offsetZ = 0): Part[] {
  const postX = -width * 0.42,
    postZ = depth * 0.36;
  return [
    block([0, 0.08, 0], [width, 0.16, depth], "#454647"),
    block([0, 0.115, depth * 0.5], [width, 0.045, 0.035], amber),
    block([postX, 0.28, postZ], [0.13, 0.24, 0.14], graphite),
    block([postX, 0.43, postZ], [0.13, 0.06, 0.14], panel),
    ...shifted(parts, [0, 0.16, offsetZ]),
  ];
}

function partsFor(shape: StationShape): Part[] {
  switch (shape) {
    case "commissioning-bench":
      return stationBay(commissioningBench(), 2.5, 1.8, -0.09);
    case "inspection-station":
      return stationBay(inspection(), 2.5, 1.8, -0.09);
    case "production-cell":
      return stationBay(
        [...conveyor(), ...shifted(robotArm(), [-0.26, 0, -0.82])],
        3.6,
        2.45,
        0.27,
      );
    case "storage-rack":
      return stationBay(
        [
          ...[-0.84, 0.84].map((x) => block([x, 1, 0], [0.09, 2, 1.06], steel)),
          ...[0.15, 0.74, 1.33, 1.94].map((y) => block([0, y, 0], [1.77, 0.08, 1.13], panel)),
          ...[-0.28, 0.28].map((x) => block([x, 1.04, -0.04], [0.055, 1.75, 0.92], casting)),
          block([0, 0.09, 0.79], [1.45, 0.18, 0.31], casting),
          block([0, 0.18, 0.84], [1.32, 0.04, 0.1], amber, true),
        ],
        2.34,
        1.99,
        -0.13,
      );
    case "buffer":
      return rack();
    case "access-gate":
      return stationBay(
        [
          ...[-0.78, 0.78].map((x) => block([x, 0.67, 0], [0.17, 1.34, 0.3], steel)),
          block([0, 1.36, 0], [1.72, 0.17, 0.32], casting),
          block([-0.77, 0.78, 0.19], [0.23, 0.38, 0.13], graphite),
          block([-0.77, 0.8, 0.26], [0.15, 0.23, 0.025], amber),
          block([-0.77, 0.75, 0.275], [0.11, 0.025, 0.012], graphite, true),
        ],
        2.12,
        0.94,
        -0.09,
      );
    case "robot":
      return robotArm();
    case "conveyor":
      return conveyor();
    case "terminal":
      return [
        block([0, 0.06, 0], [0.74, 0.12, 0.56], casting),
        block([0, 0.54, 0], [0.17, 0.88, 0.18], steel),
        ...shifted(monitor(), [0, 1.12, 0.07]),
      ];
    case "hmi":
      return monitor();
    case "fixture":
      return commissioningBench();
    case "machine":
      return [
        ...bench(),
        block([-0.81, 1.12, -0.15], [0.27, 0.7, 0.78], panel),
        block([0.75, 1.12, -0.15], [0.39, 0.7, 0.78], panel),
        block([0, 1.48, -0.15], [1.88, 0.18, 0.8], steel),
        block([0.75, 1.18, 0.25], [0.26, 0.25, 0.06], display),
        block([0, 0.88, -0.07], [0.61, 0.17, 0.53], amber),
        cylinder([0, 1.31, -0.09], [0.2, 0.21, 0.2], graphite),
      ];
    case "cabinet":
      return [
        block([0, 0.1, 0], [0.97, 0.2, 0.72], graphite),
        block([0, 0.88, 0], [1, 1.5, 0.7], steel),
        block([0, 0.89, 0.36], [0.91, 1.39, 0.035], panel),
        block([0.34, 0.84, 0.39], [0.06, 0.28, 0.05], graphite),
        block([-0.19, 1.32, 0.39], [0.24, 0.075, 0.025], amber, true),
      ];
    case "camera":
    case "scanner":
    case "sensor":
      return [
        block([0, 0.12, 0], [0.45, 0.24, 0.54], casting),
        block([0, 0.48, 0], [0.23, 0.6, 0.21], steel),
        block([0, 0.83, 0.08], [0.62, 0.49, 0.82], amber),
        block([0, 0.83, 0.49], [0.53, 0.4, 0.1], graphite),
        block([0, 0.83, 0.55], [0.31, 0.16, 0.04], display, true),
      ];
    case "scale":
      return [
        block([0, 0.15, 0], [1, 0.3, 0.79], casting),
        block([0, 0.34, 0], [0.92, 0.1, 0.72], steel),
        block([0.29, 0.17, 0.4], [0.31, 0.11, 0.03], amber),
      ];
    case "printer":
      return [
        block([0, 0.22, 0], [0.84, 0.44, 0.66], casting),
        block([0, 0.46, -0.06], [0.82, 0.17, 0.52], panel),
        block([0, 0.3, 0.335], [0.57, 0.1, 0.03], graphite),
        block([0, 0.23, 0.41], [0.5, 0.026, 0.21], steel, true),
      ];
    case "industrial-pc":
    case "plc":
    case "edge-node":
    case "gateway":
      return [
        block([0, 0.3, 0], [1, 0.6, 0.68], casting),
        block([0, 0.32, 0.35], [0.91, 0.45, 0.045], steel),
        block([-0.3, 0.32, 0.38], [0.13, 0.32, 0.03], amber),
        ...[-0.03, 0.18, 0.35].map((x) =>
          block([x, 0.28, 0.38], [0.12, 0.1, 0.035], graphite, true),
        ),
        ...[-0.36, -0.12, 0.12, 0.36].map((x) =>
          block([x, 0.62, 0], [0.09, 0.055, 0.58], steel, true),
        ),
      ];
    case "utility":
    case "assembly":
    case "tool":
      return bench();
  }
}

/** One vertex-colored geometry per symbol, shared across all its instances. Its origin and
 * normalized bounds match the unit envelope used by picking, clearances, plan and elevation. */
export function createStationGeometry(shape: StationShape, simplified: boolean) {
  const parts = partsFor(shape);
  const primitives = parts.map((part) => {
    const geometry = part.cylinder ? new CylinderGeometry(0.5, 0.5, 1, 10) : new BoxGeometry();
    geometry.scale(...part.size);
    if (part.roll) geometry.rotateZ(part.roll);
    geometry.translate(...part.at);
    geometry.deleteAttribute("uv");
    const color = new Color(part.color);
    const values = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let i = 0; i < values.length; i += 3) color.toArray(values, i);
    geometry.setAttribute("color", new Float32BufferAttribute(values, 3));
    return geometry;
  });
  const merged = mergeGeometries(primitives.filter((_, i) => !simplified || !parts[i]?.detail));
  // Keep full and lightweight symbols registered to the same physical coordinate frame.
  for (const primitive of primitives) primitive.computeBoundingBox();
  const bounds = primitives[0]!.boundingBox!.clone();
  for (const primitive of primitives) {
    bounds.union(primitive.boundingBox!);
    primitive.dispose();
  }
  const center = bounds.getCenter(new Vector3()),
    size = bounds.getSize(new Vector3());
  merged.translate(-center.x, -center.y, -center.z);
  merged.scale(1 / size.x, 1 / size.y, 1 / size.z);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export type { StationShape };
