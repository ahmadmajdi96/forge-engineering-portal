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
      if (res.status === 401) return { mode: "error", message: "Command Access Hub rejected this portal's system key." };
      if (!res.ok) return { mode: "error", message: `Access Hub returned ${res.status}` };
      const j = (await res.json()) as {
        active?: boolean; roles?: unknown[]; permissions?: unknown[];
        user?: { full_name?: string | null } | null;
      };
      const toStr = (v: unknown) =>
        Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String((x as { key?: string; name?: string })?.key ?? (x as { name?: string })?.name ?? ""))).filter(Boolean) : [];
      return {
        mode: "hub",
        active: j.active === true && !!j.user,
        roles: toStr(j.roles),
        permissions: toStr(j.permissions),
        name: j.user?.full_name ?? undefined,
      };
    } catch (e) {
      return { mode: "error", message: e instanceof Error ? e.message : "Network error" };
    }
  });
