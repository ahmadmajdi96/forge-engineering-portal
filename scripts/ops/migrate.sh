#!/usr/bin/env bash
set -euo pipefail
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}" "${POSTGRES_PASSWORD:?}" "${EMS_APP_PASSWORD:?}" "${EMS_WORKER_PASSWORD:?}"
export PGPASSWORD=$POSTGRES_PASSWORD
psql_flags=(-X -v ON_ERROR_STOP=1 -h "${PGHOST:-database}" -U "$POSTGRES_USER" -d "$POSTGRES_DB")
migration_dir=${EMS_MIGRATIONS_DIR:-/migrations}
statement=$(mktemp)
trap 'rm -f "$statement"' EXIT
cat > "$statement" <<'SQL'
SELECT pg_advisory_lock(683123509);
CREATE TABLE IF NOT EXISTS public.ems_migration_ledger (
  name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.ems_migration_ledger FROM PUBLIC;
SELECT format('CREATE ROLE ems_app LOGIN PASSWORD %L', :'app_password') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ems_app') \gexec
SELECT format('CREATE ROLE ems_worker LOGIN PASSWORD %L', :'worker_password') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ems_worker') \gexec
SQL
for file in "$migration_dir"/[0-9]*.sql; do
  name=$(basename "$file")
  case "$name" in *[!A-Za-z0-9_.-]*) exit 1 ;; esac
  digest=$(sha256sum "$file" | cut -d ' ' -f 1)
  cat >> "$statement" <<SQL
SELECT EXISTS(SELECT 1 FROM public.ems_migration_ledger WHERE name = '$name' AND checksum <> '$digest') AS mismatched,
       NOT EXISTS(SELECT 1 FROM public.ems_migration_ledger WHERE name = '$name') AS pending \gset
\if :mismatched
  DO \$\$ BEGIN RAISE EXCEPTION 'Migration checksum mismatch: $name'; END \$\$;
\endif
\if :pending
  BEGIN;
  \i $file
  INSERT INTO public.ems_migration_ledger(name, checksum) VALUES ('$name', '$digest');
  COMMIT;
\endif
SQL
done
cat >> "$statement" <<'SQL'
GRANT SELECT ON public.ems_migration_ledger TO ems_app;
GRANT USAGE ON SCHEMA ems TO ems_app, ems_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA ems TO ems_app;
GRANT INSERT ON ems.actors, ems.oidc_requests, ems.sessions, ems.workspaces, ems.revisions, ems.audit, ems.releases, ems.outbox, ems.inbox, ems.assignments TO ems_app;
GRANT DELETE ON ems.oidc_requests, ems.sessions TO ems_app;
GRANT UPDATE (head) ON ems.workspaces TO ems_app;
GRANT UPDATE (status, reviewer, approval_evidence, artifact, published_at) ON ems.releases TO ems_app;
GRANT UPDATE (business_state) ON ems.outbox TO ems_app;
GRANT SELECT ON ems.outbox, ems.worker_heartbeat TO ems_worker;
GRANT UPDATE (lease_id, lease_until, attempts, send_state, last_error, next_attempt_at) ON ems.outbox TO ems_worker;
GRANT INSERT, UPDATE ON ems.worker_heartbeat TO ems_worker;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
  THEN EXECUTE 'REVOKE ALL ON SCHEMA ems FROM PUBLIC';
  END IF;
END $$;
SQL
if [[ ${EMS_SEED_FIXTURES:-0} == 1 ]]; then
  cat >> "$statement" <<'SQL'
INSERT INTO ems.sites(key, organization, name)
VALUES ('training-north', 'ems-fixture', 'Training Factory North'),
       ('training-south', 'ems-fixture', 'Training Factory South')
ON CONFLICT (key) DO NOTHING;
SQL
fi
psql "${psql_flags[@]}" -v app_password="$EMS_APP_PASSWORD" -v worker_password="$EMS_WORKER_PASSWORD" -f "$statement"
