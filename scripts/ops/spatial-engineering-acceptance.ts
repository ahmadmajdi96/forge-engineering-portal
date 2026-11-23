// Run against a freshly migrated local fixture database. Writes only after confirming empty heads.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fixtureSignIn } from "../../src/lib/production/auth.server";
import { readWorkspace, writeWorkspace } from "../../src/lib/production/workspace.server";
import { makeModel } from "../../src/lib/engineering/model";
import { archiveHardware } from "../../src/lib/engineering/hardware-lifecycle";
import {
  createOccurrence,
  createSpace,
  emptySpatialDocument,
  origin,
  spatialDocumentSchema,
} from "../../src/lib/spatial/model";

const site = "training-north";
const database = process.env["EMS_SPATIAL_TEST_DATABASE"];
if (
  !database ||
  process.env["EMS_MODE"] !== "local" ||
  !new URL(database).pathname.startsWith("/ems_spatial_test_")
)
  throw Error("Use a disposable ems_spatial_test_ database in local fixture mode.");
process.env["EMS_DATABASE_URL"] = database;
process.env["EMS_PUBLIC_ORIGIN"] = "http://127.0.0.1:8088";
process.env["EMS_FIXTURE_AUTHOR_TOKEN"] = randomBytes(32).toString("hex");
process.env["EMS_FIXTURE_REVIEWER_TOKEN"] = randomBytes(32).toString("hex");
const originUrl = process.env["EMS_PUBLIC_ORIGIN"];
async function signIn(token: string) {
  const response = await fixtureSignIn(
    new Request(originUrl, {
      method: "POST",
      headers: { origin: originUrl, accept: "application/json" },
      body: new URLSearchParams({ token }),
    }),
  );
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return new Request(originUrl, { method: "POST", headers: { origin: originUrl, cookie } });
}
const author = await signIn(process.env["EMS_FIXTURE_AUTHOR_TOKEN"]);
const reviewer = await signIn(process.env["EMS_FIXTURE_REVIEWER_TOKEN"]);
const save = (
  workspace: "spatial" | "engineering",
  expected: number,
  payload: unknown,
  actor = author,
) =>
  writeWorkspace(actor, {
    site,
    workspace,
    expected,
    payload,
    reason: "Disposable placement acceptance scenario",
  });
const read = (workspace: "spatial" | "engineering") => readWorkspace(author, { site, workspace });
assert.equal((await read("spatial")).revision, 0);
assert.equal((await read("engineering")).revision, 0);
const model = makeModel();
model.lines = model.lines.slice(0, 1);
const station = model.stations.find((item) => item.id === "ST-104")!;
model.stations = [{ ...station, equipment: ["MD-104"], app: "", operation: "" }];
const asset = model.records.find((item) => item.id === "MD-104" && item.kind === "equipment")!;
model.records = [{ ...asset, value: "LAB-15031" }];
model.signals = [];
model.appWorkflows = {};
model.steps = [];
model.routeEdges = [];
const engineering = (current: typeof model) => ({ model: current, lifecycle: "Draft" });
await save("engineering", 0, engineering(model));
const layout = emptySpatialDocument(site);
const building = createSpace(layout.spaces[1]!, "Fixture building");
const floor = createSpace(building, "Fixture floor");
const area = createSpace(floor, "Fixture area");
const line = { ...createSpace(area, "Fixture line"), engineeringId: model.lines[0]!.id };
const placeStation = { ...createSpace(line, "Fixture station"), engineeringId: station.id };
layout.spaces.push(building, floor, area, line, placeStation);
const placement = createOccurrence(layout.catalog[0]!, placeStation.id, origin);
layout.occurrences.push(placement);
placement.asset = { system: "EMS", kind: "equipment", id: "wrong-id", exclusive: true };
await assert.rejects(save("spatial", 0, layout), /unavailable in the selected site or parent/);
placement.asset.id = asset.id;
await assert.rejects(save("spatial", 0, layout, reviewer), /not granted/);
await save("spatial", 0, layout);
const archived = archiveHardware(model, model.records[0]!);
await assert.rejects(
  save("engineering", 1, engineering(archived)),
  /saved layout placement still references/,
);
await assert.rejects(save("spatial", 0, layout), /newer revision/);
placement.position.x = 5;
await save("spatial", 1, layout);
const before = spatialDocumentSchema.parse((await read("spatial")).payload);
assert.deepEqual(before.occurrences[0]!.asset, placement.asset);
assert.equal(before.occurrences[0]!.position.x, 5);
assert.equal((await read("engineering")).revision, 1);
placement.asset = null;
await save("spatial", 2, layout);
const races = await Promise.allSettled([
  save("spatial", 3, before),
  save("engineering", 1, engineering(archived)),
]);
assert.equal(races.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(
  races.filter(
    (result) =>
      result.status === "rejected" &&
      /unavailable in the selected site or parent|saved layout placement still references/.test(
        String(result.reason),
      ),
  ).length,
  1,
);
console.log(
  "Passed canonical site linkage, denied mutation, save/reload, archive protection, stale revision and concurrent cross-workspace write checks.",
);
