#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p .ems
if [[ -s .ems/runtime.env && -s .ems/database.env && -s .ems/worker.env && -s .ems/fixture-release.pub ]]; then
  echo "EMS local configuration already exists in .ems/"
  exit
fi
if find .ems -mindepth 1 -maxdepth 1 -print -quit | read -r ignored; then
  echo "Partial configuration in .ems/. Preserve it and resolve missing files before bootstrapping." >&2
  exit 1
fi
work=$(mktemp -d .ems/.bootstrap.XXXXXX)
trap 'rm -rf "$work"' EXIT
owner=$(openssl rand -hex 32)
app=$(openssl rand -hex 32)
worker=$(openssl rand -hex 32)
author=$(openssl rand -hex 32)
reviewer=$(openssl rand -hex 32)
single_site=$(openssl rand -hex 32)
session=$(openssl rand -hex 32)
openssl genpkey -algorithm ED25519 -out "$work/release.pem"
openssl pkey -in "$work/release.pem" -pubout -out "$work/fixture-release.pub"
release=$(base64 -w 0 < "$work/release.pem")
cat > "$work/database.env" <<EOF
POSTGRES_DB=ems
POSTGRES_USER=ems_owner
POSTGRES_PASSWORD=$owner
EMS_APP_PASSWORD=$app
EMS_WORKER_PASSWORD=$worker
EMS_SEED_FIXTURES=1
EOF
cat > "$work/runtime.env" <<EOF
EMS_MODE=local
EMS_PUBLIC_ORIGIN=http://127.0.0.1:8088
EMS_DATABASE_URL=postgres://ems_app:$app@database:5432/ems
EMS_SESSION_KEY=$session
EMS_FIXTURE_AUTHOR_TOKEN=$author
EMS_FIXTURE_REVIEWER_TOKEN=$reviewer
EMS_FIXTURE_SINGLE_SITE_TOKEN=$single_site
EMS_RELEASE_KEY_BASE64=$release
EMS_RELEASE_KEY_ID=ems-fixture
EOF
cat > "$work/worker.env" <<EOF
EMS_MODE=local
EMS_DATABASE_URL=postgres://ems_worker:$worker@database:5432/ems
EMS_PUBLISHERS_ENABLED=false
EOF
for file in database.env runtime.env worker.env fixture-release.pub; do
  mv -n "$work/$file" ".ems/$file"
done
echo "Created local EMS configuration. Fixture access tokens are in .ems/runtime.env."
