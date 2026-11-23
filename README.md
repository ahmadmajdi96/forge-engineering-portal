# ManuQube EMS

Engineering Management System for factory layouts, process routes, station applications, release packages, and operator stations.

## Local factory workspace

Install Docker with Compose v2.24 or later, Bun 1.4.4, and OpenSSL. Run from a clean checkout.

```sh
./scripts/bootstrap-local.sh
docker compose up --build -d --wait
./scripts/smoke-test.sh
```

Open [EMS on loopback](http://127.0.0.1:8088/). Use `EMS_FIXTURE_AUTHOR_TOKEN` from the private `.ems/runtime.env` to sign into North or South. Use `EMS_FIXTURE_REVIEWER_TOKEN` in a separate browser session to approve and publish fixture releases. The restricted fixture is authorized only for North. Every local sign-in is backed by an expiring server session. Bootstrap creates credentials once and refuses to overwrite partial configuration.

```sh
EMS_TEST_FIXTURES=1 ./scripts/smoke-test.sh
docker compose --profile edge-test up --build -d
docker compose logs --tail=100
```

The opt-in smoke writes sample engineering records to the two training sites and downloads a signed fixture package. Run it against a disposable local database. The edge profile exposes the simulated kiosk on loopback port 3100. For the package-to-device test, run the versioned acceptance scripts in the operations guide.

## Architecture and deployment

TanStack Start and React provide the application shell. The standalone Node build uses a private PostgreSQL schema with immutable workspace revisions. Three.js renders the layout with synchronized plan and elevation views. The shared Studio compiler, renderer, and interpreter support preview and the edge kiosk. Releases and device observations have separate records.

The original Lovable build uses the Cloud sandbox when `EMS_MODE` is absent. Preserve that build and the checked-in historical migration files. The native factory runtime uses `EMS_MODE=local` for loopback fixtures or `EMS_MODE=production` for registered AMS sign-in.

Use the [operations runbook](docs/operations.md) for migrations, artifact backup, restore, pinning, and deployment verification. Check [production readiness](docs/production-readiness.md) before promotion.

## Development verification

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint:ems
bun run test
bun run build
bun run build:node
bun run test:browser
```

The browser tests require a seeded local fixture stack. See the [current-state audit](docs/current-state-and-gaps.md), [architecture decision](docs/adr/0001-native-factory-runtime.md), and [API contracts](docs/api/).
