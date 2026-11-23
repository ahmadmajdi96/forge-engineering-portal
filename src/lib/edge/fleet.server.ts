import { type KeyObject } from "node:crypto";
import { deviceReadbackSchema, type DeviceReadback } from "./protocol";
import { verifyEnvelope, type Signed } from "./signature.server";

export type Enrollment = {
  siteId: string;
  nodeId: string;
  keyId: string;
  key: KeyObject;
  revoked: boolean;
};

export function acceptReadback({
  enrollment,
  incoming,
  previous,
  now,
  maxAgeMs = 120_000,
}: {
  enrollment: Enrollment;
  incoming: unknown;
  previous: Signed<DeviceReadback> | undefined;
  now: number;
  maxAgeMs?: number;
}) {
  if (enrollment.revoked) throw new Error("Device enrollment is revoked");
  const receipt = verifyEnvelope(
    "readback",
    incoming,
    deviceReadbackSchema,
    new Map([[enrollment.keyId, enrollment.key]]),
  );
  const { siteId, nodeId, observedAt, sequence, slots } = receipt.value;
  if (siteId !== enrollment.siteId || nodeId !== enrollment.nodeId)
    throw new Error("Readback scope differs from enrollment");
  if (observedAt > now + 30_000 || observedAt < now - maxAgeMs)
    throw new Error("Readback is outside its freshness window");
  if (new Set(slots.map(({ kind }) => kind)).size !== 2)
    throw new Error("Readback has duplicate runtime slots");
  if (
    previous &&
    (sequence < previous.value.sequence ||
      observedAt < previous.value.observedAt ||
      (sequence === previous.value.sequence && receipt.contentDigest !== previous.contentDigest))
  ) {
    throw new Error("Readback sequence is stale or conflicts with observed state");
  }
  return receipt;
}

export type FleetTarget = {
  siteId: string;
  nodeId: string;
  deploymentId: string;
  releaseDigest: string;
  configRevision: string;
  kind: "operator" | "hmi";
};
export type FleetObservation = {
  outcome: "unknown" | "stale" | "health-verified" | "active" | "pending" | "failed" | "deferred";
  target: FleetTarget;
};

export function evaluateTarget(
  target: FleetTarget,
  receipt: DeviceReadback | undefined,
  now: number,
): FleetObservation {
  if (!receipt || receipt.nodeId !== target.nodeId || receipt.siteId !== target.siteId)
    return { outcome: "unknown", target };
  if (now - receipt.observedAt > 120_000) return { outcome: "stale", target };
  const slot = receipt.slots.find(({ kind }) => kind === target.kind);
  if (!slot) return { outcome: "unknown", target };
  if (slot.status === "STALE") return { outcome: "stale", target };
  const matches =
    slot.activeDeploymentId === target.deploymentId &&
    slot.activeReleaseDigest === target.releaseDigest &&
    slot.activeConfigRevision === target.configRevision;
  if (matches && slot.status === "HEALTH_VERIFIED") return { outcome: "health-verified", target };
  if (matches) return { outcome: "active", target };
  if (slot.deploymentId !== target.deploymentId) return { outcome: "unknown", target };
  if (slot.status === "DEFERRED") return { outcome: "deferred", target };
  if (slot.status === "FAILED" || slot.status === "REJECTED" || slot.status === "ROLLED_BACK")
    return { outcome: "failed", target };
  if (slot.pendingReleaseDigest === target.releaseDigest) return { outcome: "pending", target };
  return { outcome: "unknown", target };
}

type RolloutNode = {
  target: FleetTarget;
  canary: boolean;
  offerSent: boolean;
  receipt: DeviceReadback | undefined;
};

export function planRollout(nodes: readonly RolloutNode[], maximumInFlight: number, now: number) {
  if (!Number.isInteger(maximumInFlight) || maximumInFlight < 1 || maximumInFlight > 100) {
    throw new Error("Rollout concurrency must be between 1 and 100");
  }
  const keys = nodes.map(({ target }) => `${target.siteId}/${target.nodeId}/${target.kind}`);
  if (new Set(keys).size !== keys.length)
    throw new Error("Rollout has more than one target for a node slot");
  if (!nodes.some(({ canary }) => canary)) throw new Error("Choose at least one canary");
  const rows = nodes.map((node) => ({
    ...node,
    ...evaluateTarget(node.target, node.receipt, now),
  }));
  if (rows.some(({ outcome }) => outcome === "failed")) {
    return { phase: "stopped" as const, ready: [], observations: rows };
  }
  const phase = rows.some(({ canary, outcome }) => canary && outcome !== "health-verified")
    ? ("canary" as const)
    : ("fleet" as const);
  const occupied = rows.filter(
    ({ offerSent, outcome }) => offerSent && outcome !== "health-verified",
  ).length;
  const slots = Math.max(0, maximumInFlight - occupied);
  const ready = rows
    .filter(
      ({ offerSent, canary, outcome }) =>
        !offerSent && outcome === "unknown" && (phase === "fleet" || canary),
    )
    .slice(0, slots)
    .map(({ target }) => target);
  return { phase, ready, observations: rows };
}
