#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 3 || $1 != https://* || ! $2 =~ ^[a-f0-9]{40}$ || ! $3 =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "Usage: scripts/ops/check-deployment.sh <approved-https-origin> <commit> <image-digest>" >&2
  exit 2
fi
origin=${1%/}
revision=$2
digest=$3
curl --proto '=https' -fsS --max-time 12 "$origin/api/ems/health" | jq -e '.status == "ready"' >/dev/null
status=$(curl --proto '=https' -sS -o /dev/null -w '%{http_code}' --max-time 12 "$origin/api/ems/qa?site=readiness-probe")
if [[ $status != 401 ]]; then echo "Anonymous QA probe returned HTTP $status." >&2; exit 1; fi
printf 'HTTPS readiness and anonymous QA denial verified. Compare %s and %s in authenticated Admin QA.\n' "$revision" "$digest"
