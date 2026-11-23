import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NodeCapabilities, TargetContext } from "../src/lib/edge/assignment";
import type { Deployment, ReleaseManifest } from "../src/lib/edge/protocol";
import { hashContent, signEnvelope } from "../src/lib/edge/signature.server";
import { newStudioApplication } from "../src/lib/studio/model";

export const fixtureContext: TargetContext = {
  siteId: "edge-test-site",
  lineId: "line-test",
  stationId: "station-test",
  terminalId: "terminal-test",
  nodeId: "node-test",
};
export function fixtureCapabilities(): NodeCapabilities {
  return {
    nodeId: fixtureContext.nodeId,
    runtime: 1,
    os: "linux",
    architecture: process.arch === "arm64" ? "arm64" : "amd64",
    displays: ["panel", "portrait", "tablet"],
    peripherals: [],
    signals: [],
    commandPolicies: [],
  };
}
export function fixtureKeys(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "isolated-fixture-key.pem");
  try {
    writeFileSync(
      file,
      generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }),
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const key = createPrivateKey(readFileSync(file));
  const id = "edge-fixture";
  const publicKeys = new Map([[id, createPublicKey(key)]]);
  return {
    deviceKey: { id, key },
    keys: {
      release: publicKeys,
      deployment: publicKeys,
      activation: publicKeys,
      operator: publicKeys,
      evidence: publicKeys,
    },
  };
}
export function fixtureInstall(
  time: number,
  { id, key }: ReturnType<typeof fixtureKeys>["deviceKey"],
) {
  const app = newStudioApplication("fixture-app", "Training station", "operator");
  const manifest: ReleaseManifest = {
    version: 1,
    id: "fixture-release-1",
    siteId: fixtureContext.siteId,
    kind: "operator",
    studio: { workspace: "studio", revision: 1, appId: app.id },
    compatibility: {
      runtime: 1,
      os: "linux",
      architectures: ["amd64", "arm64"],
      displays: ["panel"],
      peripherals: [],
      signals: [],
      commandPolicies: [],
    },
    dependencies: [],
    validationDigest: hashContent(app),
    approvalEvidence: ["isolated-fixture"],
    publishedAt: time,
    stateSchema: "studio-1",
    rollbackFromSchemas: [],
    offlinePolicy: app.offlinePolicy,
    maximumOfflineMs: 0,
    application: app,
  };
  const release = signEnvelope("release", id, key, manifest);
  const deployment: Deployment = {
    version: 1,
    id: "fixture-rollout-1",
    generation: 1,
    nodeId: fixtureContext.nodeId,
    context: fixtureContext,
    assignment: {
      id: "fixture-assignment-1",
      siteId: fixtureContext.siteId,
      nodeId: fixtureContext.nodeId,
      kind: "operator",
      selector: { terminalId: fixtureContext.terminalId },
      releaseId: manifest.id,
      releaseDigest: release.contentDigest,
      configRevision: "fixture-config-1",
      configuration: {},
      secretReferences: [],
      effectiveFrom: time,
      effectiveUntil: null,
    },
    issuedAt: time,
    expiresAt: time + 60_000,
  };
  return {
    release,
    deployment: signEnvelope("deployment", id, key, deployment),
    activation: signEnvelope("activation", id, key, {
      version: 1,
      id: "fixture-activate-1",
      deploymentId: deployment.id,
      nodeId: fixtureContext.nodeId,
      siteId: fixtureContext.siteId,
      releaseDigest: release.contentDigest,
      action: "activate",
      issuedAt: time,
      expiresAt: time + 60_000,
    }),
  };
}
