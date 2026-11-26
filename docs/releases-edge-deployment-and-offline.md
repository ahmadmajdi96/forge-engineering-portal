# Release packages, edge deployments and offline evidence

EMS Studio definitions compile through the same `compileApplication` validator in authoring, package staging, and the kiosk. Node installation receives the signed release and the signed deployment choice. A separately signed activation approval pins the deployment, release digest, device, scope, action and validity window. Publisher, deployment, activation, actor grant, receipt and device readback purposes have distinct signature domains and separately provisioned verification maps. See [edge control API](api/edge-control.openapi.json) and the exact [protocol schemas](../src/lib/edge/protocol.ts).

The version 1 wire envelope carries `keyId`, `contentDigest`, `signature`, and `value`. Canonical JSON sorts property names by UTF-16 code unit, uses JavaScript JSON number/string encoding, and preserves array order. The SHA-256 digest is lowercase hexadecimal. Ed25519 signing input is UTF-8 `ManuQube EMS edge v1\n<purpose>\n<keyId>\n<contentDigest>`. Signature encoding is unpadded base64url. The verifier checks both raw and parsed canonical values. Keep trusted keys by purpose and retain an overlap window during publisher-key rotation. An unenrolled key, wrong purpose, altered content, invalid Studio graph, incompatible runtime, missing requirements, or wrong target prevents staging.

## Device service

The Node service and the browser kiosk are independent of the EMS web process. Bun builds the service and browser bundle from the locked dependency tree. The container runs as the non-root Node user. The edge daemon stores its enrolled context, signing identity, slot state, runs and evidence in SQLite under `/data`. Transactions use WAL with full synchronization. Preserve the database and companion WAL files via a supported consistent backup method. Preserve device key recovery separately. Deployments in this implementation move through authenticated verification and staging in one transaction. The device tracks operator and HMI slots separately.

| State             | Device evidence                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN`         | The slot has no installed package.                                                                                                                                              |
| `STAGED`          | Signed package and assigned target passed the node checks. Activation authority is separate.                                                                                    |
| `DEFERRED`        | A valid approval encountered active work. New runs pause during the approval window.                                                                                            |
| `ACTIVE`          | Persistent slot pointer changed atomically at the run boundary.                                                                                                                 |
| `HEALTH_VERIFIED` | The local runtime supplied the exact active digest to the health method. Fleet treats the authenticated digest, deployment ID and configuration revision as independent checks. |
| `ROLLED_BACK`     | A separate signed approval selected the previous compatible release.                                                                                                            |

A rollout uses a monotonically increasing generation per slot. Idempotent retries cannot change a generation's signed deployment, and late generations cannot replace newer state. After a successful activation, the previous release remains available subject to assignment validity and persistent state compatibility. Schema changes fail closed because migration execution is unavailable. A deferred approval must be retried before expiry. It does not auto-activate on restart. Readback contains an increasing sequence, node/site, observed and pending release/configuration identity, runs in progress, and pending evidence count. Server consumers must bind the registered public key to enrollment, reject revoked or stale receipts, and retain the last sequence durably. The rollout planner advances a broader wave only after all designated canaries report health for their exact package. Sent offers occupy concurrency slots until health is verified. A confirmed failure stops new offers while preserving the separate outcomes for deferred or unreachable nodes. The current planner requires a coordinator to persist and transmit offers. A signature proves which device reported the state. Readback does not prove physical installation or partner acceptance.

### Local fixture

```sh
./scripts/build-edge.sh
EMS_EDGE_FIXTURE=1 EMS_EDGE_STATE_DIR="$(mktemp -d)" node .output/edge/service.mjs
```

Open `http://127.0.0.1:3100/` for the kiosk simulation. `GET /health` reports `fixture: true`; `GET /api/player` exposes the seeded signed application and revision metadata. Fixture mode generates a distinct development key locally, seeds a synthetic terminal and rejects all control-route requests. It has no enterprise transport or hardware side effects. The service has no default production device credentials.

Provisioned mode binds loopback and accepts control requests carrying a strong local transport token. Supply `EMS_EDGE_CONFIG_FILE`, `EMS_EDGE_DEVICE_KEY_FILE`, and `EMS_EDGE_ADMIN_TOKEN_FILE` as protected runtime file paths. Configuration maps the exact `context`, `capabilities` and `deviceKeyId`, and contains PEM public keys grouped as `release`, `deployment`, `activation`, `operator`, and `evidence`. The separate private PEM key signs node readback. Production key rotation, device re-enrollment and access from another host require an authorized enrollment owner and an authenticated transport integration. The provisioned kiosk displays verified content read-only. AMS operator sign-in and an approved session bridge must bind actuation or evidence to human identity.

## Offline evidence and commands

The internal evidence API enforces the signed actor, pinned deployment, evidence category, assignment expiry, quality validity and bounded offline grant window. A persistent high-water timestamp rejects clock regression over 30 seconds; sites need trusted time synchronization. Evidence writes preserve source/receipt time, identity, order, record digest, release and configuration revision. Stable IDs are replay-safe for identical content; changing content under an accepted ID fails. A configured unsynced-queue limit stops new capture under backpressure. Evidence stays pending across restart until a signed matching receipt binds scope, event and record digest to the acknowledged content. The current local implementation has no remote evidence uploader, attachment transfer, receipt retention policy or production AMS session bridge. A downstream peer still needs durable independent idempotency.

Semantic signal contracts model source, address reference, units, scaling, quality, and freshness. Unknown, bad, stale and unavailable samples have distinct outcomes. The pure command contract distinguishes accepted, executed, rejected and uncertain outcomes. After uncertainty, only verified reconciliation may change the final state. No hardware adapter, alarm acknowledgement path or outbound command execution is installed. PLC/controller authority and commissioning sign-off stay with their owning systems.

## Verification and production gates

The edge suite runs with Node 22+ and verifies assignment conflict behavior, signed package and purpose verification, wrong-target rejection, v1 run pinning while v2 waits, restart recovery, persistent state compatibility, receipt binding, queue backpressure and identity/clock checks. The compiled loopback Node fixture was checked for health, kiosk payload, unauthenticated control rejection and stable digest after restart. Linux image builds, fleet scheduling integration and device rotation, remote sign-in and interoperability, disk-full and physical power interruption, downstream delivery, field hardware/PLC tests, and authorized commissioning remain separate verification items. Node tests do not establish physical installation, actual actuation or hosted deployment.

## Cross-service fixture acceptance

Publish a local Studio app using the separate author/reviewer fixture accounts. Download the signed package from Factory releases. Record an effective assignment under **Assignments**, resolve it against the synthetic fixture terminal and download its assignment JSON. Verify the exact package/assignment on a temporary isolated node:

```sh
./scripts/build-edge.sh
bun run scripts/edge-local-acceptance.ts <fixture-release.json> .ems/fixture-release.pub .output/edge/service.mjs <recorded-assignment.json>
```

The command uses ephemeral device, deployment and activation keys distinct from the EMS fixture publisher. It provisions a loopback-only appliance, stages and activates the package via its protected API, then validates independently signed device readback and kiosk content against the selected release and configuration. It deletes only its own temporary appliance data. The recorded JSON is a local testing input and carries no production authorization. Omitting the assignment file exercises the appliance using a generated synthetic assignment.

This path passed for the HTTP-authored package `5e19d4dd-a5b4-46ef-b937-4407229feb76` and the persisted PostgreSQL assignment `871994ce-e363-4735-822e-1035fa586031` in `training-north`. Node readback and kiosk returned release digest `2ebf18c03d4ae934be176179dd7f3b9d401cf73097f829f0d3720db8f2c01ce4`.
