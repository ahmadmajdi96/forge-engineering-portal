import { createServerFn } from "@tanstack/react-start";
import type { EmsIdentity, EmsMode } from "./contracts";

export const emsSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    mode: EmsMode;
    identity: EmsIdentity | null;
    unavailable?: boolean;
  }> => {
    const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
    const { mode, EmsError } = await import("./db.server");
    const current = mode();
    if (current === "sandbox" || current === "blocked") return { mode: current, identity: null };
    setResponseHeader("cache-control", "no-store");
    const { listAuthorizedSites } = await import("./auth.server");
    try {
      return { mode: current, identity: await listAuthorizedSites(getRequest()) };
    } catch (error) {
      return {
        mode: current,
        identity: null,
        unavailable: !(error instanceof EmsError && error.status === 401),
      };
    }
  },
);
