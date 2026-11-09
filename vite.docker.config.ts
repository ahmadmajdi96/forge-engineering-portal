// Docker-only build config: same app, but emits a standalone Node server (.output/server/index.mjs)
// instead of the default Cloudflare Worker bundle. Used by the Dockerfile only.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: { preset: "node-server" },
});
