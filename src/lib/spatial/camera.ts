import { Box3, MathUtils, Vector3 } from "three";

// Fit all eight corners in camera space. A sphere-based distance wastes much of a
// wide viewport when the floor is shallow or the selected equipment is tall.
export function frameBounds(bounds: Box3, direction: Vector3, aspect: number, verticalFov: number) {
  const center = bounds.getCenter(new Vector3());
  const forward = direction.clone().normalize();
  const right = new Vector3(0, 1, 0).cross(forward);
  if (!right.lengthSq()) right.set(1, 0, 0);
  right.normalize();
  const up = forward.clone().cross(right);
  const tanHalf = Math.tan(MathUtils.degToRad(verticalFov) / 2);
  const margin = 1.12;
  let distance = 0.3;
  let orthoHeight = 0.2;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const local = new Vector3(x, y, z).sub(center);
        const halfHeight = Math.max(Math.abs(local.dot(right)) / aspect, Math.abs(local.dot(up)));
        distance = Math.max(
          distance,
          local.dot(forward) + Math.max(0.05, (halfHeight * margin) / tanHalf),
        );
        orthoHeight = Math.max(orthoHeight, halfHeight * margin * 2);
      }
  return { center, eye: center.clone().addScaledVector(forward, distance), orthoHeight };
}
