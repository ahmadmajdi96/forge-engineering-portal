import { redirect } from "@tanstack/react-router";
import { siteKey, type EmsMode } from "@/lib/production/contracts";
import type { StudioDefinition } from "./model";

export const studioPanes = ["screens", "workflow", "bindings", "preview"] as const;
export type StudioPane = (typeof studioPanes)[number];

export function openFactoryStudio(
  mode: EmsMode,
  search: string,
  view: StudioPane,
  kind?: StudioDefinition["kind"],
): void {
  if (mode === "sandbox") return;
  const site = siteKey.safeParse(new URLSearchParams(search).get("site"));
  throw redirect({
    to: "/application-studio",
    replace: true,
    search: { ...(site.success ? { site: site.data } : {}), ...(kind ? { kind } : {}), view },
  });
}
