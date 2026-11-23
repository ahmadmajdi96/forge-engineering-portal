#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# != 1 ]]; then echo "Usage: scripts/backup.sh <new-dump-file>" >&2; exit 2; fi
umask 077
target=$1
if [[ -e $target ]]; then echo "Backup destination already exists." >&2; exit 1; fi
temp=$(mktemp "${target}.partial.XXXXXX")
trap 'rm -f "$temp"' EXIT
docker compose exec -T database bash -ceu 'pg_dump -Fc --no-owner --no-acl --username "$POSTGRES_USER" "$POSTGRES_DB"' > "$temp"
[[ -s $temp ]]
mv -n "$temp" "$target"
sha256sum "$target"
