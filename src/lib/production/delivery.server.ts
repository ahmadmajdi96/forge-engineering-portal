import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { siteKey } from "./contracts";
import { database, EmsError, hash, mode } from "./db.server";

const consumers = ["PLMS", "MES", "RMS", "QMS", "APS", "OMS", "WMS", "CMMS"] as const;
const consumerName = z.enum(consumers);
type Consumer = (typeof consumers)[number];
const hmacKey = (key?: string) =>
  typeof key === "string" && /^[a-f0-9]{64}$/i.test(key) ? Buffer.from(key, "hex") : null;

export function configuredConsumers(): Consumer[] {
  if (mode() !== "production" || process.env["EMS_PUBLISHERS_ENABLED"] !== "true") return [];
  const optedIn = new Set((process.env["EMS_INTEGRATION_CONSUMERS"] ?? "").split(","));
  return consumers.filter((name) => optedIn.has(name) && !!peerConfig(name));
}

function peerConfig(name: Consumer) {
  const endpoint = process.env[`EMS_PEER_${name}_ENDPOINT`];
  const auth = process.env[`EMS_PEER_${name}_TOKEN`];
  const ackKey = hmacKey(process.env[`EMS_PEER_${name}_ACK_KEY`]);
  if (!endpoint || !auth || !ackKey) return null;
  const url = URL.parse(endpoint);
  if (
    url?.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname === "/"
  )
    return null;
  return { url, auth, ackKey };
}

type Outbox = {
  event_id: string;
  site: string;
  release_id: string;
  content_hash: string;
  consumer: Consumer;
  attempts: number;
};

export async function dispatchBatch() {
  const sql = database();
  const enabled = configuredConsumers();
  if (!enabled.length) return 0;
  const maximumAttempts = 8;
  await sql`update ems.outbox set send_state = 'dead', last_error = 'Attempt limit reached; last delivery unknown',
    lease_id = null, lease_until = null
    where consumer = any(${enabled}) and send_state = 'pending' and attempts >= ${maximumAttempts}
      and (lease_until is null or lease_until <= now())`;
  const lease = randomUUID();
  const rows = await sql<Outbox[]>`
    with candidate as (
      select event_id from ems.outbox
      where consumer = any(${enabled}) and send_state = 'pending' and attempts < ${maximumAttempts}
        and next_attempt_at <= now() and (lease_until is null or lease_until <= now())
      order by next_attempt_at, created_at, event_id
      limit 10 for update skip locked
    )
    update ems.outbox o set lease_id = ${lease}, lease_until = now() + interval '30 seconds', attempts = attempts + 1
    from candidate c where c.event_id = o.event_id
    returning o.event_id, o.site, o.release_id, o.content_hash, o.consumer, o.attempts`;
  await Promise.all(
    rows.map(async (row) => {
      const peer = peerConfig(row.consumer);
      let error = "Transport unavailable";
      try {
        if (!peer) throw new Error("Transport disabled");
        const response = await fetch(peer.url, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(7000),
          headers: {
            authorization: "Bearer " + peer.auth,
            "content-type": "application/json",
            "idempotency-key": row.event_id,
          },
          body: JSON.stringify({
            version: 2,
            type: "EngineeringAppPublished",
            event_id: row.event_id,
            site: row.site,
            release_id: row.release_id,
            content_hash: row.content_hash,
            consumer: row.consumer,
          }),
        });
        error = response.ok ? "" : "HTTP " + response.status;
        await response.body?.cancel();
      } catch {
        // Keep network diagnostics free of remote payloads and credentials.
      }
      const state = !error ? "sent" : row.attempts >= maximumAttempts ? "dead" : "pending";
      await sql`update ems.outbox set send_state = ${state}, last_error = ${error || null},
      lease_id = null, lease_until = null, next_attempt_at = now() + (${Math.min(3600, 5 * 2 ** row.attempts)} * interval '1 second')
      where event_id = ${row.event_id} and lease_id = ${lease}`;
    }),
  );
  return rows.length;
}

const acknowledgement = z
  .object({
    version: z.literal(2),
    consumer: consumerName,
    acknowledgement_id: z.string().uuid(),
    event_id: z.string().uuid(),
    release_id: z.string().uuid(),
    site: siteKey,
    content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["accepted", "rejected"]),
    reason: z.string().max(500).optional(),
  })
  .strict();

async function boundedBody(request: Request) {
  if (!request.body) throw new EmsError(400, "Missing acknowledgement.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      throw new EmsError(413, "Acknowledgement is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function receiveAcknowledgement(request: Request) {
  const parsedConsumer = consumerName.safeParse(request.headers.get("x-ems-consumer"));
  if (!parsedConsumer.success || !configuredConsumers().includes(parsedConsumer.data))
    throw new EmsError(401, "Unknown integration sender.");
  const consumer = parsedConsumer.data;
  const peer = peerConfig(consumer);
  const signature = request.headers.get("x-ems-signature") ?? "";
  const timestamp = request.headers.get("x-ems-timestamp") ?? "";
  if (
    !peer ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300
  )
    throw new EmsError(401, "Invalid acknowledgement authentication.");
  const bytes = await boundedBody(request);
  const expected = createHmac("sha256", peer.ackKey)
    .update(`EMS-ACK-v2\n${consumer}\n${timestamp}\n`)
    .update(bytes)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new EmsError(401, "Invalid acknowledgement authentication.");
  let body: z.infer<typeof acknowledgement>;
  try {
    body = acknowledgement.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    throw new EmsError(400, "Invalid acknowledgement.");
  }
  if (body.consumer !== consumer) throw new EmsError(401, "Acknowledgement sender mismatch.");
  const bodyHash = hash(bytes.toString("utf8"));
  const status = await database().begin(async (tx) => {
    const [event] = await tx<(Outbox & { business_state: string })[]>`
      select consumer, site, release_id, content_hash, business_state from ems.outbox where event_id = ${body.event_id} for update`;
    if (
      !event ||
      event.consumer !== consumer ||
      event.site !== body.site ||
      event.release_id !== body.release_id ||
      event.content_hash !== body.content_hash
    )
      throw new EmsError(409, "Acknowledgement binding does not match the published event.");
    const [duplicate] = await tx<{ body_hash: string }[]>`select body_hash from ems.inbox
      where consumer = ${consumer} and acknowledgement_id = ${body.acknowledgement_id}`;
    if (duplicate) {
      if (duplicate.body_hash === bodyHash && event.business_state === body.decision)
        return "duplicate";
      throw new EmsError(409, "Acknowledgement identifier was used for different content.");
    }
    if (event.business_state !== "pending")
      throw new EmsError(409, "An acknowledgement has already finalized this event.");
    const inserted =
      await tx`insert into ems.inbox (consumer, acknowledgement_id, event_id, body_hash, decision, reason)
      values (${consumer}, ${body.acknowledgement_id}, ${body.event_id}, ${bodyHash}, ${body.decision}, ${body.reason ?? null})
      on conflict do nothing returning event_id`;
    if (inserted.length !== 1)
      throw new EmsError(409, "Acknowledgement conflicts with prior evidence.");
    const changed = await tx`update ems.outbox set business_state = ${body.decision}
      where event_id = ${body.event_id} and business_state = 'pending' returning event_id`;
    if (changed.length !== 1) throw new EmsError(409, "Acknowledgement could not be applied.");
    return "recorded";
  });
  return Response.json({ status }, { headers: { "cache-control": "no-store" } });
}
