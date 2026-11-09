# Standalone Node build of the Engineering Portal.
# Connects to the same Lovable Cloud database using the publishable key in .env.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile || bun install
COPY . .
# VITE_* values from .env are baked into the browser bundle at build time.
RUN bunx vite build -c ./vite.docker.config.ts

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/.output ./.output
COPY --from=build /app/.env ./.env
EXPOSE 3000
CMD ["node", "--env-file-if-exists=.env", ".output/server/index.mjs"]
