// @vitest-environment node
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixtureCapabilities, fixtureContext, fixtureInstall } from "../../../edge/fixture";
import { validatePackagedApplication } from "./application";
import { EdgeDevice } from "./device.server";
import { acceptReadback, evaluateTarget } from "./fleet.server";
import type { Activation, Deployment, RunGrant } from "./protocol";
import { hashContent, signEnvelope } from "./signature.server";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const id = "test-key";
const trusted = new Map([[id, publicKey]]);
const keys = {
  release: trusted,
  deployment: trusted,
  activation: trusted,
  operator: trusted,
  evidence: trusted,
};
let now: number;
let path: string;
let scratch: string;
let device: EdgeDevice;
const siteId = fixtureContext.siteId;
const nodeId = fixtureContext.nodeId;
const options = () => ({
  path,
  keys,
  deviceKey: { id, key: privateKey },
  now: () => now,
  context: fixtureContext,
  capabilities: fixtureCapabilities(),
  validateApplication: validatePackagedApplication,
  maximumQueuedEvidence: 1,
});

beforeEach(() => {
  now = 1_700_000_000_000;
  scratch = mkdtempSync(join(tmpdir(), "ems-edge-test-"));
  path = join(scratch, "state.sqlite");
  device = new EdgeDevice(options());
});
afterEach(() => {
  device.close();
  rmSync(scratch, { force: true, recursive: true });
});

function first() {
  return fixtureInstall(now, { id, key: privateKey });
}
function next(
  fixture: ReturnType<typeof first>,
  configure: Partial<typeof fixture.release.value> = {},
) {
  const release = signEnvelope("release", id, privateKey, {
    ...fixture.release.value,
    id: "fixture-release-2",
    ...configure,
  });
  const deployment: Deployment = {
    ...fixture.deployment.value,
    id: "fixture-rollout-2",
    generation: 2,
    assignment: {
      ...fixture.deployment.value.assignment,
      id: "fixture-assignment-2",
      configRevision: "fixture-config-2",
      releaseId: release.value.id,
      releaseDigest: release.contentDigest,
    },
  };
  const activation: Activation = {
    ...fixture.activation.value,
    id: "fixture-activate-2",
    deploymentId: deployment.id,
    releaseDigest: release.contentDigest,
    action: "activate",
    version: 1,
  };
  return {
    release,
    deployment: signEnvelope("deployment", id, privateKey, deployment),
    activation: signEnvelope("activation", id, privateKey, activation),
  };
}
function grant(fixture: ReturnType<typeof first>, changes: Partial<RunGrant> = {}) {
  const value: RunGrant = {
    version: 1,
    id: "run-1",
    actor: "operator-a",
    deploymentId: fixture.deployment.value.id,
    releaseDigest: fixture.release.contentDigest,
    nodeId,
    siteId,
    kind: "operator",
    authorization: "online",
    issuedAt: now,
    expiresAt: now + 60_000,
    qualityValidUntil: now + 60_000,
    allowedEvidence: ["measurement"],
    references: [],
    ...changes,
  };
  return signEnvelope("run-grant", id, privateKey, value);
}

describe("edge package and durable device state", () => {
  it("rejects altered content, the wrong node, incorrect signing purpose and incompatible runtime", () => {
    const candidate = first();
    expect(() =>
      device.stage(
        { ...candidate.release, value: { ...candidate.release.value, stateSchema: "malformed" } },
        candidate.deployment,
      ),
    ).toThrow("Invalid signed content");
    expect(() =>
      device.stage(
        candidate.release,
        signEnvelope("deployment", id, privateKey, {
          ...candidate.deployment.value,
          nodeId: "other",
        }),
      ),
    ).toThrow("different node");
    expect(() =>
      device.stage(
        signEnvelope("deployment", id, privateKey, candidate.release.value),
        candidate.deployment,
      ),
    ).toThrow("Invalid signed content");
    const incompatible = next(candidate, {
      compatibility: { ...candidate.release.value.compatibility, peripherals: ["plc"] },
    });
    expect(() => device.stage(incompatible.release, incompatible.deployment)).toThrow(
      "Missing peripherals",
    );
    expect(device.activeApplication("operator")).toBeNull();
  });

  it("survives restart, keeps v1 active during drain, and advances to the exact approved package", () => {
    const v1 = first();
    expect(device.stage(v1.release, v1.deployment)).toBe("STAGED");
    device.close();
    device = new EdgeDevice(options());
    expect(device.activate(v1.activation)).toBe("ACTIVE");
    expect(device.activate(v1.activation)).toBe("ACTIVE");
    const work = grant(v1);
    expect(device.startRun(work)).toEqual({
      runId: "run-1",
      releaseDigest: v1.release.contentDigest,
      configuration: "fixture-config-1",
    });
    expect(() => device.startRun(work)).toThrow("already been consumed");
    const v2 = next(v1);
    expect(device.stage(v2.release, v2.deployment)).toBe("STAGED");
    expect(device.activate(v2.activation)).toBe("DEFERRED");
    expect(device.activeApplication("operator")?.releaseDigest).toBe(v1.release.contentDigest);
    expect(() => device.startRun(grant(v1, { id: "run-2" }))).toThrow("draining");
    device.close();
    device = new EdgeDevice(options());
    expect(device.readback().value.slots[0]).toMatchObject({ inFlightRuns: 1, status: "DEFERRED" });
    expect(() => device.finishRun("run-1", "someone-else")).toThrow("does not own");
    device.finishRun("run-1", "operator-a");
    expect(device.activate(v2.activation)).toBe("ACTIVE");
    expect(device.verifyHealth("operator", v2.release.contentDigest)).toBe("HEALTH_VERIFIED");
    const readback = device.readback();
    const target = {
      nodeId,
      siteId,
      kind: "operator" as const,
      deploymentId: v2.deployment.value.id,
      configRevision: "fixture-config-2",
      releaseDigest: v2.release.contentDigest,
    };
    const enrollment = { siteId, nodeId, keyId: id, key: publicKey, revoked: false };
    expect(
      evaluateTarget(
        target,
        acceptReadback({ incoming: readback, enrollment, now, previous: undefined }).value,
        now,
      ).outcome,
    ).toBe("health-verified");
    expect(evaluateTarget(target, undefined, now).outcome).toBe("unknown");
    expect(() =>
      acceptReadback({
        incoming: readback,
        enrollment: { ...enrollment, revoked: true },
        now,
        previous: undefined,
      }),
    ).toThrow("revoked");
  });

  it("rejects persistent state schema changes without applied migration", () => {
    const v1 = first();
    device.stage(v1.release, v1.deployment);
    device.activate(v1.activation);
    const v2 = next(v1, { stateSchema: "changed" });
    device.stage(v2.release, v2.deployment);
    expect(() => device.activate(v2.activation)).toThrow(
      "Unimplemented persistent state migration",
    );
    expect(device.activeApplication("operator")?.releaseDigest).toBe(v1.release.contentDigest);
  });

  it("restores bounded offline evidence, rejects duplicate conflicts, and accepts only bound signed receipts", () => {
    const candidate = first();
    const app = validatePackagedApplication(candidate.release.value);
    const offline = next(candidate, {
      application: { ...app, offlinePolicy: "bounded-offline" },
      offlinePolicy: "bounded-offline",
      maximumOfflineMs: 120_000,
    });
    device.stage(offline.release, offline.deployment);
    device.activate(offline.activation);
    const auth = {
      ...grant(candidate, { authorization: "offline" }).value,
      deploymentId: offline.deployment.value.id,
      releaseDigest: offline.release.contentDigest,
    };
    device.startRun(signEnvelope("run-grant", id, privateKey, auth));
    const evidence = {
      id: "ev-1",
      runId: "run-1",
      category: "measurement",
      observedAt: now,
      values: { quantity: 5 },
    };
    expect(device.appendEvidence(evidence, "operator-a", "offline").configRevision).toBe(
      "fixture-config-2",
    );
    device.close();
    device = new EdgeDevice(options());
    expect(device.appendEvidence(evidence, "operator-a", "offline").sequence).toBe(1);
    expect(() =>
      device.appendEvidence({ ...evidence, values: { quantity: 6 } }, "operator-a", "offline"),
    ).toThrow("conflicts");
    expect(() =>
      device.appendEvidence({ ...evidence, id: "ev-2" }, "operator-a", "offline"),
    ).toThrow("queue is full");
    const pending = device.pendingEvidence()[0]!;
    expect(pending.digest).toBe(hashContent(pending.value));
    const ack = {
      version: 1,
      evidenceId: evidence.id,
      evidenceDigest: pending.digest,
      receivedAt: now,
      nodeId,
      siteId,
    };
    expect(() =>
      device.acknowledgeEvidence(
        signEnvelope("evidence-ack", id, privateKey, { ...ack, nodeId: "other" }),
      ),
    ).toThrow("scope");
    expect(device.acknowledgeEvidence(signEnvelope("evidence-ack", id, privateKey, ack))).toBe(
      "acknowledged",
    );
    expect(device.acknowledgeEvidence(signEnvelope("evidence-ack", id, privateKey, ack))).toBe(
      "duplicate",
    );
    expect(device.pendingEvidence()).toEqual([]);
    now -= 60_000;
    expect(() => device.readback()).toThrow("Clock regressed");
  });

  it("refuses reopening an enrolled state volume with a different device key", () => {
    const foreign = generateKeyPairSync("ed25519").privateKey;
    expect(createPublicKey(foreign).equals(publicKey)).toBe(false);
    expect(() => new EdgeDevice({ ...options(), deviceKey: { id, key: foreign } })).toThrow(
      "different device or signing key",
    );
  });
});
