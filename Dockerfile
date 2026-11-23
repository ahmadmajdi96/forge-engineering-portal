FROM postgres:18.6-bookworm@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5 AS migration-runner
COPY --chown=postgres:postgres database/migrations /migrations
COPY --chown=postgres:postgres scripts/ops/migrate.sh /opt/ems/migrate.sh
USER postgres
ENTRYPOINT ["bash", "/opt/ems/migrate.sh"]

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS bun-tool

FROM node:22.22.1-bookworm-slim@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d AS build
COPY --from=bun-tool /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
ARG EMS_SOURCE_REVISION=unknown
RUN bun run build:node && bun build --target=node --format=esm --outfile=/app/worker.mjs scripts/ems-worker.ts

FROM node:22.22.1-bookworm-slim@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d AS runtime
WORKDIR /app
ARG EMS_SOURCE_REVISION=unknown
LABEL org.opencontainers.image.revision=$EMS_SOURCE_REVISION
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 EMS_SOURCE_REVISION=$EMS_SOURCE_REVISION
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/worker.mjs ./worker.mjs
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
