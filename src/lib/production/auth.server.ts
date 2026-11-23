import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { database, EmsError, hash, mode } from "./db.server";
import { qaPermission, releasePermission, viewPermission } from "./contracts";

const sessionCookie = "ems_session";
const requestCookie = "ems_oidc";
const tokenPattern = /^[a-zA-Z0-9_-]{43}$/;
const uuid = z.string().uuid();
const isLocal = () => mode() === "local";
const nonceValue = () => randomBytes(32).toString("base64url");

export function publicOrigin() {
  const value = process.env["EMS_PUBLIC_ORIGIN"];
  if (!value) throw new EmsError(503, "Factory application origin is unconfigured.");
  const origin = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  if (
    origin.origin !== value ||
    (origin.protocol !== "https:" && !(isLocal() && loopback && origin.protocol === "http:"))
  )
    throw new EmsError(503, "Factory application origin is invalid.");
  return origin.origin;
}

export function returnPath(value: string | null) {
  if (
    !value ||
    value.length > 1600 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    return "/";
  const parsed = new URL(value, "https://ems.invalid");
  return parsed.origin === "https://ems.invalid" && !/^\/api(?:\/|$)/.test(parsed.pathname)
    ? parsed.pathname + parsed.search
    : "/";
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${publicOrigin().startsWith("https:") ? "; Secure" : ""}`;
}
function readCookie(request: Request, name: string) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && tokenPattern.test(value) ? value : null;
}

export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== publicOrigin())
    throw new EmsError(403, "Request origin is not authorized.");
}

function sessionKey() {
  const value = process.env["EMS_SESSION_KEY"];
  if (!value || !/^[a-f\d]{64}$/i.test(value))
    throw new EmsError(503, "Session encryption is unconfigured.");
  return Buffer.from(value, "hex");
}
function encrypt(value: string, actor: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  cipher.setAAD(Buffer.from(actor));
  return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]).toString(
    "base64url",
  );
}
function decrypt(value: string, actor: string) {
  const bytes = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", sessionKey(), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(actor));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
}

function provider() {
  const issuer = process.env["EMS_AMS_ISSUER"];
  const clientId = process.env["EMS_AMS_CLIENT_ID"];
  const clientSecret = process.env["EMS_AMS_CLIENT_SECRET"];
  if (mode() !== "production" || !issuer || !clientId || clientId === "ems" || !clientSecret)
    throw new EmsError(503, "AMS federation requires a registered EMS client.");
  const base = new URL(issuer);
  if (base.protocol !== "https:" || base.origin !== issuer)
    throw new EmsError(503, "Invalid AMS issuer.");
  return { issuer, clientId, clientSecret, redirectUri: publicOrigin() + "/api/ems/auth/callback" };
}

let providerKeys: { issuer: string; verifier: JWTVerifyGetKey } | undefined;

export async function verifyAmsTokens(
  tokens: { id_token: string; access_token: string },
  config: { issuer: string; clientId: string },
  nonce: string,
  keys: JWTVerifyGetKey,
) {
  const required = ["sub", "exp", "iat", "sid", "jti"];
  const options = {
    issuer: config.issuer,
    algorithms: ["ES256"],
    maxTokenAge: "65 minutes",
    requiredClaims: required,
  };
  const [id, access] = await Promise.all([
    jwtVerify(tokens.id_token, keys, { ...options, audience: config.clientId }),
    jwtVerify(tokens.access_token, keys, { ...options, audience: "ems" }),
  ]);
  if (
    id.payload.aud !== config.clientId ||
    access.payload.aud !== "ems" ||
    id.payload["nonce"] !== nonce ||
    access.payload["nonce"] !== undefined ||
    access.payload.sub !== id.payload.sub ||
    access.payload["sid"] !== id.payload["sid"] ||
    !uuid.safeParse(access.payload.sub).success ||
    !uuid.safeParse(access.payload["sid"]).success
  )
    throw new EmsError(401, "AMS returned invalid identity evidence.");
  return {
    subject: access.payload.sub!,
    expires: new Date(Math.min(id.payload.exp!, access.payload.exp!) * 1000),
    name: z.string().trim().min(1).max(180).catch("AMS user").parse(id.payload["name"]),
  };
}

function redirectResponse(location: string, cookies: string[] = []) {
  const headers = new Headers({
    location,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, { status: 303, headers });
}

export async function startSignIn(request: Request) {
  const config = provider();
  const state = nonceValue();
  const nonce = nonceValue();
  const verifier = nonceValue();
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
  const next = returnPath(new URL(request.url).searchParams.get("next"));
  const sql = database();
  await sql`delete from ems.oidc_requests where expires_at <= now()`;
  await sql`insert into ems.oidc_requests (key_hash, nonce, verifier, return_path, expires_at)
    values (${hash(state)}, ${nonce}, ${verifier}, ${next}, now() + interval '5 minutes')`;
  const authorize = new URL("/oauth/authorize", config.issuer);
  authorize.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    nonce,
    scope: "openid profile",
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return redirectResponse(authorize.href, [cookie(requestCookie, state, 300)]);
}

async function issueSession(
  issuer: string,
  subject: string,
  name: string,
  expires: Date,
  bearer?: string,
) {
  const key = nonceValue();
  const sql = database();
  await sql.begin(async (tx) => {
    await tx`insert into ems.actors (issuer, subject) values (${issuer}, ${subject}) on conflict do nothing`;
    const [actor] = await tx<
      { id: string }[]
    >`select id from ems.actors where issuer = ${issuer} and subject = ${subject}`;
    if (!actor) throw new EmsError(503, "EMS actor could not be verified.");
    await tx`delete from ems.sessions where expires_at <= now()`;
    await tx`insert into ems.sessions (key_hash, actor, display_name, bearer, expires_at)
      values (${hash(key)}, ${actor.id}, ${name}, ${bearer ? encrypt(bearer, actor.id) : null}, ${expires})`;
  });
  return cookie(
    sessionCookie,
    key,
    Math.max(0, Math.floor((expires.valueOf() - Date.now()) / 1000)),
  );
}

export async function finishSignIn(request: Request) {
  const config = provider();
  const params = new URL(request.url).searchParams;
  const state = readCookie(request, requestCookie);
  const code = params.get("code");
  if (
    !state ||
    params.getAll("state").length !== 1 ||
    params.get("state") !== state ||
    params.getAll("code").length !== 1 ||
    !code ||
    code.length > 512 ||
    params.has("error")
  )
    throw new EmsError(401, "Sign-in response could not be verified.");
  const sql = database();
  const [challenge] = await sql<{ nonce: string; verifier: string; return_path: string }[]>`
    delete from ems.oidc_requests where key_hash = ${hash(state)} and expires_at > now()
    returning nonce, verifier, return_path`;
  if (!challenge) throw new EmsError(401, "Sign-in request expired or was already used.");
  const reply = await fetch(config.issuer + "/api/public/oauth/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: challenge.verifier,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!reply.ok) throw new EmsError(401, "AMS could not complete sign-in.");
  const tokens = z
    .object({ id_token: z.string().max(12000), access_token: z.string().max(12000) })
    .parse(await reply.json());
  if (providerKeys?.issuer !== config.issuer)
    providerKeys = {
      issuer: config.issuer,
      verifier: createRemoteJWKSet(new URL(config.issuer + "/api/public/oauth/jwks"), {
        timeoutDuration: 5000,
      }),
    };
  const identity = await verifyAmsTokens(
    tokens,
    config,
    challenge.nonce,
    providerKeys.verifier,
  ).catch(() => {
    throw new EmsError(401, "AMS token validation failed. Contact your administrator.");
  });
  const session = await issueSession(
    config.issuer,
    identity.subject,
    identity.name,
    identity.expires,
    tokens.access_token,
  );
  return redirectResponse(challenge.return_path, [session, cookie(requestCookie, "", 0)]);
}

function equalSecret(given: string, configured: string | undefined) {
  return (
    !!configured &&
    configured.length >= 32 &&
    timingSafeEqual(Buffer.from(hash(given)), Buffer.from(hash(configured)))
  );
}

export async function fixtureSignIn(request: Request) {
  if (!isLocal()) throw new EmsError(404, "Sign-in method is unavailable.");
  sameOrigin(request);
  const body = await request.text();
  if (body.length > 2048) throw new EmsError(400, "Invalid sign-in request.");
  const input = new URLSearchParams(body);
  const token = input.get("token") ?? "";
  const subject = equalSecret(token, process.env["EMS_FIXTURE_AUTHOR_TOKEN"])
    ? "author"
    : equalSecret(token, process.env["EMS_FIXTURE_REVIEWER_TOKEN"])
      ? "reviewer"
      : equalSecret(token, process.env["EMS_FIXTURE_SINGLE_SITE_TOKEN"])
        ? "single-site"
        : null;
  if (!subject) throw new EmsError(401, "Invalid fixture sign-in.");
  const name = subject === "reviewer" ? "Fixture reviewer" : "Fixture engineer";
  const session = await issueSession(
    "urn:ems:local",
    subject,
    name,
    new Date(Date.now() + 3600_000),
  );
  const next = returnPath(input.get("next"));
  if (request.headers.get("accept") === "application/json") {
    return Response.json(
      { next },
      { headers: { "cache-control": "no-store", "set-cookie": session } },
    );
  }
  return redirectResponse(next, [session]);
}

export async function signOut(request: Request) {
  sameOrigin(request);
  const key = readCookie(request, sessionCookie);
  if (key) await database()`delete from ems.sessions where key_hash = ${hash(key)}`;
  return redirectResponse("/", [cookie(sessionCookie, "", 0), cookie(requestCookie, "", 0)]);
}

type Session = {
  actor: string;
  display_name: string;
  bearer: string | null;
  issuer: string;
  subject: string;
};
type Site = { key: string; name: string; ams_site_id: string | null };

export async function requireSession(request: Request) {
  const key = readCookie(request, sessionCookie);
  if (!key || !["local", "production"].includes(mode())) throw new EmsError(401, "Sign in to EMS.");
  const [session] = await database()<Session[]>`
    select s.actor, s.display_name, s.bearer, a.issuer, a.subject from ems.sessions s
    join ems.actors a on a.id = s.actor where key_hash = ${hash(key)} and expires_at > now()`;
  if (
    !session ||
    (isLocal()
      ? session.issuer !== "urn:ems:local"
      : session.issuer !== provider().issuer || !session.bearer)
  )
    throw new EmsError(401, "The EMS session expired.");
  return session;
}

const accessSchema = z.object({
  system: z.literal("ems"),
  user: z.object({ id: uuid }),
  permissions: z.array(z.string()),
});

async function sitePermissions(session: Session, site: Site) {
  if (isLocal()) {
    if (
      !["training-north", "training-south"].includes(site.key) ||
      (session.subject === "single-site" && site.key !== "training-north")
    )
      return [];
    const common: string[] = [
      ...Object.values(viewPermission),
      qaPermission,
      releasePermission.view,
      "ems.factory_assignments.view",
    ];
    return session.subject === "reviewer"
      ? [...common, "ems.engineering.review", releasePermission.approve, releasePermission.publish]
      : [
          ...common,
          "ems.engineering.edit",
          "ems.factory_layout.edit",
          "ems.application_studio.edit",
          "ems.factory_process.edit",
          "ems.application_studio.validate",
          "ems.factory_assignments.edit",
          releasePermission.submit,
        ];
  }
  if (!site.ams_site_id || !session.bearer) return [];
  const url = new URL("/api/public/v2/access", provider().issuer);
  url.searchParams.set("site_id", site.ams_site_id);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: "Bearer " + decrypt(session.bearer, session.actor) },
      redirect: "error",
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
  } catch {
    throw new EmsError(503, "AMS authorization is unavailable.");
  }
  if (response.status === 401) throw new EmsError(401, "Your AMS session expired or was revoked.");
  if (response.status === 403 || response.status === 404) return [];
  if (!response.ok) throw new EmsError(503, "AMS authorization is unavailable.");
  const access = accessSchema.safeParse(await response.json());
  if (!access.success || access.data.user.id !== session.subject)
    throw new EmsError(403, "Invalid AMS scope evidence.");
  return access.data.permissions;
}

export async function requirePermission(request: Request, key: string, permission: string) {
  const session = await requireSession(request);
  const [site] = await database()<
    Site[]
  >`select key, name, ams_site_id from ems.sites where key = ${key}`;
  if (!site || !(await sitePermissions(session, site)).includes(permission))
    throw new EmsError(403, "Action is not granted for this factory.");
  return { actor: session.actor, site: site.key };
}

export async function listAuthorizedSites(request: Request) {
  const session = await requireSession(request);
  const sites = await database()<Site[]>`select key, name, ams_site_id from ems.sites order by key`;
  const allowed = [];
  for (let index = 0; index < sites.length; index += 5) {
    const page = await Promise.all(
      sites.slice(index, index + 5).map(async (site) => {
        const actions = await sitePermissions(session, site);
        return actions.some((action) =>
          [
            ...Object.values(viewPermission),
            qaPermission,
            releasePermission.view,
            "ems.factory_assignments.view",
          ].includes(action),
        )
          ? { key: site.key, name: site.name }
          : null;
      }),
    );
    allowed.push(...page.filter((site) => site !== null));
  }
  return { name: session.display_name, sites: allowed };
}
