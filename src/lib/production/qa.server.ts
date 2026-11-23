import { createPrivateKey, createPublicKey } from "node:crypto";
import { releaseManifestSchema } from "@/lib/edge/protocol";
import { verifyEnvelope } from "@/lib/edge/signature.server";
import { requirePermission } from "./auth.server";
import { qaPermission } from "./contracts";
import { database, mode } from "./db.server";

type Status = "pass" | "fail" | "blocked" | "not-run" | "unknown" | "stale";
type Check = { name: string; status: Status; evidence: string; checkedAt: string };
export type QaReport = {
  environment: string;
  sourceRevision: string | null;
  imageDigest: string | null;
  checks: Check[];
};

const expectedMigrations = [
  "0001_factory.sql",
  "0002_release_delivery.sql",
  "0003_evidence.sql",
  "0004_assignments.sql",
];

function verifyLatestSignature(
  site: string,
  record: { id: string; artifact: unknown } | undefined,
): { status: Status; evidence: string } {
  if (!record) return { status: "not-run", evidence: "No published release in this site." };
  const publicKey = process.env["EMS_RELEASE_PUBLIC_KEY_BASE64"];
  const privateFixture = mode() === "local" ? process.env["EMS_RELEASE_KEY_BASE64"] : undefined;
  if (!publicKey && !privateFixture)
    return { status: "unknown", evidence: "No deployment verification key is configured." };
  try {
    const key = publicKey
      ? createPublicKey(Buffer.from(publicKey, "base64"))
      : createPublicKey(createPrivateKey(Buffer.from(privateFixture!, "base64")));
    const keyId = process.env["EMS_RELEASE_KEY_ID"] ?? "ems-fixture";
    const envelope = verifyEnvelope(
      "release",
      record.artifact,
      releaseManifestSchema,
      new Map([[keyId, key]]),
    );
    if (envelope.value.siteId !== site || envelope.value.id !== record.id)
      throw new Error("Package scope differs");
    return { status: "pass", evidence: "Verified latest package " + envelope.contentDigest };
  } catch {
    return { status: "fail", evidence: "Latest package failed signature or scope verification." };
  }
}

export async function qaReport(request: Request, site: string): Promise<QaReport> {
  const { actor } = await requirePermission(request, site, qaPermission);
  const checkedAt = new Date().toISOString();
  const check = (name: string, status: Status, evidence: string): Check => ({
    name,
    status,
    evidence,
    checkedAt,
  });
  const sql = database();
  const [[migrations], workspaces, delivery, [worker], [deployments], releases, [latestPackage]] =
    await Promise.all([
      sql<
        { versions: string[] }[]
      >`select array_agg(name order by name) versions from public.ems_migration_ledger`,
      sql<
        { key: string; head: number; digest: string | null }[]
      >`select w.key, w.head, r.digest from ems.workspaces w
      left join ems.revisions r on r.site = w.site and r.workspace = w.key and r.revision = w.head where w.site = ${site}`,
      sql<{ consumer: string; send_state: string; business_state: string; count: number }[]>`
      select consumer, send_state, business_state, count(*)::int count from ems.outbox where site = ${site} group by 1, 2, 3 order by 1, 2, 3`,
      sql<
        { state: string; checked_at: Date }[]
      >`select state, checked_at from ems.worker_heartbeat where service = 'delivery'`,
      sql<
        { count: number }[]
      >`select count(*)::int count from ems.deployment_readbacks where site = ${site}`,
      sql<
        { status: string; count: number }[]
      >`select status, count(*)::int count from ems.releases where site = ${site} group by status`,
      sql<
        { id: string; artifact: unknown }[]
      >`select id, artifact from ems.releases where site = ${site}
        and status = 'published' order by published_at desc, id limit 1`,
    ]);
  await sql`insert into ems.audit (site, actor, action, object_key, reason)
    values (${site}, ${actor}, 'qa.view', 'admin-qa', 'Read-only diagnostics viewed')`;
  const runtime = mode();
  const sourceRevision = /^[a-f0-9]{40}$/.test(process.env["EMS_SOURCE_REVISION"] ?? "")
    ? process.env["EMS_SOURCE_REVISION"]!
    : null;
  const imageDigest = /^sha256:[a-f0-9]{64}$/.test(process.env["EMS_IMAGE_DIGEST"] ?? "")
    ? process.env["EMS_IMAGE_DIGEST"]!
    : null;
  const signature = verifyLatestSignature(site, latestPackage);
  const checks = [
    check(
      "Release identity",
      "unknown",
      sourceRevision && imageDigest
        ? "Image identity was supplied by the deployment. Compare it with the orchestrator."
        : "Build commit or image digest is unavailable.",
    ),
    check(
      "Identity and site action",
      "pass",
      runtime === "local"
        ? "Server-managed fixture grant for this site."
        : "AMS resolved the exact site-scoped QA action.",
    ),
    check(
      "Database and migrations",
      expectedMigrations.every((name) => migrations?.versions?.includes(name)) ? "pass" : "fail",
      (migrations?.versions ?? []).join(", ") || "Missing migration evidence.",
    ),
    check(
      "Artifact storage",
      "not-run",
      "Database-backed packages and bounded layout imports are enabled. No independent artifact retrieval check was registered.",
    ),
    ...(["spatial", "studio", "process"] as const).map((name) => {
      const record = workspaces.find((workspace) => workspace.key === name);
      return check(
        name === "spatial"
          ? "Spatial revision"
          : name === "studio"
            ? "Studio revision"
            : "Process revision",
        record?.digest ? "pass" : record ? "fail" : "not-run",
        record?.digest
          ? `Revision ${record.head} · ${record.digest}`
          : "No committed revision found.",
      );
    }),
    check(
      "Release signatures",
      signature.status,
      [signature.evidence, ...releases.map(({ status, count }) => `${status} ${count}`)].join(
        " · ",
      ),
    ),
    worker
      ? {
          ...check(
            "Delivery worker",
            Date.now() - worker.checked_at.valueOf() > 45_000
              ? "stale"
              : worker.state === "error"
                ? "fail"
                : "pass",
            worker.state,
          ),
          checkedAt: worker.checked_at.toISOString(),
        }
      : check("Delivery worker", "unknown", "No worker heartbeat."),
    ...delivery.map((item) =>
      check(
        item.consumer,
        item.send_state === "dead" || item.business_state === "rejected"
          ? "fail"
          : item.business_state === "accepted"
            ? "pass"
            : "unknown",
        `${item.count} event(s). Delivery ${item.send_state}. Adoption ${item.business_state}.`,
      ),
    ),
    check(
      "Partner adoption",
      delivery.length ? "unknown" : "blocked",
      delivery.length
        ? "Review individual partner outcomes."
        : "No verified partner exchange on this site.",
    ),
    check(
      "Assignment and edge readback",
      (deployments?.count ?? 0) ? "unknown" : "not-run",
      `${deployments?.count ?? 0} authenticated readback records.`,
    ),
    check(
      "Offline queue and command outcomes",
      "unknown",
      "No device evidence in the factory control plane.",
    ),
    check("Physical commissioning", "blocked", "Site commissioning evidence is required."),
    check(
      "Backup and restore",
      "not-run",
      "No restore evidence is registered for this environment.",
    ),
  ];
  return { environment: runtime, sourceRevision, imageDigest, checks };
}
