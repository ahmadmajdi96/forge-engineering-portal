// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { returnPath, verifyAmsTokens } from "./auth.server";

describe("AMS federation identity", () => {
  const issuer = "https://ams.manuqube.com";
  const clientId = "ems-test-oidc-client";
  const subject = "cc29f0b1-fab3-4702-82ad-d8b1f356903c";
  const session = "e3e405d9-ef8c-4068-91c2-903d500921cf";
  const nonce = "test-nonce";

  async function fixture() {
    const keys = await generateKeyPair("ES256");
    const getKey = async () => keys.publicKey;
    const token = (audience: string | string[], extra = {}, exp = "5m", iss = issuer) =>
      new SignJWT({ sid: session, name: "Factory engineer", ...extra })
        .setProtectedHeader({ alg: "ES256" })
        .setIssuer(iss)
        .setAudience(audience)
        .setSubject(subject)
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(keys.privateKey);
    const id_token = await token(clientId, { nonce });
    const access_token = await token("ems");
    return { getKey, id_token, access_token, token };
  }

  it("checks issuer, distinct audiences, nonce, session binding and expiry", async () => {
    const { getKey, id_token, access_token, token } = await fixture();
    const tokens = { id_token, access_token };
    const config = { issuer, clientId };
    const check = (override: Partial<typeof tokens>, expectedNonce = nonce) =>
      verifyAmsTokens({ ...tokens, ...override }, config, expectedNonce, getKey);
    expect(await check({})).toMatchObject({ subject });
    await expect(check({}, "substituted")).rejects.toThrow();
    await expect(check({ access_token: id_token })).rejects.toThrow();
    await expect(check({ access_token: await token("wms") })).rejects.toThrow();
    await expect(check({ access_token: await token(["ems", "wms"]) })).rejects.toThrow();
    await expect(check({ id_token: await token(clientId) })).rejects.toThrow();
    await expect(
      check({ access_token: await token("ems", {}, "5m", "https://elsewhere.invalid") }),
    ).rejects.toThrow();
    await expect(check({ access_token: await token("ems", {}, "1 second ago") })).rejects.toThrow();
    await expect(
      check({ access_token: await token("ems", { sid: crypto.randomUUID() }) }),
    ).rejects.toThrow();
  });

  it("keeps post-login redirects inside the application", () => {
    expect(returnPath("/admin/qa?site=training-north")).toBe("/admin/qa?site=training-north");
    for (const path of [
      "https://other.invalid/",
      "//other.invalid",
      "/\\other.invalid",
      "/../api/ems",
      "/api/ems/auth/start",
    ]) {
      expect(returnPath(path)).toBe("/");
    }
  });
});
