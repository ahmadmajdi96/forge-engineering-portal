#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
origin=${EMS_SMOKE_ORIGIN:-http://127.0.0.1:8088}
curl -fsS "$origin/api/ems/health" >/dev/null
status=$(curl -sS -o /dev/null -w '%{http_code}' "$origin/api/ems/qa?site=training-north")
if [[ $status != 401 ]]; then echo "Anonymous Admin QA should return HTTP 401, got $status." >&2; exit 1; fi
if [[ -n ${EMS_TEST_FIXTURES:-} ]]; then
  EMS_SMOKE_ORIGIN=$origin bun run scripts/ops/factory-acceptance.ts
else
  echo 'Readiness and anonymous QA denial passed.'
fi
