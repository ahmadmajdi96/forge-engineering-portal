import { z } from "zod";

export const siteKey = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/);
export const workspaceKey = z.enum(["spatial", "studio", "process"]);
export const workspaceScope = z.object({ site: siteKey, workspace: workspaceKey });
export const revisionNumber = z.number().int().min(1).max(2147483647);
export const reasonSchema = z.string().trim().min(3).max(500);
export const siteScope = z.object({ site: siteKey });

export const viewPermission = {
  spatial: "ems.factory_layout.view",
  studio: "ems.application_studio.view",
  process: "ems.factory_process.view",
} as const;
export const editPermission = {
  spatial: "ems.factory_layout.edit",
  studio: "ems.application_studio.edit",
  process: "ems.factory_process.edit",
} as const;
export const qaPermission = "ems.admin_qa.view";
export const releasePermission = {
  view: "ems.factory_releases.view",
  submit: "ems.factory_releases.submit",
  approve: "ems.factory_releases.approve",
  publish: "ems.factory_releases.publish",
} as const;
export type EmsMode = "sandbox" | "local" | "production" | "blocked";
export type SiteSummary = { key: string; name: string };
export type EmsIdentity = { name: string; sites: SiteSummary[] };
