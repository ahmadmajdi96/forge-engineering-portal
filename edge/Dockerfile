# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN ./scripts/build-edge.sh /app/edge-output

FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
WORKDIR /app
ENV NODE_ENV=production EMS_EDGE_STATE_DIR=/data
COPY --from=build --chown=node:node /app/edge-output ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3100
VOLUME ["/data"]
CMD ["node", "service.mjs"]
