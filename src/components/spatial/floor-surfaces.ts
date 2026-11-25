import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Object3D,
  type PerspectiveCamera,
  type OrthographicCamera,
  Vector3,
} from "three";
import type { DisplayLevel } from "@/lib/spatial/floor-display";

function label(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "500 32px system-ui";
  const max = 480;
  let value = text;
  while (value.length > 1 && ctx.measureText(value).width > max) value = value.slice(0, -2) + "…";
  const width = Math.ceil(ctx.measureText(value).width) + 28;
  ctx.fillStyle = "#1c252b";
  ctx.fillRect(0, 0, width, 64);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(value, 14, 32);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.repeat.x = width / 512;
  const sprite = new Sprite(
    new SpriteMaterial({ map: texture, depthWrite: false, depthTest: false }),
  );
  sprite.center.set(0, 0);
  sprite.userData["aspect"] = width / 64;
  sprite.renderOrder = 9;
  return sprite;
}

const tints = ["#70bcae", "#859ed8", "#c5a479", "#a69aca"];
export function floorSurfaces(levels: DisplayLevel[], activeFloor: string, activeArea?: string) {
  const group = new Group();
  let labels = 0;
  for (const level of levels) {
    const { node, areas, offset } = level,
      floor = node.floor!;
    const layer = new Group();
    layer.position.set(offset.x, offset.y, offset.z);
    group.add(layer);
    const { x: w, z: d } = floor.size,
      active = node.id === activeFloor;
    const thick = Math.max(0.025, Math.min(w, d) * 0.014);
    const slab = new Mesh(
      new BoxGeometry(w, thick, d),
      new MeshBasicMaterial({
        color: active ? "#787d7a" : "#829394",
        transparent: !active,
        opacity: active ? 1 : 0.28,
        depthWrite: active,
      }),
    );
    slab.position.set(w / 2, -thick / 2 - 0.024, d / 2);
    slab.userData["spaceId"] = node.id;
    layer.add(slab);

    if (labels < 64 || active) {
      const name = label(node.label, "#ffffff");
      name.userData["spaceId"] = node.id;
      name.position.set(0, 0.045, d);
      layer.add(name);
      labels++;
    }
    areas.forEach((area, i) => {
      const b = area.boundary;
      if (!b) return;
      const chosen = area.id === activeArea,
        color = chosen ? "#ffcb85" : tints[i % tints.length]!;
      const surface = new Mesh(
        new BoxGeometry(b.width, 0.014, b.depth),
        new MeshBasicMaterial({
          color: new Color(color),
          transparent: true,
          opacity: chosen ? 0.47 : 0.28,
          depthWrite: false,
        }),
      );
      surface.position.set(b.x + b.width / 2, 0.035, b.z + b.depth / 2);
      surface.userData["spaceId"] = area.id;
      layer.add(surface);
      if (labels < 64 || chosen) {
        const name = label(area.label, color);
        name.userData["spaceId"] = area.id;
        name.position.set(b.x + b.width * 0.45, 0.065, b.z + b.depth * 0.92);
        layer.add(name);
        labels++;
      }
    });
  }
  return group;
}
export function clearFloorSurfaces(group: Group) {
  group.traverse((child: Object3D) => {
    if (child instanceof Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
    if (child instanceof Mesh) {
      child.geometry.dispose();
      child.material.dispose();
    }
  });
  group.clear();
}

const cameraPoint = new Vector3();
export function sizeFloorLabels(
  labels: Sprite[],
  camera: PerspectiveCamera | OrthographicCamera,
  pixelHeight: number,
) {
  if (!pixelHeight) return;
  for (const label of labels) {
    label.getWorldPosition(cameraPoint).applyMatrix4(camera.matrixWorldInverse);
    const viewHeight =
      "fov" in camera
        ? (2 * Math.max(0.01, -cameraPoint.z) * Math.tan((camera.fov * Math.PI) / 360)) /
          camera.zoom
        : (camera.top - camera.bottom) / camera.zoom;
    const height = (22 * viewHeight) / pixelHeight;
    label.scale.set(height * label.userData["aspect"], height, 1);
  }
}
