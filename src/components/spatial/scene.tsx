import { useEffect, useRef, useState, type Ref } from "react";
import {
  AmbientLight,
  Box3,
  Box3Helper,
  BoxGeometry,
  Color,
  Euler,
  LineSegments,
  Group,
  InstancedMesh,
  Line,
  LineDashedMaterial,
  LineBasicMaterial,
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  DirectionalLight,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { loadModelArtifact, disposeTree } from "@/lib/spatial/model-asset";
import {
  add,
  portPosition,
  subtract,
  type CatalogTemplate,
  type Connection,
  type FloorReference,
  type Occurrence,
  type SavedCamera,
  type SpatialArtifact,
  type Vector,
} from "@/lib/spatial/model";
import { connectionColors, equipmentColors } from "./palette";
import { createStationGeometry, type StationShape } from "./station-geometry";
import { frameBounds } from "@/lib/spatial/camera";
import { occurrenceBounds } from "@/lib/spatial/validation";

export type VisualRecord = { record: Occurrence; template: CatalogTemplate };
type Floor = { size: Vector; reference: FloorReference | null };
type Projection = SavedCamera["mode"];
type Gizmo = "translate" | "rotate";
type Transform = Pick<Occurrence, "position" | "rotation">;
type CameraState = Omit<SavedCamera, "id" | "label" | "floorId">;

export type CameraDirection = "isometric" | "top" | "front" | "side";
export type ViewportHandle = {
  fit: (direction?: CameraDirection) => void;
  capture: () => CameraState;
  restore: (state: CameraState) => void;
};

type Props = {
  viewport: Ref<ViewportHandle | null>;
  floor: Floor;
  visible: VisualRecord[];
  connections: Connection[];
  signalPaths?: import("@/lib/spatial/process-trace").SignalPath[] | undefined;
  artifacts: SpatialArtifact[];
  selection: string[];
  mode: Projection;
  gizmo: Gizmo;
  moveSnap: number;
  angleSnap: number;
  transparent: boolean;
  section: number | null;
  exploded: boolean;
  editable: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onTransform: (id: string, transform: Transform, mode: Gizmo) => void;
  onDropTemplate: (key: string, at: Vector) => void;
};

const vec = ({ x, y, z }: Vector) => new Vector3(x, y, z);
const plain = ({ x, y, z }: Vector): Vector => ({ x, y, z });
const radians = Math.PI / 180;
const concurrentImportedModels = 12;
const sceneBackground = new Color("#292624");
const fullStationDetailLimit = 300;

function paintMatrix(target: Object3D, position: Vector, rotation: Vector, size?: Vector) {
  target.position.copy(vec(position));
  target.rotation.set(rotation.x * radians, rotation.y * radians, rotation.z * radians, "XYZ");
  target.scale.copy(size ? vec(size) : new Vector3(1, 1, 1));
  if (size) target.position.add(new Vector3(0, size.y / 2, 0).applyQuaternion(target.quaternion));
  target.updateMatrix();
  return target.matrix;
}

type InstanceRef = { mesh: InstancedMesh; index: number; size: Vector };
type SceneController = ReturnType<typeof createScene>;

function createScene(
  host: HTMLDivElement,
  current: () => Props,
  setFailure: (message: string) => void,
  setHover: (id: string) => void,
) {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.localClippingEnabled = true;
  const canvas = renderer.domElement;
  canvas.className = "block h-full w-full touch-none outline-none";
  canvas.setAttribute(
    "aria-label",
    "Interactive 3D scene. Keyboard placement controls are in the inspector.",
  );
  host.appendChild(canvas);

  const scene = new Scene();
  scene.background = sceneBackground;
  const ambient = new AmbientLight("#f2ede5", 1.15);
  const light = new DirectionalLight("#ffe6cc", 2.3);
  light.position.set(8, 14, 9);
  const rim = new DirectionalLight("#bfcde0", 1.15);
  rim.position.set(-7, 6, -6);
  scene.add(ambient, light, rim);

  const perspective = new PerspectiveCamera(44, 1, 0.03, 6000);
  const ortho = new OrthographicCamera(-16, 16, 16, -16, 0.03, 6000);
  let camera: PerspectiveCamera | OrthographicCamera = perspective;
  let extent = 20;
  const navigation = new OrbitControls<PerspectiveCamera | OrthographicCamera>(camera, canvas);
  navigation.enableDamping = false;
  navigation.minDistance = 0.2;
  navigation.maxDistance = 4500;
  navigation.maxPolarAngle = Math.PI * 0.97;
  const transform = new TransformControls(camera, canvas);
  transform.setSpace("world");
  transform.setSize(0.85);
  const pivot = new Object3D();
  scene.add(transform.getHelper(), pivot);

  const floorGroup = new Group(),
    objects = new Group(),
    links = new Group(),
    outlines = new Group();
  scene.add(floorGroup, objects, links, outlines);
  const unit = new BoxGeometry(1, 1, 1);
  const stationGeometry = new Map<string, BufferGeometry>();
  function symbolGeometry(shape: StationShape, simplified: boolean) {
    const key = shape + (simplified ? "/low" : "/full");
    const existing = stationGeometry.get(key);
    if (existing) return existing;
    const geometry = createStationGeometry(shape, simplified);
    stationGeometry.set(key, geometry);
    return geometry;
  }
  const clipping = new Plane(new Vector3(0, -1, 0), 0);
  const tool = new Object3D();
  const instanceById = new Map<string, InstanceRef[]>();
  const modelById = new Map<string, Object3D>();
  const assets = new Map<
    string,
    { promise: Promise<Group>; valid: boolean; value: Group | null }
  >();
  const modelObjects = new Group();
  objects.add(modelObjects);
  const pickables: Object3D[] = [];
  let floorSignature = "";
  let activeFloorReference = "";
  let selectionId: string | null = null;
  let currentSelection: VisualRecord | undefined;
  let transformMembers: VisualRecord[] = [];
  let disposed = false;
  let frame = 0;
  let floorInitialized = false;
  let sceneGeneration = 0;
  let failed = false;

  function invalidate() {
    if (frame || disposed || failed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!disposed && !failed) renderer.render(scene, camera);
    });
  }

  function resize() {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    renderer.setSize(width, height, false);
    perspective.aspect = aspect;
    perspective.updateProjectionMatrix();
    ortho.left = (-extent * aspect) / 2;
    ortho.right = (extent * aspect) / 2;
    ortho.top = extent / 2;
    ortho.bottom = -extent / 2;
    ortho.updateProjectionMatrix();
    invalidate();
  }

  function applyProjection(mode: Projection) {
    const next = mode === "perspective" ? perspective : ortho;
    if (camera === next) return;
    next.position.copy(camera.position);
    next.quaternion.copy(camera.quaternion);
    if (next === ortho) {
      extent = Math.max(0.25, camera.position.distanceTo(navigation.target) * 0.8);
      ortho.zoom = 1;
    }
    camera = next;
    navigation.object = next;
    transform.camera = next;
    navigation.update();
    resize();
  }

  function fit(preferSelection = true, direction?: CameraDirection) {
    const props = current();
    const selected = new Set(props.selection);
    const items = preferSelection
      ? props.visible.filter(({ record }) => selected.has(record.id))
      : [];
    const bounds = (items.length ? items : props.visible).reduce((box, { record, template }) => {
      const bound = occurrenceBounds(record, template);
      return box.expandByPoint(vec(bound.min)).expandByPoint(vec(bound.max));
    }, new Box3());
    if (!items.length)
      bounds
        .expandByPoint(new Vector3())
        .expandByPoint(new Vector3(props.floor.size.x, 0, props.floor.size.z));
    const directions = {
      isometric: new Vector3(0.99, 0.77, 1.08),
      top: new Vector3(0, 1, 0.00001),
      front: new Vector3(0, 0, 1),
      side: new Vector3(1, 0, 0),
    };
    const viewDirection = direction
      ? directions[direction]
      : camera.position.clone().sub(navigation.target);
    if (viewDirection.lengthSq() < 0.01) viewDirection.copy(directions.isometric);
    const frame = frameBounds(bounds, viewDirection, perspective.aspect, perspective.fov);
    navigation.target.copy(frame.center);
    camera.position.copy(frame.eye);
    extent = frame.orthoHeight;
    camera.zoom = 1;
    resize();
    navigation.update();
    invalidate();
  }

  function layerMaterials(props: Props, color: string, opacity: number) {
    return new MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.15,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
      clippingPlanes: props.section === null ? [] : [clipping],
    });
  }

  function rebuildFloor(floor: Floor) {
    const signature = `${floor.size.x}/${floor.size.z}/${JSON.stringify(
      floor.reference && {
        sha: floor.reference.sha256,
        x: floor.reference.x,
        z: floor.reference.z,
        width: floor.reference.width,
        depth: floor.reference.depth,
      },
    )}`;
    if (signature === floorSignature) return;
    floorSignature = signature;
    activeFloorReference = "";
    for (const item of [...floorGroup.children]) {
      if (item instanceof LineSegments) {
        item.geometry.dispose();
        (item.material as LineBasicMaterial).dispose();
      } else disposeTree(item);
      floorGroup.remove(item);
    }
    const ground = new Mesh(
      new PlaneGeometry(floor.size.x, floor.size.z),
      new MeshBasicMaterial({ color: "#373532" }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(floor.size.x / 2, -0.015, floor.size.z / 2);
    floorGroup.add(ground);
    const { x: width, z: depth } = floor.size;
    const step = Math.max(1, Math.ceil(Math.max(width, depth) / 100));
    const segments: Vector3[] = [];
    for (let x = step; x < width; x += step)
      segments.push(new Vector3(x, 0, 0), new Vector3(x, 0, depth));
    for (let z = step; z < depth; z += step)
      segments.push(new Vector3(0, 0, z), new Vector3(width, 0, z));
    const outline = [
      new Vector3(),
      new Vector3(width, 0, 0),
      new Vector3(width, 0, depth),
      new Vector3(0, 0, depth),
    ];
    for (const [points, color] of [
      [segments, "#4b4843"],
      [outline.flatMap((point, index) => [point, outline[(index + 1) % 4]!]), "#8d877b"],
    ] as const) {
      floorGroup.add(
        new LineSegments(
          new BufferGeometry().setFromPoints(points),
          new LineBasicMaterial({ color }),
        ),
      );
    }
    if (!floor.reference) return;
    const reference = floor.reference;
    activeFloorReference = signature;
    const url = `data:image/${reference.format};base64,${reference.base64}`;
    new TextureLoader().load(
      url,
      (texture) => {
        if (disposed || activeFloorReference !== signature) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        const image = new Mesh(
          new PlaneGeometry(reference.width, reference.depth),
          new MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
          }),
        );
        image.rotation.x = -Math.PI / 2;
        image.position.set(
          reference.x + reference.width / 2,
          0.005,
          reference.z + reference.depth / 2,
        );
        floorGroup.add(image);
        invalidate();
      },
      undefined,
      () => {
        if (disposed || activeFloorReference !== signature) return;
        canvas.dispatchEvent(
          new CustomEvent("spatialasseterror", {
            detail: "The floor reference could not be displayed.",
          }),
        );
      },
    );
  }

  function getAsset(artifact: SpatialArtifact) {
    const key = `${artifact.sha256}:${artifact.units}:${artifact.id}`;
    const prior = assets.get(key);
    if (prior) return prior.promise;
    const entry = {
      promise: loadModelArtifact(artifact),
      valid: true,
      value: null as Group | null,
    };
    assets.set(key, entry);
    void entry.promise.then(
      (model) => {
        if (disposed || !entry.valid) disposeTree(model);
        else entry.value = model;
      },
      () => {
        assets.delete(key);
      },
    );
    return entry.promise;
  }

  function refreshDocument(props: Props) {
    const generation = ++sceneGeneration;
    // Keep resident geometry shared across occurrences using the same immutable bytes.
    const visibleHashes = new Set(
      props.artifacts.map((item) => `${item.sha256}:${item.units}:${item.id}`),
    );
    for (const [hash, entry] of assets) {
      if (visibleHashes.has(hash)) continue;
      if (entry.value) disposeTree(entry.value);
      entry.valid = false;
      assets.delete(hash);
    }
    for (const item of [...objects.children]) {
      if (item === modelObjects) continue;
      if (item instanceof InstancedMesh) {
        item.dispose();
        (item.material as MeshStandardMaterial).dispose();
      }
      objects.remove(item);
    }
    modelObjects.clear();
    instanceById.clear();
    modelById.clear();
    pickables.length = 0;
    while (links.children.length) {
      const line = links.children[0] as Line;
      line.geometry.dispose();
      (line.material as LineBasicMaterial).dispose();
      links.remove(line);
    }

    clipping.constant = props.section ?? 0;
    const byId = new Map(props.visible.map((item) => [item.record.id, item]));
    const selected = new Set(props.selection);
    const activeArtifacts = new Map(props.artifacts.map((artifact) => [artifact.id, artifact]));
    const imported = props.visible.filter(
      ({ template }) => template.artifactId && activeArtifacts.has(template.artifactId),
    );
    const highDetail = new Set(
      imported
        .sort((a, b) => {
          const selectionPriority =
            Number(selected.has(b.record.id)) - Number(selected.has(a.record.id));
          return (
            selectionPriority ||
            camera.position.distanceToSquared(vec(a.record.position)) -
              camera.position.distanceToSquared(vec(b.record.position))
          );
        })
        .slice(0, concurrentImportedModels)
        .map(({ record }) => record.id),
    );
    type Box = { id: string; size: Vector; position: Vector; rotation: Vector; track: boolean };
    const boxes = new Map<
      string,
      { items: Box[]; opacity: number; color: string; geometry: BufferGeometry }
    >();

    const box = (color: string, opacity: number, item: Box, geometry: BufferGeometry = unit) => {
      const key = `${geometry.id}/${color}/${opacity}`;
      if (!boxes.has(key)) boxes.set(key, { items: [], color, opacity, geometry });
      boxes.get(key)?.items.push(item);
    };
    for (const { record, template } of props.visible) {
      const color = equipmentColors[template.kind] ?? "#8491a5";
      const artifact = template.artifactId ? activeArtifacts.get(template.artifactId) : undefined;
      const size = record.sizeOverride ?? template.size;
      const detailed = artifact && highDetail.has(record.id);
      const opacity = props.transparent || detailed ? 0.29 : 1;
      if (!(props.exploded && selected.has(record.id) && template.subcomponents.length)) {
        // Explicit assemblies and imported templates keep their authored geometry and envelope.
        const schematic = !template.artifactId && !template.subcomponents.length;
        const geometry = schematic
          ? symbolGeometry(
              template.stationModel ?? template.kind,
              props.visible.length > fullStationDetailLimit && !selected.has(record.id),
            )
          : unit;
        box(
          schematic ? "#ffffff" : color,
          opacity,
          {
            id: record.id,
            size,
            position: record.position,
            rotation: record.rotation,
            track: true,
          },
          geometry,
        );
      }
      if (detailed) {
        void getAsset(artifact).then(
          (source) => {
            if (disposed || generation !== sceneGeneration) return;
            const model = source.clone(true);
            const placement = new Group();
            placement.add(model);
            placement.userData["occurrenceId"] = record.id;
            // The imported geometry owns its materials. Per-occurrence overrides get separate clones.
            model.traverse((child) => {
              if (!(child instanceof Mesh)) return;
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              const copies = materials.map((material) => {
                const copy = material.clone();
                copy.clippingPlanes = props.section === null ? [] : [clipping];
                if (props.transparent) {
                  copy.opacity = 0.34;
                  copy.transparent = true;
                  copy.depthWrite = false;
                }
                return copy;
              });
              child.material = Array.isArray(child.material) ? copies : copies[0]!;
            });
            paintMatrix(placement, record.position, record.rotation);
            modelById.set(record.id, placement);
            modelObjects.add(placement);
            pickables.push(placement);
            invalidate();
          },
          () => {
            if (!disposed && generation === sceneGeneration) {
              canvas.dispatchEvent(
                new CustomEvent("spatialasseterror", {
                  detail: `${record.label} model is unavailable. Its envelope is visible.`,
                }),
              );
            }
          },
        );
      }
      if (selected.has(record.id) && template.subcomponents.length) {
        const recordMatrix = paintMatrix(tool, record.position, record.rotation).clone();
        for (const part of template.subcomponents) {
          const local = props.exploded
            ? vec(part.position).add(vec(part.explodeOffset))
            : vec(part.position);
          const matrix = new Matrix4().makeRotationFromEuler(
            new Euler(
              part.rotation.x * radians,
              part.rotation.y * radians,
              part.rotation.z * radians,
            ),
          );
          matrix.setPosition(local).premultiply(recordMatrix);
          const rotation = new Euler().setFromRotationMatrix(matrix);
          box("#8bbeb3", 1, {
            id: record.id,
            size: part.size,
            position: plain(new Vector3().setFromMatrixPosition(matrix)),
            rotation: { x: rotation.x / radians, y: rotation.y / radians, z: rotation.z / radians },
            track: false,
          });
        }
      }
    }

    for (const { color, opacity, items, geometry } of boxes.values()) {
      const material = layerMaterials(props, color, opacity);
      material.vertexColors = geometry.hasAttribute("color");
      const mesh = new InstancedMesh(geometry, material, items.length);
      mesh.userData["ids"] = items.map((item) => item.id);
      mesh.frustumCulled = false;
      for (const [index, item] of items.entries()) {
        mesh.setMatrixAt(index, paintMatrix(tool, item.position, item.rotation, item.size));
        if (item.track) {
          const refs = instanceById.get(item.id) ?? [];
          refs.push({ mesh, index, size: item.size });
          instanceById.set(item.id, refs);
        }
      }
      mesh.computeBoundingSphere();
      mesh.instanceMatrix.needsUpdate = true;
      pickables.push(mesh);
      objects.add(mesh);
    }

    // A logical signal may span several physical network segments.
    const flowVertices: Vector3[] = [];
    for (const path of props.signalPaths ?? []) {
      const a = byId.get(path.from),
        b = byId.get(path.to);
      if (!a || !b) continue;
      const start = vec(a.record.position),
        end = vec(b.record.position);
      start.y += (a.record.sizeOverride ?? a.template.size).y;
      end.y += (b.record.sizeOverride ?? b.template.size).y;
      const lift = Math.max(start.y, end.y) + 0.45;
      const head = new Vector3(end.x, lift, end.z),
        tail = new Vector3(start.x, lift, start.z);
      const dir = head.clone().sub(tail).normalize();
      const wing = new Vector3(-dir.z, 0, dir.x).multiplyScalar(0.12);
      const base = head.clone().addScaledVector(dir, -Math.min(0.35, head.distanceTo(tail) / 2));
      flowVertices.push(
        start,
        tail,
        tail,
        head,
        head,
        end,
        base.clone().add(wing),
        head,
        head,
        base.clone().sub(wing),
      );
    }
    if (flowVertices.length)
      links.add(
        new LineSegments(
          new BufferGeometry().setFromPoints(flowVertices),
          new LineBasicMaterial({ color: 0x6ed9cc }),
        ),
      );
    for (const link of props.connections) {
      const from = byId.get(link.from.occurrenceId),
        to = byId.get(link.to.occurrenceId);
      const a = from?.template.ports.find((port) => port.id === link.from.portId);
      const b = to?.template.ports.find((port) => port.id === link.to.portId);
      if (!from || !to || !a || !b) continue;
      const first = vec(portPosition(from.record, from.template, a));
      const last = vec(portPosition(to.record, to.template, b));
      const points = [first, last];
      if (first.distanceTo(last) < 0.02)
        points.splice(1, 0, first.clone().add(new Vector3(0, 0.18, 0)));
      const material =
        link.kind === "material"
          ? new LineBasicMaterial({ color: connectionColors[link.kind] })
          : new LineDashedMaterial({
              color: connectionColors[link.kind],
              dashSize: 0.2,
              gapSize: 0.12,
            });
      const line = new Line(new BufferGeometry().setFromPoints(points), material);
      line.computeLineDistances();
      links.add(line);
    }
  }

  function clearModelCopies() {
    modelObjects.traverse((item) => {
      if (!(item instanceof Mesh)) return;
      for (const material of Array.isArray(item.material) ? item.material : [item.material])
        material.dispose();
    });
  }

  function clearOutlines() {
    for (const item of [...outlines.children]) {
      if (item instanceof Box3Helper) item.dispose();
      outlines.remove(item);
    }
  }

  function showSelection(props: Props) {
    clearOutlines();
    const chosen = props.visible.filter(({ record }) => props.selection.includes(record.id));
    for (const { record, template } of chosen) {
      const bounds = occurrenceBounds(record, template);
      outlines.add(
        new Box3Helper(new Box3(vec(bounds.min), vec(bounds.max)), new Color("#f5b358")),
      );
      if (record.clearance) {
        const clearance = occurrenceBounds(record, template, record.clearance.distance);
        outlines.add(
          new Box3Helper(new Box3(vec(clearance.min), vec(clearance.max)), new Color("#f29179")),
        );
      }
    }
    const primaryId = props.selection.at(-1);
    currentSelection = props.editable
      ? chosen.find(({ record }) => record.id === primaryId && !record.locked)
      : undefined;
    const record = currentSelection?.record;
    selectionId = record?.id ?? null;
    transformMembers = record
      ? props.visible.filter(
          ({ record: item }) =>
            !item.locked &&
            (item.id === record.id ||
              (props.gizmo === "translate" &&
                (props.selection.includes(item.id) ||
                  (!!record.group && item.group === record.group)))),
        )
      : [];
    if (record) {
      paintMatrix(pivot, record.position, record.rotation);
      pivot.updateMatrixWorld(true);
      transform.attach(pivot);
    } else transform.detach();
    transform.setMode(props.gizmo);
    transform.setTranslationSnap(props.moveSnap || null);
    transform.setRotationSnap(props.angleSnap ? props.angleSnap * radians : null);
  }

  let previousProps: Props | undefined;
  function update(forceDetail = false) {
    const props = current();
    if (transform.dragging) return;
    applyProjection(props.mode);
    rebuildFloor(props.floor);
    const previous = previousProps;
    const detailSelection =
      props.exploded ||
      props.artifacts.length > 0 ||
      props.visible.length > fullStationDetailLimit ||
      props.visible.some((item) => item.template.subcomponents.length > 0);
    const refresh =
      forceDetail ||
      !previous ||
      previous.visible !== props.visible ||
      previous.connections !== props.connections ||
      previous.signalPaths !== props.signalPaths ||
      previous.artifacts !== props.artifacts ||
      previous.section !== props.section ||
      previous.transparent !== props.transparent ||
      previous.exploded !== props.exploded ||
      (detailSelection && previous.selection !== props.selection);
    if (refresh) {
      clearModelCopies();
      refreshDocument(props);
    }
    previousProps = props;
    showSelection(props);
    if (!floorInitialized) {
      floorInitialized = true;
      fit(true, "isometric");
    }
    invalidate();
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const floorPlane = new Plane(new Vector3(0, 1, 0), 0);
  function pick(e: Pick<PointerEvent, "clientX" | "clientY">) {
    const box = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -(((e.clientY - box.top) / box.height) * 2 - 1),
    );
    raycaster.setFromCamera(pointer, camera);
  }

  let pointerStart: readonly [number, number] | null = null;
  let gizmoGesture = false;
  const start = (event: PointerEvent) => {
    pointerStart = event.button === 0 ? [event.clientX, event.clientY] : null;
    gizmoGesture = transform.dragging;
  };
  function hitId(event: PointerEvent) {
    pick(event);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      const section = current().section;
      if (section !== null && hit.point.y > section + 0.001) continue;
      let item: Object3D | null = hit.object;
      while (item) {
        const id =
          item instanceof InstancedMesh && hit.instanceId != null
            ? (item.userData["ids"] as string[])[hit.instanceId]
            : (item.userData["occurrenceId"] as string | undefined);
        if (id) return id;
        item = item.parent;
      }
    }
    return "";
  }
  // Wait for a resting mouse before raycasting; orbit and touch gestures do no hover picking.
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  function clearHover() {
    clearTimeout(hoverTimer);
    setHover("");
  }
  const hover = (event: PointerEvent) => {
    clearTimeout(hoverTimer);
    if (event.buttons || event.pointerType !== "mouse" || transform.dragging) {
      setHover("");
      return;
    }
    hoverTimer = setTimeout(() => setHover(hitId(event)), 120);
  };
  const select = (event: PointerEvent) => {
    if (
      !pointerStart ||
      gizmoGesture ||
      Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5
    )
      return;
    const id = hitId(event);
    if (id) current().onSelect(id, event.shiftKey || event.metaKey || event.ctrlKey);
  };
  const change = () => {
    if (!selectionId || !currentSelection || !transform.dragging) return;
    const nextPosition = plain(pivot.position);
    const nextRotation = {
      x: pivot.rotation.x / radians,
      y: pivot.rotation.y / radians,
      z: pivot.rotation.z / radians,
    };
    const delta = subtract(nextPosition, currentSelection.record.position);
    for (const { record } of transformMembers) {
      const anchored = record.id === selectionId;
      const position = anchored ? nextPosition : add(record.position, delta);
      const rotation = anchored ? nextRotation : record.rotation;
      for (const entry of instanceById.get(record.id) ?? []) {
        entry.mesh.setMatrixAt(entry.index, paintMatrix(tool, position, rotation, entry.size));
        entry.mesh.instanceMatrix.needsUpdate = true;
      }
      const model = modelById.get(record.id);
      if (model) paintMatrix(model, position, rotation);
    }
    invalidate();
  };
  const endTransform = () => {
    if (!selectionId) return;
    const round = (value: number) => Number(value.toFixed(6));
    current().onTransform(
      selectionId,
      {
        position: {
          x: round(pivot.position.x),
          y: round(pivot.position.y),
          z: round(pivot.position.z),
        },
        rotation: {
          x: round(pivot.rotation.x / radians),
          y: round(pivot.rotation.y / radians),
          z: round(pivot.rotation.z / radians),
        },
      },
      current().gizmo,
    );
  };
  const lost = (event: Event) => {
    event.preventDefault();
    failed = true;
    setFailure("The graphics context was lost.");
  };
  const drop = (event: DragEvent) => {
    if (!current().editable) return;
    const key = event.dataTransfer?.getData("application/x-ems-template");
    if (!key) return;
    event.preventDefault();
    pick(event);
    const at = raycaster.ray.intersectPlane(floorPlane, new Vector3());
    if (at) current().onDropTemplate(key, plain(at));
  };
  const allowDrop = (event: DragEvent) => {
    if (event.dataTransfer?.types.includes("application/x-ems-template")) event.preventDefault();
  };
  navigation.addEventListener("change", invalidate);
  navigation.addEventListener("end", () => {
    if (
      current().visible.filter(({ template }) => template.artifactId).length >
      concurrentImportedModels
    )
      update(true);
  });
  transform.addEventListener("change", invalidate);
  transform.addEventListener("objectChange", change);
  transform.addEventListener("dragging-changed", ({ value }) => {
    navigation.enabled = !value;
  });
  transform.addEventListener("mouseUp", endTransform);
  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointerup", select);
  canvas.addEventListener("pointermove", hover);
  canvas.addEventListener("pointerleave", clearHover);
  canvas.addEventListener("webglcontextlost", lost);
  host.addEventListener("dragover", allowDrop);
  host.addEventListener("drop", drop);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return {
    update,
    fit: (direction?: CameraDirection) => fit(true, direction),
    capture: (): CameraState => ({
      mode: camera === ortho ? "orthographic" : "perspective",
      position: plain(camera.position),
      target: plain(navigation.target),
      zoom: camera === ortho ? extent / camera.zoom : camera.zoom,
    }),
    restore: (state: CameraState) => {
      applyProjection(state.mode);
      camera.position.copy(vec(state.position));
      navigation.target.copy(vec(state.target));
      if (state.mode === "orthographic") {
        extent = state.zoom;
        camera.zoom = 1;
      } else camera.zoom = state.zoom;
      resize();
      navigation.update();
      invalidate();
    },
    dispose: () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("dragover", allowDrop);
      host.removeEventListener("drop", drop);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointerup", select);
      clearTimeout(hoverTimer);
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerleave", clearHover);
      navigation.dispose();
      transform.dispose();
      clearModelCopies();
      for (const entry of assets.values()) {
        entry.valid = false;
        if (entry.value) disposeTree(entry.value);
      }
      for (const item of floorGroup.children) {
        if (item instanceof LineSegments) {
          item.geometry.dispose();
          (item.material as LineBasicMaterial).dispose();
        } else disposeTree(item);
      }
      for (const item of objects.children)
        if (item instanceof InstancedMesh) {
          item.dispose();
          (item.material as MeshStandardMaterial).dispose();
        }
      for (const item of links.children as Line[]) {
        item.geometry.dispose();
        (item.material as LineBasicMaterial).dispose();
      }
      clearOutlines();
      for (const geometry of stationGeometry.values()) geometry.dispose();
      unit.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

export default function SpatialScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const current = useRef(props);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState("");
  const [assetIssue, setAssetIssue] = useState("");
  const [hoveredId, setHoveredId] = useState("");
  const hovered = hoveredId && props.visible.find(({ record }) => record.id === hoveredId)?.record;
  const viewport = props.viewport;

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    const errorListener = (event: Event) =>
      setAssetIssue(String((event as CustomEvent<string>).detail));
    container.addEventListener("spatialasseterror", errorListener, true);
    try {
      controller.current = createScene(container, () => current.current, setFailure, setHoveredId);
      controller.current.update();
    } catch {
      setFailure("WebGL 2 could not start.");
    }
    return () => {
      container.removeEventListener("spatialasseterror", errorListener, true);
      controller.current?.dispose();
      controller.current = null;
    };
  }, [attempt]);

  const {
    floor,
    visible,
    connections,
    signalPaths,
    artifacts,
    selection,
    mode,
    gizmo,
    moveSnap,
    angleSnap,
    transparent,
    section,
    exploded,
    editable,
  } = props;
  useEffect(() => {
    current.current = props;
  }, [props]);
  useEffect(() => {
    if (!failure) controller.current?.update();
  }, [
    floor,
    visible,
    connections,
    signalPaths,
    artifacts,
    selection,
    mode,
    gizmo,
    moveSnap,
    angleSnap,
    transparent,
    section,
    exploded,
    editable,
    failure,
  ]);

  useEffect(() => {
    if (typeof viewport !== "function" && viewport) viewport.current = controller.current;
    else viewport?.(controller.current);
    return () => {
      if (typeof viewport !== "function" && viewport) viewport.current = null;
      else viewport?.(null);
    };
  }, [attempt, viewport, failure]);

  return (
    <div
      className="relative min-h-[360px] overflow-hidden rounded-lg border border-border bg-[#292624] xl:min-h-[530px]"
      data-testid="spatial-3d"
    >
      <div ref={host} aria-hidden={!!failure} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-3 rounded border border-white/20 bg-stone-950/75 px-2 py-1 text-xs font-medium text-stone-100">
        {props.mode === "perspective" ? "Perspective" : "Orthographic"} · {props.floor.size.x} ×{" "}
        {props.floor.size.z} m
      </div>
      {hovered && !failure && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[90%] break-words rounded border border-white/20 bg-stone-950/85 px-2 py-1 text-xs text-stone-100">
          {hovered.label} · {hovered.asset?.id ?? hovered.id}
        </div>
      )}
      {failure && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-950/90 p-5 text-stone-100">
          <div className="max-w-xs text-center">
            <p role="status" className="font-medium">
              {failure}
            </p>
            <p className="mt-2 text-sm text-stone-300">
              Placement controls and the plan and elevation views are available below.
            </p>
            <button
              type="button"
              className="mt-4 rounded border border-stone-500 px-3 py-2 text-sm hover:bg-stone-800"
              onClick={() => {
                setFailure("");
                setAssetIssue("");
                setAttempt((value) => value + 1);
              }}
            >
              Retry 3D
            </button>
          </div>
        </div>
      )}
      {assetIssue && !failure && (
        <p
          role="status"
          className="absolute bottom-3 left-3 max-w-[80%] rounded bg-stone-950/90 px-3 py-2 text-xs text-amber-200"
        >
          {assetIssue}
        </p>
      )}
    </div>
  );
}
