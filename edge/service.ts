import { createHash, createPrivateKey, createPublicKey, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  applicationKind,
  identifier,
  nodeCapabilitiesSchema,
  targetContextSchema,
} from "../src/lib/edge/assignment";
import { validatePackagedApplication } from "../src/lib/edge/application";
import { EdgeDevice } from "../src/lib/edge/device.server";
import { fixtureCapabilities, fixtureContext, fixtureInstall, fixtureKeys } from "./fixture";

const directory = process.env["EMS_EDGE_STATE_DIR"] ?? "/data";
const fixture = process.env["EMS_EDGE_FIXTURE"] === "1";
const host = process.env["EMS_EDGE_HOST"] ?? "127.0.0.1";
const port = Number(process.env["EMS_EDGE_PORT"] ?? 3100);
if (!fixture && host !== "127.0.0.1" && host !== "::1")
  throw new Error("Provisioned edge service requires a loopback bind");
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid edge listener port");

function fromRequiredFile(name: string) {
  const file = process.env[name];
  if (!file) throw new Error(`Required file environment variable missing: ${name}`);
  return readFileSync(file, "utf8");
}

const keySchema = z
  .record(
    identifier,
    z
      .string()
      .max(1024)
      .regex(/^-----BEGIN PUBLIC KEY-----\r?\n/),
  )
  .refine((keys) => Object.keys(keys).length >= 1 && Object.keys(keys).length <= 10);
const configSchema = z
  .object({
    context: targetContextSchema,
    capabilities: nodeCapabilitiesSchema,
    deviceKeyId: identifier,
    keys: z
      .object({
        release: keySchema,
        deployment: keySchema,
        activation: keySchema,
        operator: keySchema,
        evidence: keySchema,
      })
      .strict(),
  })
  .strict();

function provisioned() {
  const config = configSchema.parse(JSON.parse(fromRequiredFile("EMS_EDGE_CONFIG_FILE")));
  const architecture = ({ x64: "amd64", arm64: "arm64" } as Record<string, string>)[process.arch];
  if (
    process.platform !== "linux" ||
    config.capabilities.architecture !== architecture ||
    config.capabilities.runtime !== 1
  ) {
    throw new Error(
      "Provisioned runtime platform differs from detected OS, architecture or runtime version",
    );
  }
  function publicKeys(group: z.infer<typeof keySchema>) {
    return new Map(
      Object.entries(group).map(([id, pem]) => {
        const key = createPublicKey(pem);
        if (key.asymmetricKeyType !== "ed25519")
          throw new Error("Provisioned trust requires Ed25519");
        return [id, key];
      }),
    );
  }
  const key = createPrivateKey(fromRequiredFile("EMS_EDGE_DEVICE_KEY_FILE"));
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("Provisioned device key must be Ed25519");
  return {
    context: config.context,
    capabilities: config.capabilities,
    deviceKey: { id: config.deviceKeyId, key },
    keys: {
      release: publicKeys(config.keys.release),
      deployment: publicKeys(config.keys.deployment),
      activation: publicKeys(config.keys.activation),
      operator: publicKeys(config.keys.operator),
      evidence: publicKeys(config.keys.evidence),
    },
  };
}

const token = fixture ? null : fromRequiredFile("EMS_EDGE_ADMIN_TOKEN_FILE").trim();
if (token !== null && !/^[A-Za-z0-9_-]{43,128}$/.test(token))
  throw new Error("Expected a base64url edge operator transport token");
const tokenHash = token ? createHash("sha256").update(token).digest() : null;
function authorized(req: IncomingMessage) {
  const auth = req.headers.authorization;
  if (!tokenHash || !auth?.startsWith("Bearer ") || auth.length > 135) return false;
  return timingSafeEqual(tokenHash, createHash("sha256").update(auth.slice(7)).digest());
}

mkdirSync(directory, { recursive: true, mode: 0o700 });
const configuration = fixture
  ? { context: fixtureContext, capabilities: fixtureCapabilities(), ...fixtureKeys(directory) }
  : provisioned();
const device = new EdgeDevice({
  ...configuration,
  path: join(directory, fixture ? "isolated-edge-test.sqlite" : "edge.sqlite"),
  validateApplication: validatePackagedApplication,
});
if (fixture && device.readback().value.slots.every((slot) => slot.status === "UNKNOWN")) {
  const seed = fixtureInstall(Date.now(), configuration.deviceKey);
  device.stage(seed.release, seed.deployment);
  device.activate(seed.activation);
}

const assetsPath =
  process.env["EMS_EDGE_ASSETS"] ?? fileURLToPath(new URL("./public/", import.meta.url));
const index = readFileSync(join(assetsPath, "index.html"));
const client = readFileSync(join(assetsPath, "player.js"));
const styles = readFileSync(join(assetsPath, "player.css"));

function send(res: ServerResponse, status: number, type: string, data: string | Buffer) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
  });
  res.end(data);
}

function json(res: ServerResponse, status: number, data: unknown) {
  return send(res, status, "application/json; charset=utf-8", JSON.stringify(data));
}

async function readJson(req: IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new Error("Expected application/json");
  const parts: Buffer[] = [];
  let bytes = 0;
  for await (const part of req) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += chunk.length;
    if (bytes > 2_000_000) throw new Error("Request exceeds size limit");
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}

const stageRequest = z.object({ release: z.unknown(), deployment: z.unknown() }).strict();

const server = createServer(
  { requestTimeout: 15_000, headersTimeout: 10_000 },
  async (req, res) => {
    const url = new URL(req.url ?? "/", "http://edge.invalid");
    const path = url.pathname;
    try {
      if (req.method === "GET") {
        if (path === "/health") return json(res, 200, { status: "ready", fixture });
        if (path === "/") return send(res, 200, "text/html; charset=utf-8", index);
        if (path === "/player.js") return send(res, 200, "text/javascript; charset=utf-8", client);
        if (path === "/player.css") return send(res, 200, "text/css; charset=utf-8", styles);
        if (path === "/api/player") {
          const kind = applicationKind.parse(url.searchParams.get("kind") ?? "operator");
          return json(res, 200, { fixture, active: device.activeApplication(kind) });
        }
      }
      if (path.startsWith("/v1/")) {
        if (!authorized(req))
          return json(res, 401, { message: "Authorized edge control transport required" });
        if (path === "/v1/readback" && req.method === "GET")
          return json(res, 200, device.readback());
        if (path === "/v1/stage" && req.method === "POST") {
          const { release, deployment } = stageRequest.parse(await readJson(req));
          return json(res, 200, { status: device.stage(release, deployment) });
        }
        if (path === "/v1/activate" && req.method === "POST") {
          return json(res, 200, { status: device.activate(await readJson(req)) });
        }
      }
      return json(res, 404, { message: "Route unavailable" });
    } catch {
      return json(res, 409, { message: "Request could not be safely processed" });
    }
  },
);

server.listen(port, host, () => {
  const bound = server.address();
  if (!bound || typeof bound === "string") throw new Error("Edge listener has no bound address");
  process.stdout.write(
    `EMS edge listening on ${host}:${bound.port} (${fixture ? "isolated fixture" : "provisioned"})\n`,
  );
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => server.close(() => device.close()));
}
