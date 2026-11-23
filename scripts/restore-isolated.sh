#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 1 || ! -s $1 ]]; then echo "Usage: scripts/restore-isolated.sh <custom-format-dump>" >&2; exit 2; fi
dump=$(realpath "$1")
name=ems-restore-$(openssl rand -hex 8)
export POSTGRES_PASSWORD=$(openssl rand -hex 24)
docker run --rm --detach --network none --name "$name" --env POSTGRES_PASSWORD \
  --mount "type=bind,src=$dump,dst=/restore.dump,readonly" postgres:18.6-bookworm@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5 >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT
ready=false
for attempt in {1..40}; do
  if docker exec "$name" pg_isready -h 127.0.0.1 -q --username postgres; then ready=true; break; fi
  sleep 1
done
if [[ $ready != true ]]; then echo "Isolated restore database did not become ready." >&2; exit 1; fi
docker exec "$name" createdb --username postgres ems_restore
docker exec "$name" pg_restore --exit-on-error --no-owner --no-acl --username postgres --dbname ems_restore /restore.dump
docker exec "$name" psql -X -v ON_ERROR_STOP=1 --username postgres --dbname ems_restore -c '
SELECT count(*) AS migrations FROM public.ems_migration_ledger;
SELECT count(*) AS revisions FROM ems.revisions;
SELECT count(*) AS releases FROM ems.releases;
SELECT count(*) AS assignments FROM ems.assignments;
SELECT count(*) AS outbox_events FROM ems.outbox;'
