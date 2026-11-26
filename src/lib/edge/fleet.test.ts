import { expect, it } from "vitest";
import { planRollout, type FleetTarget } from "./fleet.server";
import type { DeviceReadback } from "./protocol";

const now = 175_000;
const digest = "c".repeat(64);
const target = (nodeId: string): FleetTarget => ({
  nodeId,
  siteId: "training-north",
  deploymentId: "offer",
  releaseDigest: digest,
  configRevision: "config",
  kind: "operator",
});
function receipt(
  node: FleetTarget,
  status: DeviceReadback["slots"][number]["status"],
): DeviceReadback {
  const healthy = status === "HEALTH_VERIFIED";
  const common = {
    kind: "operator" as const,
    status,
    deploymentId: node.deploymentId,
    activeDeploymentId: healthy ? node.deploymentId : null,
    activeReleaseDigest: healthy ? node.releaseDigest : null,
    activeConfigRevision: healthy ? node.configRevision : null,
    pendingReleaseDigest: healthy ? null : node.releaseDigest,
    inFlightRuns: status === "DEFERRED" ? 1 : 0,
  };
  return {
    version: 1,
    nodeId: node.nodeId,
    siteId: "training-north",
    sequence: 1,
    observedAt: now,
    slots: [common, { ...common, kind: "hmi", status: "UNKNOWN", deploymentId: null }],
    unsyncedEvidence: 0,
  };
}

it("gates the next wave on verified canaries, bounds concurrency and preserves separate outcomes", () => {
  const canary = target("a");
  const deferred = target("b");
  const offline = target("c");
  const failed = target("d");
  const fresh = (value: FleetTarget, approved = false) => ({
    target: value,
    canary: approved,
    offerSent: false,
    receipt: undefined,
  });
  const initial = [fresh(canary, true), fresh(deferred), fresh(offline), fresh(failed)];
  expect(planRollout(initial, 2, now)).toMatchObject({ phase: "canary", ready: [canary] });
  const promoted = [
    { ...fresh(canary, true), offerSent: true, receipt: receipt(canary, "HEALTH_VERIFIED") },
    { ...fresh(deferred), offerSent: true, receipt: receipt(deferred, "DEFERRED") },
    { ...fresh(offline), offerSent: true },
    fresh(failed),
  ];
  expect(planRollout(promoted, 2, now)).toMatchObject({ phase: "fleet", ready: [] });
  const stopped = [
    ...promoted.slice(0, 3),
    { ...fresh(failed), offerSent: true, receipt: receipt(failed, "FAILED") },
  ];
  const result = planRollout(stopped, 4, now);
  expect(result.phase).toBe("stopped");
  expect(result.observations.map(({ outcome }) => outcome)).toEqual([
    "health-verified",
    "deferred",
    "unknown",
    "failed",
  ]);
});
