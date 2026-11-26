import { nativePageAction, pageOwner } from "@/components/engineering/page-ownership";
import {
  BarChart3,
  Boxes,
  Cpu,
  GitBranch,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Network,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SiteSummary } from "@/lib/production/contracts";
import { scopeChangeSearch } from "@/lib/engineering/scope-search";

export type WorkspaceEntry = {
  title: string;
  url: string;
  icon: LucideIcon;
  access?: string;
  aliases?: readonly string[];
  primary?: boolean;
};
export type WorkspaceGroup = { label: string; items: readonly WorkspaceEntry[] };

const sections = [
  {
    label: "Engineering",
    items: [
      {
        title: "Overview",
        url: "/",
        icon: LayoutDashboard,
        primary: true,
        aliases: ["Engineering Overview"],
      },
      {
        title: "Factory Layout",
        url: "/factory-layout",
        icon: Boxes,
        access: "ems.factory_layout.view",
        primary: true,
        aliases: ["3D layout", "Buildings floors and sections"],
      },
    ],
  },
  {
    label: "Assets",
    items: [
      {
        title: "Assets",
        url: "/registry",
        icon: Boxes,
        primary: true,
        aliases: [
          "Asset Registry",
          "Reports",
          "inventory",
          "crosswalk",
          "calibration",
          "dated assignments",
          "export",
        ],
      },
      { title: "Lines", url: "/lines", icon: Network, aliases: ["Production Lines"] },
      {
        title: "Line design",
        url: "/line-engineering",
        icon: Network,
        aliases: ["Line Engineering", "topology"],
      },
      { title: "Stations", url: "/stations", icon: Boxes },
      { title: "Station composition", url: "/workstations", icon: Boxes },
      {
        title: "Machines",
        url: "/machines",
        icon: Cpu,
        aliases: ["Equipment components", "hardware"],
      },
      { title: "Terminals & peripherals", url: "/terminals", icon: Cpu },
    ],
  },
  {
    label: "Process Design",
    items: [
      {
        title: "Process Design",
        url: "/factory-process",
        icon: GitBranch,
        access: "ems.factory_process.view",
        primary: true,
        aliases: ["Line sections and routes", "Process routes"],
      },
      {
        title: "Production Steps",
        url: "/asset-steps",
        icon: ListChecks,
        aliases: ["step definitions"],
      },
      { title: "Process & Routes", url: "/process-routes", icon: GitBranch },
      {
        title: "Step Templates",
        url: "/step-templates",
        icon: ListChecks,
        aliases: ["template library"],
      },
    ],
  },
  {
    label: "Connectivity",
    items: [
      {
        title: "Connectivity",
        url: "/station-connectivity",
        icon: Network,
        primary: true,
        aliases: ["Station Connectivity", "Signal bindings", "signals"],
      },
      { title: "Command policy", url: "/command-policy", icon: ListChecks },
      {
        title: "MES mapping",
        url: "/mes-integration",
        icon: Network,
        aliases: ["MES Integration", "resource mapping"],
      },
    ],
  },
  {
    label: "Studio",
    items: [
      {
        title: "Application Studio",
        url: "/application-studio",
        icon: LayoutGrid,
        access: "ems.application_studio.view",
        primary: true,
      },
      { title: "Edge App Studio", url: "/edge-app-studio", icon: Workflow },
      {
        title: "Operator app workflows",
        url: "/operator-apps",
        icon: Workflow,
        aliases: ["Operator App"],
      },
      { title: "Procedure designer", url: "/procedure-designer", icon: ListChecks },
      { title: "Screen Editor", url: "/screen-editor", icon: LayoutGrid },
      { title: "HMI Designer", url: "/hmi-layouts", icon: LayoutGrid },
      {
        title: "Factory releases",
        url: "/factory-releases",
        icon: ListChecks,
        access: "ems.factory_releases.view",
      },
      {
        title: "Factory assignments",
        url: "/factory-assignment",
        icon: Network,
        access: "ems.factory_assignments.view",
      },
    ],
  },
  {
    label: "Readiness",
    items: [
      {
        title: "Readiness",
        url: "/release-readiness",
        icon: GitBranch,
        primary: true,
        aliases: ["Release & MES Readiness", "validation"],
      },
      {
        title: "Diagnostics",
        url: "/diagnostics",
        icon: BarChart3,
        aliases: ["Analytics", "findings"],
      },
      { title: "Commissioning", url: "/commissioning", icon: ListChecks },
      { title: "Approval Chain", url: "/approvals", icon: Network, aliases: ["approvals"] },
      { title: "Change Management", url: "/changes", icon: GitBranch, aliases: ["change impact"] },
      {
        title: "Deployments",
        url: "/deployments",
        icon: GitBranch,
        aliases: ["deployment rollout"],
      },
    ],
  },
  {
    label: "Specialist administration",
    items: [
      { title: "Edge Fleet", url: "/edge-fleet", icon: Cpu },
      { title: "System Integrations", url: "/integrations", icon: Network },
      { title: "Admin QA", url: "/admin/qa", icon: BarChart3, access: "ems.admin_qa.view" },
    ],
  },
] as const satisfies readonly WorkspaceGroup[];

export const allWorkspaceGroups: readonly WorkspaceGroup[] = sections;
export function workspaceForPath(path: string) {
  const canonical =
    path === "/operator-app"
      ? "/operator-apps"
      : path === "/analytics"
        ? "/diagnostics"
        : path === "/reports"
          ? "/registry"
          : path;
  for (const group of allWorkspaceGroups) {
    const entry = group.items.find(
      (item) =>
        item.url === canonical || (item.url !== "/" && canonical.startsWith(item.url + "/")),
    );
    if (entry) return { ...entry, group: group.label };
  }
  return undefined;
}
export function allowedWorkspace(path: string, actions: readonly string[]) {
  const entry = workspaceForPath(path);
  const required = nativePageAction(path);
  if (required && !actions.includes(required)) return false;
  if (!entry) return required ? true : !path.startsWith("/admin");
  if (entry.access) return actions.includes(entry.access);
  if (pageOwner(path) === "studio")
    return (
      actions.includes("ems.application_studio.view") && actions.includes("ems.engineering.view")
    );
  if (required) return true;
  if (
    ["Engineering", "Assets", "Process Design", "Connectivity", "Readiness"].includes(entry.group)
  )
    return actions.includes("ems.engineering.view");
  return true;
}
export function workspaceGroups(site?: SiteSummary) {
  return allWorkspaceGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      site ? allowedWorkspace(item.url, site.actions ?? []) : !item.access,
    ),
  }));
}

const assetContext = new Set([
  "/machines",
  "/terminals",
  "/registry",
  "/station-connectivity",
  "/command-policy",
  "/mes-integration",
  "/release-readiness",
  "/commissioning",
  "/application-studio",
  "/factory-layout",
]);
const studioContext = new Set([
  "/application-studio",
  "/edge-app-studio",
  "/operator-apps",
  "/procedure-designer",
  "/screen-editor",
  "/hmi-layouts",
]);
const revisionContext = new Set([
  ...studioContext,
  "/application-studio",
  "/factory-releases",
  "/factory-assignment",
  "/release-readiness",
  "/approvals",
  "/changes",
  "/deployments",
]);
const setupContext = new Set([
  "/factory-layout",
  "/lines",
  "/line-engineering",
  "/factory-process",
  "/process-routes",
  "/asset-steps",
  "/step-templates",
  "/stations",
  "/workstations",
  "/machines",
  "/terminals",
  "/station-connectivity",
  "/command-policy",
  "/mes-integration",
  "/registry",
  "/application-studio",
  "/edge-app-studio",
  "/operator-apps",
  "/procedure-designer",
  "/screen-editor",
  "/hmi-layouts",
  "/factory-releases",
  "/factory-assignment",
  "/release-readiness",
  "/diagnostics",
  "/commissioning",
  "/approvals",
  "/changes",
  "/deployments",
]);

/** Preserve only known context accepted by the destination; never copy arbitrary query state. */
export function workspaceLinkSearch(current: Record<string, unknown>, destination: string) {
  const result: Record<string, string | undefined> = {};
  const copy = (key: string) => {
    if (typeof current[key] === "string") result[key] = current[key] as string;
    else if (
      (key === "revision" || (destination === "/registry" && (key === "page" || key === "size"))) &&
      typeof current[key] === "number" &&
      Number.isSafeInteger(current[key]) &&
      (current[key] as number) > 0
    )
      result[key] = String(current[key]);
  };
  copy("site");
  if (destination !== "/") {
    copy("engLine");
    copy("engStation");
  }
  if (assetContext.has(destination)) copy("engAsset");
  if (setupContext.has(destination))
    for (const key of ["setup", "setupSite", "setupItem", "setupType"]) copy(key);
  if (destination === "/factory-layout")
    for (const key of [
      "space",
      "occurrence",
      "line",
      "station",
      "asset",
      "assetKind",
      "layoutId",
      "layoutType",
    ])
      copy(key);
  if (studioContext.has(destination))
    for (const key of ["app", "terminal", "source", "entity", "profile", "kind", "view"]) copy(key);
  if (revisionContext.has(destination)) copy("revision");
  if (destination === "/registry")
    for (const key of [
      "view",
      "report",
      "q",
      "registryLine",
      "kind",
      "state",
      "sort",
      "direction",
      "size",
      "page",
    ])
      copy(key);
  if (destination === "/factory-process") for (const key of ["routeId", "stepId"]) copy(key);
  if (destination === "/asset-steps") copy("step");
  if (destination === "/station-connectivity") copy("signal");
  if (destination === "/mes-integration") copy("mapping");
  if (setupContext.has(destination)) for (const key of ["layoutId", "layoutType"]) copy(key);
  return result;
}

/** Explicit scope changes invalidate downstream identities, not application revisions in the same scope. */
export function workspaceScopedSearch(
  current: Record<string, unknown>,
  scope: Record<string, unknown>,
  destination: string,
) {
  return workspaceLinkSearch(scopeChangeSearch(current, scope, destination), destination);
}
