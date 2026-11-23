# EMS operations

## Environments

The native local fixture listens on loopback. The private Compose database network contains PostgreSQL and a one-shot migration service. The same pinned Node image runs web and delivery with separate PostgreSQL identities. The fixture worker has only an internal network. Configure allowlisted egress for any independently verified production peer. The kiosk profile uses its own volume and network. The production host and release mechanism must be confirmed independently of AMS account access.

Use Docker Compose v2, Bun 1.4.4, Node 22.22.1 and OpenSSL.

```sh
./scripts/bootstrap-local.sh
docker compose up --build -d --wait
./scripts/smoke-test.sh
docker compose --profile edge-test up --build -d
docker compose logs --tail=100
```

Keep `.ems/` private. Production uses a secret manager and configured HTTPS ingress. Use runtime-injected `EMS_MODE=production`, `EMS_PUBLIC_ORIGIN`, `EMS_DATABASE_URL`, `EMS_SESSION_KEY` (32-byte hex), `EMS_AMS_ISSUER`, `EMS_AMS_CLIENT_ID`, and `EMS_AMS_CLIENT_SECRET`. Keep fixture credentials and keys out of production. Publish source revision and verified OCI image digest separately. Provision `ems.sites` with authoritative AMS UUIDs and require exact supported actions.

## Migration, backup and restore

The fixture migration runner serializes migrations with an advisory lock and checks committed SHA-256 before applying each transactional file. It uses a privileged provisioner. Runtime users can append revisions and audit entries without modifying history. Preserve the Drizzle SQL 0000–0002 and apply the sandbox boundary migration through its existing migration process. The native schema has a distinct ledger. The legacy archive remains readable through its historical environment pending approved crosswalk and migration.

```sh
./scripts/backup.sh .ems/factory.dump
./scripts/restore-isolated.sh .ems/factory.dump
```

The native database contains bounded source and derivative model metadata, signed artifacts, audit, and delivery state. A separate secure backup must cover device SQLite state, enrollment keys and signing-key recovery references, runtime secret references, ingress/release inventory and any attached external artifact store. Backups contain sensitive EMS data. Limit access and encrypt off-host copies.

Use a fresh database for restore. The restore script runs PostgreSQL with Docker networking disabled. Inspect ledger checksums, revision hashes, package signatures, assignment intervals and head references before reconciliation. Preserve outbound IDs. Disable delivery and device control until pending events, edge run pins and uncertain commands are reconciled with their owners. Re-enroll or rotate credentials if their provenance changed.

To exercise the isolated acceptance flow:

```sh
EMS_TEST_FIXTURES=1 ./scripts/smoke-test.sh
bun run scripts/ops/assignment-acceptance.ts .ems/fixture-acceptance-release.json .ems/fixture-acceptance-assignment.json
./scripts/build-edge.sh
bun run scripts/edge-local-acceptance.ts .ems/fixture-acceptance-release.json .ems/fixture-release.pub .output/edge/service.mjs .ems/fixture-acceptance-assignment.json
```

Use a fresh fixture state for an immediately effective acceptance assignment. An existing overlapping assignment must remain intact.

## Production rollout

Resolve the authorized EMS application origin, runtime namespace and workloads, release owner, registry, database, storage, identity client and HTTPS ingress. Establish an isolated restore drill and a source/digest mapping. Verify the approved AMS callback and action catalog. Apply immutable migrations through the installed release runner, then deploy the app and delivery worker by digest through the existing mechanism. Use a targeted scripted preflight against that mapping.

Verify HTTPS, read-only readiness, source/OCI identity, AMS login, scope/action denial, artifacts, queue health, and the protected Admin QA. Keep other publishers and shared workloads untouched. Roll back to a known image only while database and artifact schemas are compatible. Keep release and command evidence available for reconciliation.
