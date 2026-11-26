import { createHash, sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { digest, identifier } from "./assignment";

const envelope = z
  .object({
    keyId: identifier,
    contentDigest: digest,
    signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
    value: z.unknown().refine((value) => value !== undefined),
  })
  .strict();

type EnvelopeType =
  "release" | "deployment" | "activation" | "run-grant" | "evidence-ack" | "readback";
export type Signed<T> = { keyId: string; contentDigest: string; signature: string; value: T };
export type VerificationKeys = ReadonlyMap<string, KeyObject>;

// Canonical JSON for the version 1 EMS protocol. Strings and numbers use JS JSON
// encoding, object keys sort by UTF-16 code unit, and array order is preserved.
export function canonicalJson(input: unknown, depth = 0): string {
  if (depth > 64) throw new Error("Canonical JSON nesting exceeds the supported limit");
  if (input === null || typeof input === "string" || typeof input === "boolean")
    return JSON.stringify(input);
  if (typeof input === "number" && Number.isFinite(input)) return JSON.stringify(input);
  if (Array.isArray(input))
    return `[${Array.from(input, (item) => canonicalJson(item, depth + 1)).join(",")}]`;
  if (
    typeof input === "object" &&
    input !== null &&
    [Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    const value = input as Record<string, unknown>;
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`)
      .join(",")}}`;
  }
  throw new Error("Value cannot be encoded as canonical JSON");
}

export const hashContent = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const signingInput = (type: EnvelopeType, keyId: string, sha256: string) =>
  Buffer.from(`ManuQube EMS edge v1\n${type}\n${keyId}\n${sha256}`, "utf8");

export function signEnvelope<T>(
  type: EnvelopeType,
  keyId: string,
  key: KeyObject,
  value: T,
): Signed<T> {
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519")
    throw new Error("Expected Ed25519 signing key");
  identifier.parse(keyId);
  const contentDigest = hashContent(value);
  return {
    keyId,
    value,
    contentDigest,
    signature: sign(null, signingInput(type, keyId, contentDigest), key).toString("base64url"),
  };
}

export function verifyEnvelope<TSchema extends z.ZodTypeAny>(
  type: EnvelopeType,
  input: unknown,
  schema: TSchema,
  keys: VerificationKeys,
): Signed<z.output<TSchema>> {
  const candidate = envelope.parse(input);
  const key = keys.get(candidate.keyId);
  if (!key || key.type !== "public" || key.asymmetricKeyType !== "ed25519")
    throw new Error("Signing key is unavailable");
  const rawDigest = hashContent(candidate.value);
  const signature = Buffer.from(candidate.signature, "base64url");
  if (
    candidate.contentDigest !== rawDigest ||
    signature.toString("base64url") !== candidate.signature ||
    !verify(null, signingInput(type, candidate.keyId, rawDigest), key, signature)
  ) {
    throw new Error("Invalid signed content");
  }
  const value = schema.parse(candidate.value);
  if (hashContent(value) !== rawDigest)
    throw new Error("Signed content changed under schema validation");
  return {
    keyId: candidate.keyId,
    value,
    contentDigest: rawDigest,
    signature: candidate.signature,
  };
}
