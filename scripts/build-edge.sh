#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
destination=${1:-.output/edge}
mkdir -p "$destination/public"
bun build edge/service.ts --target=node --format=esm --outfile="$destination/service.mjs"
bun build edge/player.tsx --target=browser --minify --define 'process.env.NODE_ENV="production"' --outfile="$destination/public/player.js"
cp edge/index.html edge/player.css "$destination/public/"
