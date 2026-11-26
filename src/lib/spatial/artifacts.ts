import {
  embeddedAssetLimit,
  type FloorReference,
  type SpatialArtifact,
  type SpatialDocument,
  type Vector,
} from "./model";

const gltfExtensions = new Set(["KHR_materials_unlit", "KHR_mesh_quantization"]);
const embeddedBuffer = /^data:application\/(octet-stream|gltf-buffer);base64,[A-Za-z0-9+/]+={0,2}$/;

export function encodeArtifact(bytes: Uint8Array): string {
  let result = "";
  // Multiples of three keep padding out of intermediate chunks.
  for (let offset = 0; offset < bytes.length; offset += 12_288) {
    result += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 12_288)));
  }
  return result;
}

export function decodeArtifact(encoded: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0));
}

export async function digestArtifact(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readArtifactFile(file: File) {
  if (!file.size || file.size > embeddedAssetLimit)
    throw new Error("Choose a file no larger than 700 kB.");
  return new Uint8Array(await file.arrayBuffer());
}

type GltfItem = Record<string, unknown>;
function object(value: unknown): GltfItem | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as GltfItem)
    : undefined;
}

function gltfCollection(document: GltfItem, name: string, max: number): GltfItem[] {
  const entries = document[name] ?? [];
  if (!Array.isArray(entries) || entries.length > max || entries.some((entry) => !object(entry))) {
    throw new Error(`Invalid or oversized glTF ${name} collection.`);
  }
  return entries as GltfItem[];
}

export function inspectGltf(bytes: Uint8Array, encoding: SpatialArtifact["encoding"]) {
  if (!bytes.length || bytes.length > embeddedAssetLimit)
    throw new Error("glTF file exceeds the import budget.");
  let json: Uint8Array = bytes;
  let bufferBytes = 0;
  if (encoding === "glb") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      bytes.length < 20 ||
      view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== bytes.length ||
      view.getUint32(16, true) !== 0x4e4f534a
    ) {
      throw new Error("The file is not a GLB 2.0 document.");
    }
    const jsonSize = view.getUint32(12, true);
    const end = jsonSize + 20;
    if (jsonSize < 4 || jsonSize % 4 || end > bytes.length)
      throw new Error("Invalid GLB JSON chunk.");
    json = bytes.subarray(20, end);
    if (bytes.length > end) {
      if (
        bytes.length < end + 8 ||
        view.getUint32(end + 4, true) !== 0x004e4942 ||
        view.getUint32(end, true) !== bytes.length - end - 8
      )
        throw new Error("Invalid GLB binary chunk.");
      bufferBytes = bytes.length - end - 8;
    }
  }

  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  const data = object(parsed);
  if (!data || object(data["asset"])?.["version"] !== "2.0")
    throw new Error("Only glTF 2.0 geometry is supported.");
  const allowed = [
    "asset",
    "scene",
    "scenes",
    "nodes",
    "meshes",
    "accessors",
    "bufferViews",
    "buffers",
    "materials",
    "extensionsUsed",
    "extensionsRequired",
    "extras",
  ];
  if (Object.keys(data).some((key) => !allowed.includes(key))) {
    throw new Error(
      "Import a static geometry file without textures, cameras, skins, or animation.",
    );
  }
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    const list = data[key] ?? [];
    if (
      !Array.isArray(list) ||
      list.some(
        (extension: unknown) => typeof extension !== "string" || !gltfExtensions.has(extension),
      )
    ) {
      throw new Error("The model requires an unsupported glTF extension.");
    }
  }

  // Bound both traversal and declared decoded data. GLTFLoader only receives accepted static files.
  const collections = {
    scenes: gltfCollection(data, "scenes", 16),
    nodes: gltfCollection(data, "nodes", 256),
    meshes: gltfCollection(data, "meshes", 128),
    accessors: gltfCollection(data, "accessors", 384),
    views: gltfCollection(data, "bufferViews", 384),
    buffers: gltfCollection(data, "buffers", 12),
    materials: gltfCollection(data, "materials", 64),
  };
  const count = collections.accessors.reduce((total, item) => {
    const n = item["count"];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0 || n > 150_000)
      throw new Error("Vertex/index count exceeds the import budget.");
    return total + n;
  }, 0);
  if (count > 350_000) throw new Error("Total vertex/index count exceeds the import budget.");

  let primitiveCount = 0;
  for (const mesh of collections.meshes) {
    const primitives = mesh["primitives"];
    if (
      !Array.isArray(primitives) ||
      primitives.some((primitive: unknown) => {
        const entry = object(primitive);
        return (
          !object(entry?.["attributes"])?.["POSITION"] &&
          object(entry?.["attributes"])?.["POSITION"] !== 0
        );
      })
    )
      throw new Error("Invalid mesh primitives.");
    primitiveCount += primitives.length;
  }
  if (!primitiveCount || primitiveCount > 200)
    throw new Error("Import must contain between 1 and 200 mesh primitives.");

  for (const [index, buffer] of collections.buffers.entries()) {
    const length = buffer["byteLength"];
    const uri = buffer["uri"];
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > embeddedAssetLimit
    ) {
      throw new Error("Invalid or oversized model buffer.");
    }
    if (
      index === 0 &&
      uri === undefined &&
      encoding === "glb" &&
      length <= bufferBytes &&
      bufferBytes <= length + 3
    )
      continue;
    if (
      typeof uri !== "string" ||
      !embeddedBuffer.test(uri) ||
      atob(uri.slice(uri.indexOf(",") + 1)).length !== length
    ) {
      throw new Error("Use self-contained geometry. External model resources are blocked.");
    }
  }

  let visitedCount = 0;
  const inspectTree = (value: unknown, depth: number) => {
    if (++visitedCount > 12_000 || depth > 48)
      throw new Error("Model structure exceeds the import budget.");
    if (Array.isArray(value)) {
      for (const child of value) inspectTree(child, depth + 1);
    } else if (object(value)) {
      for (const [key, child] of Object.entries(value as GltfItem)) {
        if (
          ["__proto__", "constructor", "prototype"].includes(key) ||
          (key === "uri" && (typeof child !== "string" || !embeddedBuffer.test(child)))
        ) {
          throw new Error("The model contains an unsupported resource or key.");
        }
        inspectTree(child, depth + 1);
      }
    }
  };
  inspectTree(data, 0);

  const seen = new Set<number>();
  const active = new Set<number>();
  const childNodes = (ids: unknown): number[] => {
    if (ids === undefined) return [];
    if (
      !Array.isArray(ids) ||
      ids.some(
        (index: unknown) =>
          typeof index !== "number" ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= collections.nodes.length,
      )
    )
      throw new Error("Invalid model node reference.");
    return ids as number[];
  };
  function visitNode(index: number, depth: number) {
    if (active.has(index) || depth > 24)
      throw new Error("Model hierarchy is too deep or contains a cycle.");
    if (seen.has(index)) return;
    active.add(index);
    for (const child of childNodes(collections.nodes[index]?.["children"]))
      visitNode(child, depth + 1);
    active.delete(index);
    seen.add(index);
  }
  // One traversal per scene enforces a tree and bounds shared descendants.
  for (const scene of collections.scenes) {
    seen.clear();
    for (const index of childNodes(scene["nodes"])) visitNode(index, 0);
  }
  seen.clear();
  for (const index of collections.nodes.keys()) visitNode(index, 0);

  return new TextDecoder().decode(json);
}

export function readFloorDimensions(
  bytes: Uint8Array,
): Pick<FloorReference, "sourceWidth" | "sourceHeight" | "format"> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let result: Pick<FloorReference, "sourceWidth" | "sourceHeight" | "format"> | undefined;
  if (
    bytes.length >= 24 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  ) {
    result = { format: "png", sourceWidth: view.getUint32(16), sourceHeight: view.getUint32(20) };
  } else if (bytes.length > 4 && view.getUint16(0) === 0xffd8) {
    let start = 2;
    while (start + 8 < bytes.length && bytes[start] === 0xff) {
      const marker = bytes[start + 1];
      if (marker === 0xff) {
        start++;
        continue;
      }
      const length = view.getUint16(start + 2);
      if (length < 2 || start + 2 + length > bytes.length || marker === 0xda) break;
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (length < 8) break;
        result = {
          format: "jpeg",
          sourceHeight: view.getUint16(start + 5),
          sourceWidth: view.getUint16(start + 7),
        };
        break;
      }
      start += length + 2;
    }
  }
  if (
    !result ||
    !result.sourceHeight ||
    !result.sourceWidth ||
    result.sourceWidth > 3072 ||
    result.sourceHeight > 3072
  ) {
    throw new Error("Choose a PNG or JPEG no larger than 3072 × 3072 pixels.");
  }
  return result;
}

export async function verifySpatialArtifactContent(document: SpatialDocument) {
  for (const artifact of document.artifacts) {
    const bytes = decodeArtifact(artifact.base64);
    inspectGltf(bytes, artifact.encoding);
    const factor = artifact.units === "mm" ? 0.001 : 1;
    const consistentBounds = (["x", "y", "z"] as Array<keyof Vector>).every(
      (axis) =>
        Math.abs((artifact.max[axis] - artifact.min[axis]) * factor - artifact.size[axis]) <=
        0.000001,
    );
    if (
      !consistentBounds ||
      bytes.length !== artifact.bytes ||
      (await digestArtifact(bytes)) !== artifact.sha256
    ) {
      throw new Error("Model metadata, byte length or SHA-256 did not match.");
    }
  }
  for (const floor of document.spaces) {
    const artifact = floor.floor?.reference;
    if (!artifact) continue;
    const bytes = decodeArtifact(artifact.base64);
    const meta = readFloorDimensions(bytes);
    if (
      meta.format !== artifact.format ||
      meta.sourceWidth !== artifact.sourceWidth ||
      meta.sourceHeight !== artifact.sourceHeight ||
      bytes.length !== artifact.bytes ||
      (await digestArtifact(bytes)) !== artifact.sha256
    ) {
      throw new Error("Floor reference metadata, byte length or SHA-256 did not match.");
    }
  }
}
