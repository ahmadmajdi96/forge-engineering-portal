import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { database, EmsError } from "../../src/lib/production/db.server";
import { dispatchBatch, receiveAcknowledgement } from "../../src/lib/production/delivery.server";

const url = process.env["EMS_RESTORE_TEST_DATABASE_URL"];
assert(
  url && /^postgres:\/\/[^@]+@127\.0\.0\.1:\d+\/ems_restore(?:_test)?$/.test(url),
  "Use an isolated loopback restore named ems_restore or ems_restore_test.",
);
process.env["EMS_DATABASE_URL"] = url;
process.env["EMS_MODE"] = "production";
process.env["EMS_PUBLISHERS_ENABLED"] = "true";
process.env["EMS_INTEGRATION_CONSUMERS"] = "MES,PLMS";
const keys = { MES: randomBytes(32), PLMS: randomBytes(32) };
for (const [name, key] of Object.entries(keys)) {
  process.env[`EMS_PEER_${name}_ENDPOINT`] = "https://ems.fixture.invalid/events";
  process.env[`EMS_PEER_${name}_TOKEN`] = "fixture-transport-is-disabled";
  process.env[`EMS_PEER_${name}_ACK_KEY`] = key.toString("hex");
}
const sql = database();
const event = randomUUID();
try {
  const [release] = await sql<{ id: string; digest: string }[]>`
    select id, artifact->>'contentDigest' as digest from ems.releases
    where site = 'training-north' and status = 'published' order by created_at desc limit 1`;
  assert(release);
  await sql`insert into ems.outbox (event_id, site, consumer, release_id, content_hash)
    values (${event}, 'training-north', 'MES', ${release.id}, ${release.digest})`;

  const base = {
    version: 2,
    consumer: "MES",
    event_id: event,
    acknowledgement_id: randomUUID(),
    release_id: release.id,
    site: "training-north",
    content_hash: release.digest,
    decision: "accepted",
  };
  const signed = (payload = base, sender: keyof typeof keys = "MES", ageSeconds = 0) => {
    const timestamp = String(Math.floor(Date.now() / 1000) - ageSeconds);
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", keys[sender])
      .update(`EMS-ACK-v2\n${sender}\n${timestamp}\n${body}`)
      .digest("hex");
    return new Request("https://ems.fixture.invalid/api/public/integrations/ack", {
      method: "POST",
      body,
      headers: {
        "x-ems-consumer": sender,
        "x-ems-timestamp": timestamp,
        "x-ems-signature": signature,
      },
    });
  };
  const fails = (status: number) => (error: unknown) =>
    error instanceof EmsError && error.status === status;
  await assert.rejects(receiveAcknowledgement(signed(base, "PLMS")), fails(401));
  await assert.rejects(receiveAcknowledgement(signed(base, "MES", 301)), fails(401));
  await assert.rejects(
    receiveAcknowledgement(signed({ ...base, content_hash: "a".repeat(64) })),
    fails(409),
  );
  // Force the second write to fail and verify rollback of the first.
  await sql.unsafe(`create function ems.fixture_fail_ack() returns trigger language plpgsql as
    $$ begin if new.event_id = '${event}'::uuid then raise exception 'fixture forced rollback'; end if; return new; end $$`);
  await sql.unsafe(
    "create trigger ems_fixture_fail_ack before update on ems.outbox for each row execute function ems.fixture_fail_ack()",
  );
  try {
    await assert.rejects(receiveAcknowledgement(signed()));
    const [result] = await sql<
      { total: number }[]
    >`select count(*)::int as total from ems.inbox where event_id = ${event}`;
    assert.equal(result?.total, 0);
  } finally {
    await sql.unsafe(
      "drop trigger ems_fixture_fail_ack on ems.outbox; drop function ems.fixture_fail_ack()",
    );
  }

  const responses = await Promise.all([
    receiveAcknowledgement(signed()),
    receiveAcknowledgement(signed()),
  ]);
  assert.deepEqual(
    (await Promise.all(responses.map(async (response) => (await response.json()).status))).sort(),
    ["duplicate", "recorded"],
  );
  await assert.rejects(
    receiveAcknowledgement(signed({ ...base, decision: "rejected" })),
    fails(409),
  );
  const [outcome] = await sql<{ send_state: string; business_state: string }[]>`
    select send_state, business_state from ems.outbox where event_id = ${event}`;
  assert.deepEqual(outcome, { send_state: "pending", business_state: "accepted" });
  const [others] = await sql<{ total: number }[]>`select count(*)::int as total from ems.outbox
    where event_id <> ${event} and consumer in ('MES','PLMS') and send_state = 'pending'`;
  assert.equal(others?.total, 0, "Retry-bound check needs a restore without other pending events.");
  await sql`update ems.outbox set attempts = 8, lease_until = now() - interval '1 second', lease_id = ${randomUUID()} where event_id = ${event}`;
  assert.equal(await dispatchBatch(), 0);
  const [exhausted] = await sql<
    { send_state: string; attempts: number }[]
  >`select send_state, attempts from ems.outbox where event_id = ${event}`;
  assert.deepEqual(exhausted, { send_state: "dead", attempts: 8 });
  console.log(
    "Acknowledgement acceptance passed: signed binding, expiry, impersonation, atomic rollback, replay, distinct outcomes, and exhausted lease recovery.",
  );
} finally {
  await sql`delete from ems.inbox where event_id = ${event}`;
  await sql`delete from ems.outbox where event_id = ${event}`;
  await sql.end();
}
