import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync, createPublicKey, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureCapabilities } from "../edge/fixture";
import { validatePackagedApplication } from "../src/lib/edge/application";
import { assignmentSchema } from "../src/lib/edge/assignment";
import { acceptReadback, evaluateTarget } from "../src/lib/edge/fleet.server";
import { releaseManifestSchema, type Activation, type Deployment } from "../src/lib/edge/protocol";
import { signEnvelope, verifyEnvelope } from "../src/lib/edge/signature.server";

const [artifactPath, issuerPublicPath, binaryPath = ".output/edge/service.mjs", assignmentPath] =
  process.argv.slice(2);
if (!artifactPath || !issuerPublicPath) {
  process.stderr.write(
    "Usage: bun run scripts/edge-local-acceptance.ts <fixture-artifact.json> <fixture-release.pub> [edge service.mjs] [recorded-assignment.json]\n",
  );
  process.exit(1);
}

const issuerPem = await readFile(issuerPublicPath, "utf8");
const release = verifyEnvelope(
  "release",
  JSON.parse(await readFile(artifactPath, "utf8")),
  releaseManifestSchema,
  new Map([["ems-fixture", createPublicKey(issuerPem)]]),
);
assert.ok(
  ["training-north", "training-south"].includes(release.value.siteId),
  "Use a local EMS training artifact",
);
validatePackagedApplication(release.value);

const scratch = await mkdtemp(join(tmpdir(), "ems-edge-acceptance-"));
try {
  const siteId = release.value.siteId;
  const nodeId = "local-acceptance-node";
  const context = {
    siteId,
    nodeId,
    lineId: "acceptance-line",
    stationId: "acceptance-station",
    terminalId: "acceptance-terminal",
  };
  const capabilities = { ...fixtureCapabilities(), nodeId };
  const device = generateKeyPairSync("ed25519");
  const deployer = generateKeyPairSync("ed25519");
  const approver = generateKeyPairSync("ed25519");
  const operator = generateKeyPairSync("ed25519");
  const acknowledger = generateKeyPairSync("ed25519");
  const pem = (value: typeof device) => value.publicKey.export({ type: "spki", format: "pem" });
  const files = {
    configuration: join(scratch, "config.json"),
    device: join(scratch, "device.pem"),
    token: join(scratch, "token"),
  };
  const token = randomBytes(32).toString("base64url");
  await Promise.all([
    writeFile(
      files.configuration,
      JSON.stringify({
        context,
        capabilities,
        deviceKeyId: "local-device",
        keys: {
          release: { "ems-fixture": issuerPem },
          deployment: { "local-deployer": pem(deployer) },
          activation: { "local-approver": pem(approver) },
          operator: { "local-operator": pem(operator) },
          evidence: { "local-receipt": pem(acknowledger) },
        },
      }),
      { mode: 0o600 },
    ),
    writeFile(files.device, device.privateKey.export({ type: "pkcs8", format: "pem" }), {
      mode: 0o600,
    }),
    writeFile(files.token, token, { mode: 0o600 }),
  ]);

  const child = spawn("node", [binaryPath], {
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      EMS_EDGE_HOST: "127.0.0.1",
      EMS_EDGE_PORT: "0",
      EMS_EDGE_STATE_DIR: scratch,
      EMS_EDGE_CONFIG_FILE: files.configuration,
      EMS_EDGE_DEVICE_KEY_FILE: files.device,
      EMS_EDGE_ADMIN_TOKEN_FILE: files.token,
    },
  });
  try {
    const port = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Edge readiness timed out")), 10_000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Edge exited early (${code})`));
      });
      child.stdout.on("data", (chunk: Buffer) => {
        const match = chunk.toString("utf8").match(/EMS edge listening on 127\.0\.0\.1:(\d+)/);
        if (match?.[1]) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    const http = (path: string, init?: RequestInit) =>
      fetch(origin + path, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
    assert.equal((await http("/v1/readback")).status, 401);
    const now = Date.now();
    const recorded = assignmentPath
      ? assignmentSchema.parse(JSON.parse(await readFile(assignmentPath, "utf8")))
      : null;
    if (recorded) {
      assert.equal(recorded.siteId, siteId);
      assert.equal(recorded.nodeId, nodeId);
      assert.equal(recorded.kind, release.value.kind);
      assert.equal(recorded.releaseId, release.value.id);
      assert.equal(recorded.releaseDigest, release.contentDigest);
      assert.deepEqual(recorded.secretReferences, []);
      assert.deepEqual(recorded.configuration, {});
      assert.ok(
        recorded.effectiveFrom <= now &&
          (recorded.effectiveUntil === null || now < recorded.effectiveUntil),
        "Recorded assignment is outside its effective interval",
      );
    }
    const target = {
      kind: release.value.kind,
      nodeId,
      siteId,
      deploymentId: randomUUID(),
      releaseDigest: release.contentDigest,
      configRevision: recorded?.configRevision ?? "acceptance-config",
    };
    const deployment: Deployment = {
      version: 1,
      id: target.deploymentId,
      generation: 1,
      nodeId,
      context,
      assignment: recorded ?? {
        id: randomUUID(),
        siteId,
        nodeId,
        kind: release.value.kind,
        selector: {
          lineId: context.lineId,
          stationId: context.stationId,
          terminalId: context.terminalId,
        },
        releaseId: release.value.id,
        releaseDigest: release.contentDigest,
        configRevision: target.configRevision,
        configuration: {},
        secretReferences: [],
        effectiveFrom: now,
        effectiveUntil: null,
      },
      issuedAt: now,
      expiresAt: now + 60_000,
    };
    const decision: Activation = {
      version: 1,
      id: randomUUID(),
      nodeId,
      siteId,
      deploymentId: deployment.id,
      releaseDigest: release.contentDigest,
      action: "activate",
      issuedAt: now,
      expiresAt: now + 60_000,
    };
    const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
    const stage = await http("/v1/stage", {
      method: "POST",
      headers,
      body: JSON.stringify({
        release,
        deployment: signEnvelope("deployment", "local-deployer", deployer.privateKey, deployment),
      }),
    });
    assert.deepEqual(await stage.json(), { status: "STAGED" });
    const activate = await http("/v1/activate", {
      method: "POST",
      headers,
      body: JSON.stringify(
        signEnvelope("activation", "local-approver", approver.privateKey, decision),
      ),
    });
    assert.deepEqual(await activate.json(), { status: "ACTIVE" });
    const incoming = await (await http("/v1/readback", { headers })).json();
    const receipt = acceptReadback({
      enrollment: { siteId, nodeId, keyId: "local-device", key: device.publicKey, revoked: false },
      incoming,
      previous: undefined,
      now: Date.now(),
    });
    assert.equal(evaluateTarget(target, receipt.value, Date.now()).outcome, "active");
    const kiosk = (await (await http(`/api/player?kind=${release.value.kind}`)).json()) as {
      active: { releaseDigest: string; configRevision: string };
    };
    assert.equal(kiosk.active.releaseDigest, release.contentDigest);
    assert.equal(kiosk.active.configRevision, target.configRevision);
    process.stdout.write(
      `Node activation readback verified for ${siteId}/${release.value.id} ${release.contentDigest} (fixture assignment ${deployment.assignment.id})\n`,
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const ended = new Promise<void>((resolve) => child.once("close", () => resolve()));
      child.kill("SIGTERM");
      await ended;
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
