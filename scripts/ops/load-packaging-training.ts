// Run against an empty local training-south site. A retry may resume an exact example.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import example from "../../docs/factory-engineering/packaging-training.json";
const site = "training-south";
const origin = new URL(process.env["EMS_SMOKE_ORIGIN"] ?? "http://127.0.0.1:8088");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) && origin.protocol === "http:",
  "Choose the loopback training server.",
);
const token =
  process.env["EMS_FIXTURE_AUTHOR_TOKEN"] ??
  /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(await readFile(".ems/runtime.env", "utf8"))?.[1];
assert(token, "A local fixture author token is required.");
const login = await fetch(new URL("/api/ems/auth/fixture", origin), {
  method: "POST",
  headers: { origin: origin.origin },
  body: new URLSearchParams({ token }),
  redirect: "manual",
});
assert.equal(login.status, 303, "Fixture sign-in failed.");
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert(cookie);
const headers = { origin: origin.origin, cookie, "content-type": "application/json" };
const pending: (keyof typeof example)[] = [];
const endpoint = new URL("/api/ems/workspace", origin);
for (const workspace of ["engineering", "studio", "spatial", "process"] as const) {
  const read = new URL(endpoint);
  read.search = new URLSearchParams({ site, workspace }).toString();
  const response = await fetch(read, { headers, redirect: "error" });
  assert.equal(response.status, 200);
  const { revision, payload } = await response.json();
  if (!revision) pending.push(workspace);
  else
    assert(
      isDeepStrictEqual(payload, example[workspace]),
      "Existing " +
        workspace +
        " records differ from the example. Use a separate fixture database.",
    );
}
for (const workspace of pending) {
  const response = await fetch(endpoint, {
    method: "PUT",
    headers,
    redirect: "error",
    body: JSON.stringify({
      site,
      workspace,
      payload: example[workspace],
      expected: 0,
      reason: "Install packaging training example",
    }),
  });
  if (!response.ok)
    throw Error(workspace + " failed (" + response.status + "): " + (await response.text()));
}
console.log(
  "Packaging training example verified at",
  new URL(
    "/factory-process?site=training-south&engLine=PACK-A&routeId=pack-route&stepId=weigh",
    origin,
  ).href,
);
