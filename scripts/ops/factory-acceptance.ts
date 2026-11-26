import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicKey, randomUUID } from "node:crypto";
import { newStudioApplication, studioWorkspaceSchema } from "../../src/lib/studio/model";
import {
  createOccurrence,
  createSpace,
  emptySpatialDocument,
  spatialDocumentSchema,
} from "../../src/lib/spatial/model";
import { verifyEnvelope } from "../../src/lib/edge/signature.server";
import { releaseManifestSchema } from "../../src/lib/edge/protocol";

const origin = process.env["EMS_SMOKE_ORIGIN"] ?? "http://127.0.0.1:8088";
const settings = Object.fromEntries(
  readFileSync(".ems/runtime.env", "utf8")
    .trim()
    .split("\n")
    .map((entry) => {
      const i = entry.indexOf("=");
      return [entry.slice(0, i), entry.slice(i + 1)];
    }),
);
const north = "training-north";
const south = "training-south";
const id = randomUUID();

async function session(key: string) {
  const secret = settings[key];
  assert(secret, "Fixture credential is missing");
  const response = await fetch(origin + "/api/ems/auth/fixture", {
    method: "POST",
    headers: { origin },
    redirect: "manual",
    body: new URLSearchParams({ token: secret }),
  });
  assert.equal(response.status, 303, "Local fixture sign-in");
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert(cookie?.startsWith("ems_session="));
  return cookie!;
}

async function api<T>(
  path: string,
  cookie: string,
  status: number,
  request?: { method: string; body: unknown; origin?: string },
) {
  const response = await fetch(origin + path, {
    method: request?.method ?? "GET",
    headers: {
      cookie,
      ...(request ? { origin: request.origin ?? origin, "content-type": "application/json" } : {}),
    },
    ...(request ? { body: JSON.stringify(request.body) } : {}),
  });
  const body = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(response.ok ? {} : body));
  return body as T;
}

const getWorkspace = (site: string, workspace: string, cookie: string) =>
  api<{ revision: number; payload: unknown }>(
    `/api/ems/workspace?site=${site}&workspace=${workspace}`,
    cookie,
    200,
  );
const putWorkspace = (site: string, workspace: string, expected: number, payload: unknown) => ({
  method: "PUT",
  body: { site, workspace, expected, payload, reason: "Factory acceptance check" },
});
const releaseCommand = (body: object) => ({
  method: "POST",
  body: { site: north, reason: "Fixture release verification", ...body },
});

const [author, reviewer, restricted] = await Promise.all([
  session("EMS_FIXTURE_AUTHOR_TOKEN"),
  session("EMS_FIXTURE_REVIEWER_TOKEN"),
  session("EMS_FIXTURE_SINGLE_SITE_TOKEN"),
]);

await api("/api/ems/qa?site=" + north, "", 401);
await api("/api/ems/qa?site=" + south, restricted, 403);
await api("/api/ems/workspace?site=" + south + "&workspace=spatial", restricted, 403);
const southBefore = await getWorkspace(south, "spatial", author);
for (const site of [north, south]) {
  const current = await getWorkspace(site, "spatial", author);
  const spatial = emptySpatialDocument(site);
  let parent = spatial.spaces[1]!;
  for (const name of [
    "Building A",
    "Ground Floor",
    "Production Area",
    "Line A",
    "Filling Station",
  ]) {
    parent = createSpace(parent, name);
    spatial.spaces.push(parent);
  }
  for (const [index, kind] of ["machine", "scanner", "terminal"].entries()) {
    const template = spatial.catalog.find((item) => item.kind === kind);
    assert(template, "Equipment template must exist");
    spatial.occurrences.push(
      createOccurrence(template, parent.id, { x: index * 4 + 3, y: 0, z: 3 }),
    );
  }
  await api("/api/ems/workspace", author, 403, {
    ...putWorkspace(site, "spatial", current.revision, spatial),
    origin: "https://untrusted.invalid",
  });
  await api(
    "/api/ems/workspace",
    author,
    200,
    putWorkspace(site, "spatial", current.revision, spatial),
  );
  const saved = await getWorkspace(site, "spatial", author);
  const savedSpatial = spatialDocumentSchema.parse(saved.payload);
  assert.equal(savedSpatial.occurrences.length, 3);
  assert.equal(savedSpatial.siteCode, site);
  if (site === north)
    assert.equal((await getWorkspace(south, "spatial", author)).revision, southBefore.revision);
  const route = await getWorkspace(site, "process", author);
  const process = {
    version: 1,
    routes: [
      {
        id,
        name: "Filling",
        start: "fill",
        product: null,
        recipe: null,
        steps: [
          {
            id: "fill",
            name: "Filling",
            stationIds: [parent.id],
            capabilities: [],
            evidence: [],
            expectedSeconds: 30,
            waitTimeoutSeconds: 90,
            outcome: "operation",
          },
          {
            id: "complete",
            name: "Complete",
            stationIds: [],
            capabilities: [],
            evidence: [],
            expectedSeconds: 0,
            waitTimeoutSeconds: null,
            outcome: "complete",
          },
          {
            id: "failure",
            name: "Failure",
            stationIds: [],
            capabilities: [],
            evidence: [],
            expectedSeconds: 0,
            waitTimeoutSeconds: null,
            outcome: "failed",
          },
        ],
        transitions: [
          { from: "fill", to: "complete", outcome: "success", condition: null, maxAttempts: null },
          { from: "fill", to: "failure", outcome: "failure", condition: null, maxAttempts: null },
        ],
      },
    ],
  };
  await api(
    "/api/ems/workspace",
    author,
    200,
    putWorkspace(site, "process", route.revision, process),
  );
}
const studio = await getWorkspace(north, "studio", author);
const app = newStudioApplication(id, "Fixture operator", "operator");
const hmi = newStudioApplication(randomUUID(), "Fixture HMI", "hmi");
hmi.offlinePolicy = "bounded-offline";
const northStudio = { version: 1, applications: [app, hmi] };
const command = putWorkspace(north, "studio", studio.revision, northStudio);
const concurrent = await Promise.all(
  [0, 1].map(async () =>
    fetch(origin + "/api/ems/workspace", {
      method: "PUT",
      headers: { origin, cookie: author, "content-type": "application/json" },
      body: JSON.stringify(command.body),
    }),
  ),
);
assert.deepEqual(
  concurrent.map((reply) => reply.status).sort(),
  [200, 409],
  await Promise.all(concurrent.map((reply) => reply.text())).then((items) => items.join("\n")),
);
const committed = await getWorkspace(north, "studio", author);
assert.deepEqual(
  studioWorkspaceSchema.parse(committed.payload).applications.map((item) => item.id),
  [app.id, hmi.id],
);
await api(
  "/api/ems/releases",
  author,
  409,
  releaseCommand({ action: "submit", app: hmi.id, revision: committed.revision }),
);
const { id: release } = await api<{ id: string }>(
  "/api/ems/releases",
  author,
  200,
  releaseCommand({ action: "submit", app: id, revision: committed.revision }),
);
await api(
  "/api/ems/releases",
  author,
  403,
  releaseCommand({ action: "approve", id: release, expected: "submitted" }),
);
await api(
  "/api/ems/releases",
  reviewer,
  200,
  releaseCommand({ action: "approve", id: release, expected: "submitted" }),
);
await api(
  "/api/ems/releases",
  reviewer,
  409,
  releaseCommand({ action: "approve", id: release, expected: "submitted" }),
);
await api(
  "/api/ems/releases",
  reviewer,
  200,
  releaseCommand({ action: "publish", id: release, expected: "approved" }),
);
await api(`/api/ems/artifact?site=${south}&id=${release}`, author, 404);
const signed = await api(`/api/ems/artifact?site=${north}&id=${release}`, author, 200);
const publicKey = createPublicKey(readFileSync(".ems/fixture-release.pub"));
const keys = new Map([["ems-fixture", publicKey]]);
const packageValue = verifyEnvelope("release", signed, releaseManifestSchema, keys);
assert.equal(packageValue.value.studio.appId, id);
assert.equal(packageValue.value.studio.revision, committed.revision);
assert.equal(packageValue.value.dependencies.length, 2);
assert.throws(() =>
  verifyEnvelope(
    "release",
    { ...packageValue, value: { ...packageValue.value, siteId: south } },
    releaseManifestSchema,
    keys,
  ),
);
const qa = await api<{ checks: { name: string; status: string }[] }>(
  "/api/ems/qa?site=" + north,
  author,
  200,
);
assert.equal(qa.checks.find((check) => check.name === "Database and migrations")?.status, "pass");
const output = process.env["EMS_FIXTURE_ARTIFACT"] ?? ".ems/fixture-acceptance-release.json";
writeFileSync(output, JSON.stringify(signed) + "\n", { mode: 0o600 });
console.log(
  "Factory acceptance passed: two scopes, concurrent saves, separate approvals, immutable signed package, and Admin QA.",
);
