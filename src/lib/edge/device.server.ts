import { createPublicKey, type KeyObject } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  applicationKind,
  compatibilityIssues,
  nodeCapabilitiesSchema,
  resolveAssignment,
  targetContextSchema,
  type AppKind,
  type NodeCapabilities,
  type TargetContext,
} from "./assignment";
import {
  activationSchema,
  deploymentSchema,
  evidenceAckSchema,
  evidenceSchema,
  releaseManifestSchema,
  runGrantSchema,
  type Activation,
  type Deployment,
  type DeviceReadback,
  type Evidence,
  type ReleaseManifest,
  type RunGrant,
  maximumReleaseBytes,
} from "./protocol";
import {
  hashContent,
  signEnvelope,
  verifyEnvelope,
  type Signed,
  type VerificationKeys,
} from "./signature.server";

const kinds = applicationKind.options;
const clockSkewMs = 30_000;

type Install = {
  deployment: Signed<Deployment>;
  release: Signed<ReleaseManifest>;
};
type Slot = {
  status: DeviceReadback["slots"][number]["status"];
  generation: number;
  attempted: string | null;
  drainUntil: number | null;
  pending: Install | null;
  active: Install | null;
  previous: Install | null;
};
type Run = {
  grant: RunGrant;
  assignmentId: string;
  configRevision: string;
  effectiveUntil: number | null;
  offlinePolicy: ReleaseManifest["offlinePolicy"];
  maximumOfflineMs: number;
  startedAt: number;
  endedAt: number | null;
};
type EvidenceRecord = {
  event: Evidence;
  sequence: number;
  receivedAt: number;
  actor: string;
  siteId: string;
  nodeId: string;
  releaseDigest: string;
  configRevision: string;
};
type State = {
  observedAt: number;
  sequence: number;
  evidenceSequence: number;
  slots: Record<AppKind, Slot>;
};
type DeviceOptions = {
  path: string;
  context: TargetContext;
  capabilities: NodeCapabilities;
  keys: Record<"release" | "deployment" | "activation" | "operator" | "evidence", VerificationKeys>;
  deviceKey: { id: string; key: KeyObject };
  validateApplication: (manifest: ReleaseManifest) => void;
  maximumQueuedEvidence?: number;
  now?: () => number;
};

function emptySlot(): Slot {
  return {
    status: "UNKNOWN",
    generation: 0,
    attempted: null,
    drainUntil: null,
    pending: null,
    active: null,
    previous: null,
  };
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function fresh(document: { issuedAt: number; expiresAt: number }, now: number) {
  assert(
    document.issuedAt <= now + clockSkewMs && now < document.expiresAt,
    "Signed authorization is expired or future-dated",
  );
}
function assignmentEffective(install: Install, now: number) {
  const { effectiveFrom, effectiveUntil } = install.deployment.value.assignment;
  return effectiveFrom <= now && (effectiveUntil === null || now < effectiveUntil);
}
function assigned(install: Install, now: number) {
  assert(assignmentEffective(install, now), "Assignment is outside its effective interval");
}
function matchesNode(device: TargetContext, offer: TargetContext) {
  return (
    device.siteId === offer.siteId &&
    device.nodeId === offer.nodeId &&
    device.lineId === offer.lineId &&
    device.stationId === offer.stationId &&
    device.terminalId === offer.terminalId &&
    (!device.machineId || device.machineId === offer.machineId)
  );
}

export class EdgeDevice {
  private readonly database: DatabaseSync;
  private readonly maximumQueuedEvidence: number;

  constructor(private readonly options: DeviceOptions) {
    const context = targetContextSchema.parse(options.context);
    const capabilities = nodeCapabilitiesSchema.parse(options.capabilities);
    assert(context.nodeId === capabilities.nodeId, "Node identity and capabilities do not match");
    assert(
      options.deviceKey.key.type === "private" &&
        options.deviceKey.key.asymmetricKeyType === "ed25519",
      "Device readback requires an Ed25519 private key",
    );
    this.maximumQueuedEvidence = options.maximumQueuedEvidence ?? 5_000;
    assert(
      Number.isInteger(this.maximumQueuedEvidence) &&
        this.maximumQueuedEvidence > 0 &&
        this.maximumQueuedEvidence <= 20_000,
      "Invalid evidence queue capacity",
    );
    this.database = new DatabaseSync(options.path);
    try {
      this.database.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS device_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runtime_identity (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS consumed_authority (id TEXT PRIMARY KEY, digest TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, ended INTEGER, value TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS open_runs ON runs (kind) WHERE ended IS NULL;
        CREATE TABLE IF NOT EXISTS evidence (
          id TEXT PRIMARY KEY, digest TEXT NOT NULL, sequence INTEGER NOT NULL UNIQUE, value TEXT NOT NULL, acknowledgement TEXT
        );
      `);
      const initial: State = {
        observedAt: 0,
        sequence: 0,
        evidenceSequence: 0,
        slots: { operator: emptySlot(), hmi: emptySlot() },
      };
      this.database
        .prepare("INSERT OR IGNORE INTO device_state VALUES (1, ?)")
        .run(JSON.stringify(initial));
      const identity = hashContent({
        context,
        deviceKeyId: options.deviceKey.id,
        key: createPublicKey(options.deviceKey.key).export({ format: "pem", type: "spki" }),
      });
      this.database.prepare("INSERT OR IGNORE INTO runtime_identity VALUES (1, ?)").run(identity);
      assert(
        this.database.prepare("SELECT value FROM runtime_identity WHERE singleton = 1").get()?.[
          "value"
        ] === identity,
        "State volume was enrolled to a different device or signing key",
      );
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  close() {
    this.database.close();
  }

  private read() {
    return JSON.parse(
      this.database.prepare("SELECT value FROM device_state WHERE singleton = 1").get()?.[
        "value"
      ] as string,
    ) as State;
  }

  private transact<T>(command: (state: State, now: number) => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const state = this.read();
      const now = this.options.now?.() ?? Date.now();
      assert(
        Number.isSafeInteger(now) && now >= 0 && now + clockSkewMs >= state.observedAt,
        "Clock regressed past permitted skew",
      );
      state.observedAt = Math.max(state.observedAt, now);
      for (const slot of Object.values(state.slots)) {
        if (slot.drainUntil !== null && state.observedAt >= slot.drainUntil) {
          slot.drainUntil = null;
          slot.status = slot.pending ? "STAGED" : slot.active ? "ACTIVE" : "UNKNOWN";
        }
      }
      const result = command(state, state.observedAt);
      this.database
        .prepare("UPDATE device_state SET value = ? WHERE singleton = 1")
        .run(JSON.stringify(state));
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private verifiedInstall(releaseInput: unknown, deploymentInput: unknown): Install {
    const release = verifyEnvelope(
      "release",
      releaseInput,
      releaseManifestSchema,
      this.options.keys.release,
    );
    const deployment = verifyEnvelope(
      "deployment",
      deploymentInput,
      deploymentSchema,
      this.options.keys.deployment,
    );
    const { context, assignment, nodeId } = deployment.value;
    assert(
      nodeId === this.options.context.nodeId && matchesNode(this.options.context, context),
      "Deployment targets a different node or context",
    );
    assert(
      Buffer.byteLength(JSON.stringify(release)) <= maximumReleaseBytes,
      "Release exceeds edge package byte limit",
    );
    this.options.validateApplication(release.value);
    const issues = compatibilityIssues(release.value.compatibility, this.options.capabilities);
    assert(!issues.length, `Release is incompatible: ${issues.join("; ")}`);
    assert(
      release.value.id === assignment.releaseId &&
        release.contentDigest === assignment.releaseDigest,
      "Assignment does not pin this package",
    );
    return { release, deployment };
  }

  stage(releaseInput: unknown, deploymentInput: unknown) {
    const install = this.verifiedInstall(releaseInput, deploymentInput);
    const { deployment, release } = install;
    return this.transact((state, now) => {
      fresh(deployment.value, now);
      assert(release.value.publishedAt <= now + clockSkewMs, "Release timestamp is future-dated");
      const { assignment, context, generation, id } = deployment.value;
      const slot = state.slots[assignment.kind];
      const resolution = resolveAssignment({
        assignments: [assignment],
        releases: [{ contentDigest: release.contentDigest, manifest: release.value }],
        context,
        node: this.options.capabilities,
        kind: assignment.kind,
        at: now,
      });
      if (resolution.status !== "resolved")
        throw new Error(`Deployment rejected: ${resolution.issues.join("; ")}`);
      if (generation === slot.generation) {
        const existing = slot.pending ?? slot.active;
        assert(
          existing?.deployment.contentDigest === deployment.contentDigest,
          "Deployment generation was already used",
        );
        return slot.status;
      }
      assert(generation > slot.generation, "Stale deployment generation");
      assert(
        ![slot.pending, slot.active, slot.previous].some(
          (existing) => existing?.deployment.value.id === id,
        ),
        "Deployment ID was already used",
      );
      slot.pending = install;
      slot.generation = generation;
      slot.attempted = id;
      slot.status = "STAGED";
      slot.drainUntil = null;
      return slot.status;
    });
  }

  private inFlight(kind: AppKind) {
    return this.database
      .prepare("SELECT count(*) AS n FROM runs WHERE kind = ? AND ended IS NULL")
      .get(kind)?.["n"] as number;
  }

  private consume(type: string, id: string, digest: string, expiresAt: number, now: number) {
    this.database.prepare("DELETE FROM consumed_authority WHERE expires <= ?").run(now);
    const claimed = this.database
      .prepare("INSERT OR IGNORE INTO consumed_authority VALUES (?, ?, ?)")
      .run(`${type}:${id}`, digest, expiresAt);
    if (claimed.changes === 1) return;
    const previous = this.database
      .prepare("SELECT digest FROM consumed_authority WHERE id = ?")
      .get(`${type}:${id}`);
    assert(
      previous?.["digest"] === digest,
      "Authorization identifier was reused for different content",
    );
    throw new Error("Signed authorization has already been consumed");
  }

  activate(input: unknown) {
    const decision = verifyEnvelope(
      "activation",
      input,
      activationSchema,
      this.options.keys.activation,
    );
    return this.transact((state, now) => {
      const action = decision.value;
      fresh(action, now);
      assert(
        action.siteId === this.options.context.siteId &&
          action.nodeId === this.options.context.nodeId,
        "Activation targets a different node",
      );
      const consumed = this.database
        .prepare("SELECT digest FROM consumed_authority WHERE id = ?")
        .get(`activation:${action.id}`);
      if (consumed) {
        assert(
          consumed["digest"] === decision.contentDigest,
          "Activation identifier was reused for different content",
        );
        const active = kinds
          .map((kind) => state.slots[kind])
          .find(
            (slot) =>
              slot.active?.deployment.value.id === action.deploymentId &&
              slot.active?.release.contentDigest === action.releaseDigest,
          );
        assert(active, "Signed activation was superseded");
        return action.action === "rollback" ? "ROLLED_BACK" : "ACTIVE";
      }
      const installFor = (slot: Slot) =>
        action.action === "activate" ? slot.pending : slot.previous;
      const kind = kinds.find(
        (key) => installFor(state.slots[key])?.deployment.value.id === action.deploymentId,
      );
      assert(kind, "Requested deployment is unavailable");
      const slot = state.slots[kind];
      const target = installFor(slot)!;
      this.verifiedInstall(target.release, target.deployment);
      assert(
        action.releaseDigest === target.release.contentDigest,
        "Activation pins a different package",
      );
      assigned(target, now);
      if (action.action === "activate") {
        fresh(target.deployment.value, now);
        assert(
          !slot.active ||
            slot.active.release.value.stateSchema === target.release.value.stateSchema,
          "Unimplemented persistent state migration",
        );
      } else {
        assert(
          slot.active &&
            !slot.pending &&
            (slot.active.release.value.stateSchema === target.release.value.stateSchema ||
              target.release.value.rollbackFromSchemas.includes(
                slot.active.release.value.stateSchema,
              )),
          "Rollback cannot accept current persistent state",
        );
      }
      if (this.inFlight(kind)) {
        slot.status = "DEFERRED";
        slot.drainUntil = action.expiresAt;
        return slot.status;
      }
      this.consume("activation", action.id, decision.contentDigest, action.expiresAt, now);
      if (action.action === "activate") {
        slot.previous = slot.active;
        slot.pending = null;
      } else {
        slot.previous = null;
      }
      slot.active = target;
      slot.drainUntil = null;
      slot.attempted = target.deployment.value.id;
      slot.status = action.action === "activate" ? "ACTIVE" : "ROLLED_BACK";
      return slot.status;
    });
  }

  verifyHealth(kind: AppKind, observedDigest: string) {
    return this.transact((state, now) => {
      const slot = state.slots[kind];
      assert(
        slot.active && slot.active.release.contentDigest === observedDigest,
        "Health check has no matching active release",
      );
      assigned(slot.active, now);
      this.verifiedInstall(slot.active.release, slot.active.deployment);
      if (!slot.pending) slot.status = "HEALTH_VERIFIED";
      return slot.status;
    });
  }

  activeApplication(kind: AppKind) {
    const slot = this.read().slots[kind];
    if (!slot.active) return null;
    const now = this.options.now?.() ?? Date.now();
    assigned(slot.active, now);
    const { release, deployment } = this.verifiedInstall(
      slot.active.release,
      slot.active.deployment,
    );
    return {
      definition: release.value.application,
      releaseId: release.value.id,
      releaseDigest: release.contentDigest,
      configRevision: deployment.value.assignment.configRevision,
    };
  }

  private findRun(id: string) {
    const row = this.database.prepare("SELECT value FROM runs WHERE id = ?").get(id);
    assert(row, "Unknown runtime run");
    return JSON.parse(row["value"] as string) as Run;
  }

  private checkGrant(run: Run, now: number) {
    fresh(run.grant, now);
    assert(now < run.grant.qualityValidUntil, "Quality policy evidence is stale");
    assert(
      run.effectiveUntil === null || now < run.effectiveUntil,
      "Assignment is outside its effective interval",
    );
    assert(run.endedAt === null, "Runtime run already ended");
    if (run.grant.authorization === "offline") {
      assert(
        run.offlinePolicy === "bounded-offline" &&
          now - run.grant.issuedAt < run.maximumOfflineMs &&
          run.grant.expiresAt - run.grant.issuedAt <= run.maximumOfflineMs,
        "Release does not authorize this offline action window",
      );
    }
  }

  startRun(input: unknown) {
    const signed = verifyEnvelope("run-grant", input, runGrantSchema, this.options.keys.operator);
    const grant = signed.value;
    return this.transact((state, now) => {
      assert(
        grant.siteId === this.options.context.siteId &&
          grant.nodeId === this.options.context.nodeId,
        "Operator authorization targets a different node",
      );
      const slot = state.slots[grant.kind];
      const install = slot.active;
      assert(
        install &&
          install.deployment.value.id === grant.deploymentId &&
          install.release.contentDigest === grant.releaseDigest,
        "Operator authorization does not pin the active assignment",
      );
      this.verifiedInstall(install.release, install.deployment);
      assigned(install, now);
      assert(
        slot.status !== "DEFERRED" && slot.status !== "ACTIVATION_PENDING",
        "Deployment is draining; new work is paused",
      );
      assert(this.inFlight(grant.kind) < 32, "Runtime slot reached its maximum concurrent runs");
      const {
        id: assignmentId,
        configRevision,
        effectiveUntil,
      } = install.deployment.value.assignment;
      const { offlinePolicy, maximumOfflineMs } = install.release.value;
      const run: Run = {
        grant,
        assignmentId,
        configRevision,
        effectiveUntil,
        offlinePolicy,
        maximumOfflineMs,
        startedAt: now,
        endedAt: null,
      };
      this.checkGrant(run, now);
      this.consume("run", grant.id, signed.contentDigest, grant.expiresAt, now);
      this.database
        .prepare("INSERT INTO runs (id, kind, value) VALUES (?, ?, ?)")
        .run(grant.id, grant.kind, JSON.stringify(run));
      return {
        runId: grant.id,
        releaseDigest: install.release.contentDigest,
        configuration: install.deployment.value.assignment.configRevision,
      };
    });
  }

  appendEvidence(input: unknown, authorizedActor: string, connection: "online" | "offline") {
    const event = evidenceSchema.parse(input);
    const eventDigest = hashContent(event);
    return this.transact((state, now) => {
      const run = this.findRun(event.runId);
      assert(run.grant.actor === authorizedActor, "Evidence actor does not own this run");
      const previouslyAccepted = this.database
        .prepare("SELECT digest, value FROM evidence WHERE id = ?")
        .get(event.id);
      if (previouslyAccepted) {
        assert(
          previouslyAccepted["digest"] === eventDigest,
          "Evidence identifier conflicts with prior content",
        );
        return JSON.parse(previouslyAccepted["value"] as string) as EvidenceRecord;
      }
      this.checkGrant(run, now);
      assert(
        connection === "online" || run.grant.authorization === "offline",
        "Online authorization is required to capture this evidence",
      );
      assert(
        run.grant.allowedEvidence.includes(event.category),
        "Operator authorization does not allow this evidence category",
      );
      assert(
        event.observedAt + clockSkewMs >= run.startedAt && event.observedAt <= now + clockSkewMs,
        "Observation timestamp is outside its accepted range",
      );
      const queued = this.database
        .prepare("SELECT count(*) AS n FROM evidence WHERE acknowledgement IS NULL")
        .get()?.["n"] as number;
      assert(queued < this.maximumQueuedEvidence, "Evidence queue is full; capture paused");
      const record: EvidenceRecord = {
        event,
        sequence: ++state.evidenceSequence,
        receivedAt: now,
        actor: run.grant.actor,
        siteId: run.grant.siteId,
        nodeId: run.grant.nodeId,
        releaseDigest: run.grant.releaseDigest,
        configRevision: run.configRevision,
      };
      this.database
        .prepare("INSERT INTO evidence (id, digest, sequence, value) VALUES (?, ?, ?, ?)")
        .run(event.id, eventDigest, record.sequence, JSON.stringify(record));
      return record;
    });
  }

  pendingEvidence() {
    return this.database
      .prepare(
        "SELECT value FROM evidence WHERE acknowledgement IS NULL ORDER BY sequence LIMIT 100",
      )
      .all()
      .map((row) => JSON.parse(row["value"] as string) as EvidenceRecord)
      .map((value) => ({ value, digest: hashContent(value) }));
  }

  acknowledgeEvidence(input: unknown) {
    const signed = verifyEnvelope(
      "evidence-ack",
      input,
      evidenceAckSchema,
      this.options.keys.evidence,
    );
    return this.transact((_state, now) => {
      const { evidenceId, evidenceDigest, nodeId, siteId, receivedAt } = signed.value;
      assert(
        nodeId === this.options.context.nodeId &&
          siteId === this.options.context.siteId &&
          receivedAt <= now + clockSkewMs,
        "Receipt scope or time does not match",
      );
      const row = this.database
        .prepare("SELECT value, acknowledgement FROM evidence WHERE id = ?")
        .get(evidenceId);
      assert(row, "Receipt has no matching evidence");
      const record = JSON.parse(row["value"] as string) as EvidenceRecord;
      assert(
        evidenceDigest === hashContent(record) && receivedAt >= record.receivedAt - clockSkewMs,
        "Receipt does not match queued evidence",
      );
      if (row["acknowledgement"]) return "duplicate";
      this.database
        .prepare("UPDATE evidence SET acknowledgement = ? WHERE id = ?")
        .run(JSON.stringify(signed), evidenceId);
      return "acknowledged";
    });
  }

  finishRun(id: string, authorizedActor: string) {
    return this.transact((_state, now) => {
      const run = this.findRun(id);
      assert(run.grant.actor === authorizedActor, "Actor does not own this run");
      if (run.endedAt !== null) return run.endedAt;
      run.endedAt = now;
      this.database
        .prepare("UPDATE runs SET ended = ?, value = ? WHERE id = ?")
        .run(now, JSON.stringify(run), id);
      return now;
    });
  }

  readback() {
    return this.transact((state, now) => {
      const value: DeviceReadback = {
        version: 1,
        siteId: this.options.context.siteId,
        nodeId: this.options.context.nodeId,
        sequence: ++state.sequence,
        observedAt: now,
        slots: kinds.map((kind) => {
          const slot = state.slots[kind];
          return {
            kind,
            status:
              (slot.active && !assignmentEffective(slot.active, now)) ||
              (slot.pending &&
                (now >= slot.pending.deployment.value.expiresAt ||
                  !assignmentEffective(slot.pending, now)))
                ? "STALE"
                : slot.status,
            deploymentId: slot.attempted,
            activeDeploymentId: slot.active?.deployment.value.id ?? null,
            activeReleaseDigest: slot.active?.release.contentDigest ?? null,
            pendingReleaseDigest: slot.pending?.release.contentDigest ?? null,
            activeConfigRevision: slot.active?.deployment.value.assignment.configRevision ?? null,
            inFlightRuns: this.inFlight(kind),
          };
        }),
        unsyncedEvidence: this.database
          .prepare("SELECT count(*) AS n FROM evidence WHERE acknowledgement IS NULL")
          .get()?.["n"] as number,
      };
      return signEnvelope("readback", this.options.deviceKey.id, this.options.deviceKey.key, value);
    });
  }
}
