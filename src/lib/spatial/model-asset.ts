import {
  Box3,
  Group,
  LoadingManager,
  Material,
  Mesh,
  Texture,
  Vector3,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  decodeArtifact,
  digestArtifact,
  encodeArtifact,
  inspectGltf,
  readArtifactFile,
} from "./artifacts";
import { spatialArtifactSchema, type SpatialArtifact } from "./model";

export async function parseModel(
  bytes: Uint8Array<ArrayBuffer>,
  encoding: SpatialArtifact["encoding"],
) {
  const json = inspectGltf(bytes, encoding);
  const manager = new LoadingManager().setURLModifier((url) => {
    if (/^data:application\/(octet-stream|gltf-buffer);base64,/.test(url)) return url;
    throw new Error("The model requested an unsupported resource.");
  });
  const parsed = await new GLTFLoader(manager).parseAsync(
    encoding === "glb" ? bytes.buffer : json,
    "",
  );
  return parsed.scene;
}

export function disposeTree(object: Object3D) {
  const materials = new Set<Material>();
  const geometries = new Set<Mesh["geometry"]>();
  const textures = new Set<Texture>();
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material])
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const prop of Object.values(material)) if (prop instanceof Texture) textures.add(prop);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

function boundsFor(model: Object3D) {
  model.updateMatrixWorld(true);
  // Precise bounds include nested transforms and use referenced POSITION data.
  const bounds = new Box3().setFromObject(model, true);
  if (bounds.isEmpty()) throw new Error("The model has no measurable mesh.");
  return bounds;
}

export async function inspectModelFile(
  file: File,
  units: SpatialArtifact["units"],
  source: string,
  license: string,
) {
  const encoding = file.name.toLowerCase().endsWith(".glb")
    ? "glb"
    : file.name.toLowerCase().endsWith(".gltf")
      ? "gltf"
      : null;
  if (!encoding) throw new Error("Choose a self-contained GLB or glTF file.");
  const bytes = await readArtifactFile(file);
  const model = await parseModel(bytes, encoding);
  try {
    const bounds = boundsFor(model);
    const scale = units === "mm" ? 0.001 : 1;
    const size = bounds.getSize(new Vector3()).multiplyScalar(scale);
    return spatialArtifactSchema.parse({
      id: crypto.randomUUID(),
      filename: file.name,
      source,
      license,
      encoding,
      units,
      frame: "right-handed-y-up",
      converter: "three-glTF-bounds-v1",
      sha256: await digestArtifact(bytes),
      bytes: bytes.length,
      base64: encodeArtifact(bytes),
      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
      size: { x: size.x, y: size.y, z: size.z },
    });
  } finally {
    disposeTree(model);
  }
}

export async function loadModelArtifact(artifact: SpatialArtifact) {
  const bytes = decodeArtifact(artifact.base64);
  if ((await digestArtifact(bytes)) !== artifact.sha256)
    throw new Error("Model integrity check failed.");
  const model = await parseModel(bytes, artifact.encoding);
  try {
    const bounds = boundsFor(model);
    const tolerance = 0.000001;
    if (
      bounds.min.distanceTo(new Vector3(artifact.min.x, artifact.min.y, artifact.min.z)) >
        tolerance ||
      bounds.max.distanceTo(new Vector3(artifact.max.x, artifact.max.y, artifact.max.z)) > tolerance
    ) {
      throw new Error("Model bounds differ from the stored source metadata.");
    }
    const center = bounds.getCenter(new Vector3());
    const normalized = new Group();
    const source = new Group();
    source.position.set(-center.x, -bounds.min.y, -center.z);
    source.add(model);
    normalized.add(source);
    normalized.scale.setScalar(artifact.units === "mm" ? 0.001 : 1);
    return normalized;
  } catch (error) {
    disposeTree(model);
    throw error;
  }
}
