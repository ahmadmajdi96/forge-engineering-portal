import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { assignmentSchema, type Assignment } from "../../src/lib/edge/assignment";
import type { ReleaseManifest } from "../../src/lib/edge/protocol";
import type { Signed } from "../../src/lib/edge/signature.server";

const origin = process.env["EMS_SMOKE_ORIGIN"] ?? "http://127.0.0.1:8088";
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Use a local EMS fixture endpoint");
const artifactPath = process.argv[2] ?? ".ems/fixture-acceptance-release.json";
const output = process.argv[3];
const release = JSON.parse(readFileSync(artifactPath, "utf8")) as Signed<ReleaseManifest>;
assert.equal(release.keyId, "ems-fixture", "Use the local training artifact");
assert.equal(release.value.siteId, "training-north", "Use a Training Factory North artifact");
const settings = Object.fromEntries(
  readFileSync(".ems/runtime.env", "utf8")
    .trim()
    .split("\n")
    .map((entry) => {
      const i = entry.indexOf("=");
      return [entry.slice(0, i), entry.slice(i + 1)];
    }),
);
const path = "/api/ems/assignments";
const north = release.value.siteId;
const south = "training-south";
const nodeId = "local-acceptance-node";
const terminalId = "acceptance-terminal";
const kind = release.value.kind;

async function session(key: string) {
  const token = settings[key];
  assert(token, "Fixture credential is missing");
  const response = await fetch(origin + "/api/ems/auth/fixture", {
    method: "POST",
    headers: { origin },
    redirect: "manual",
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 303, "Local fixture sign-in");
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert(typeof cookie === "string" && cookie.startsWith("ems_session="));
  return cookie;
}

const [author, reviewer, restricted] = await Promise.all([
  session("EMS_FIXTURE_AUTHOR_TOKEN"),
  session("EMS_FIXTURE_REVIEWER_TOKEN"),
  session("EMS_FIXTURE_SINGLE_SITE_TOKEN"),
]);

const request = (url: string, cookie: string, body?: unknown, requestOrigin = origin) =>
  fetch(origin + url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie,
      ...(body === undefined ? {} : { origin: requestOrigin, "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
const assertStatus = async (promise: Promise<Response>, status: number) => {
  const response = await promise;
  assert.equal(response.status, status, JSON.stringify(response.ok ? {} : await response.json()));
  return response;
};

await assertStatus(request(`${path}?site=${north}`, ""), 401);
await assertStatus(request(`${path}?site=${south}`, restricted), 403);
const records: Assignment[] = [];
let after: string | null = null;
do {
  const url = new URLSearchParams({ site: north, ...(after ? { after } : {}) });
  const result = (await (await assertStatus(request(`${path}?${url}`, author), 200)).json()) as {
    assignments: Assignment[];
    next: string | null;
  };
  records.push(...result.assignments);
  after = result.next;
} while (after);
const now = Date.now();
const scoped = records.filter((record) => record.kind === kind && record.nodeId === nodeId);
const overlap = scoped.some(
  ({ effectiveFrom, effectiveUntil }) =>
    effectiveFrom < now + 120_000 && (effectiveUntil === null || effectiveUntil > now - 1_000),
);
const earliest = Math.min(now, ...scoped.map(({ effectiveFrom }) => effectiveFrom));
const from = overlap ? earliest - 120_000 : now - 1_000;
const until = overlap ? earliest : now + 120_000;
assert.ok(from >= 0, "Use freshly seeded fixture data");
const base = {
  site: north,
  nodeId,
  kind,
  releaseId: release.value.id,
  configRevision: "acceptance-config",
  selectors: ["lineId", "stationId", "terminalId"],
  effectiveFrom: from,
  effectiveUntil: until,
  reason: "Local assignment acceptance",
};
const assignmentCommand = (extra: object = {}) => ({ ...base, id: randomUUID(), ...extra });
await assertStatus(request(path, reviewer, assignmentCommand()), 403);
await assertStatus(request(path, author, assignmentCommand({ site: south })), 404);
await assertStatus(request(path, author, assignmentCommand(), "https://untrusted.invalid"), 403);
const writes = await Promise.all([
  request(path, author, assignmentCommand()),
  request(path, author, assignmentCommand()),
]);
assert.deepEqual(writes.map(({ status }) => status).sort(), [200, 409]);
const query = new URLSearchParams({ site: north, terminalId, kind, at: String(from + 1) });
const resolution = (await (
  await assertStatus(request(`${path}?${query}`, reviewer), 200)
).json()) as {
  status: string;
  assignment: unknown;
  target: { nodeId: string; terminalId: string };
};
assert.equal(resolution.status, "resolved");
const selected = assignmentSchema.parse(resolution.assignment);
assert.equal(selected.releaseDigest, release.contentDigest);
assert.equal(selected.configRevision, base.configRevision);
assert.equal(resolution.target.nodeId, nodeId);
assert.equal(resolution.target.terminalId, terminalId);

if (output) {
  const effective = scoped.find(
    (record) =>
      record.releaseDigest === release.contentDigest &&
      record.effectiveFrom <= now &&
      (record.effectiveUntil === null || now < record.effectiveUntil),
  );
  if (overlap && !effective)
    throw new Error(
      "A different effective fixture blocks live activation of this package; assignment HTTP checks passed.",
    );
  writeFileSync(output, JSON.stringify(effective ?? selected) + "\n", { mode: 0o600 });
}
process.stdout.write(
  "Assignment HTTP acceptance passed: persistence, cross-site denial, reviewer denial, concurrent conflict and terminal resolution.\n",
);
