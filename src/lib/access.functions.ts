import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AccessResult =
  | { mode: "hub"; active: boolean; roles: string[]; permissions: string[]; name?: string | undefined }
  | { mode: "unconfigured" }
  | { mode: "error"; message: string };

export const checkAccess = createServerFn({ method: "POST" })
  .inputValidator((i: { email: string }) => z.object({ email: z.string().email().max(255) }).parse(i))
  .handler(async ({ data }): Promise<AccessResult> => {
    const base = process.env["ACCESS_HUB_URL"];
    const key = process.env["ACCESS_HUB_API_KEY"];
    if (!base || !key) return { mode: "unconfigured" };
    try {
      const url = `${base.replace(/\/$/, "")}/api/public/v1/access?email=${encodeURIComponent(data.email)}`;
      const res = await fetch(url, { headers: { "x-api-key": key } });
      if (res.status === 404) return { mode: "hub", active: false, roles: [], permissions: [] };
      if (!res.ok) return { mode: "error", message: `Access Hub returned ${res.status}` };
      const j = (await res.json()) as Record<string, unknown>;
      const u = (j["user"] as Record<string, unknown>) ?? j;
      const toStr = (v: unknown) =>
        Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String((x as { name?: string | undefined })?.name ?? x))) : [];
      const status = String(u["status"] ?? (u["active"] === false ? "inactive" : "active")).toLowerCase();
      return {
        mode: "hub",
        active: status === "active",
        roles: toStr(u["roles"]),
        permissions: toStr(u["permissions"]),
        name: typeof u["name"] === "string" ? (u["name"] as string) : undefined,
      };
    } catch (e) {
      return { mode: "error", message: e instanceof Error ? e.message : "Network error" };
    }
  });
