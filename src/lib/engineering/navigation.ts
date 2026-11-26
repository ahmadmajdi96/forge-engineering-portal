import {
  BarChart3,
  Boxes,
  Cpu,
  FileText,
  GitBranch,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Network,
  Workflow,
} from "lucide-react";
import type { SiteSummary } from "@/lib/production/contracts";

const sections = [
  {
    label: "Factory Engineering",
    items: [
      { title: "Overview", url: "/", icon: LayoutDashboard },
      {
        title: "Factory layout",
        url: "/factory-layout",
        icon: Boxes,
        access: "ems.factory_layout.view",
      },
      { title: "Production Lines", url: "/lines", icon: Network },
      { title: "Line Engineering", url: "/line-engineering", icon: Network },
      { title: "Production Steps", url: "/asset-steps", icon: ListChecks },
      { title: "Process & Routes", url: "/process-routes", icon: GitBranch },
      {
        title: "Line sections and routes",
        url: "/factory-process",
        icon: GitBranch,
        access: "ems.factory_process.view",
      },
      { title: "Step Templates", url: "/step-templates", icon: ListChecks },
      { title: "Stations", url: "/stations", icon: Boxes },
      { title: "Station composition", url: "/workstations", icon: Boxes },
      { title: "Machines", url: "/machines", icon: Cpu },
      { title: "Terminals & peripherals", url: "/terminals", icon: Cpu },
      { title: "Station Connectivity", url: "/station-connectivity", icon: Network },
      { title: "Command policy", url: "/command-policy", icon: ListChecks },
      { title: "Asset Registry", url: "/registry", icon: Boxes },
    ],
  },
  {
    label: "Application Studio",
    items: [
      {
        title: "Application Studio",
        url: "/application-studio",
        icon: LayoutGrid,
        access: "ems.application_studio.view",
      },
      { title: "Edge App Studio", url: "/edge-app-studio", icon: Workflow },
      { title: "Operator app workflows", url: "/operator-apps", icon: Workflow },
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
    label: "Governance",
    items: [
      { title: "Release & MES Readiness", url: "/release-readiness", icon: GitBranch },
      { title: "Edge Fleet", url: "/edge-fleet", icon: Cpu },
      { title: "Deployments", url: "/deployments", icon: GitBranch },
      { title: "Commissioning", url: "/commissioning", icon: ListChecks },
      { title: "MES Integration", url: "/mes-integration", icon: Network },
      { title: "System Integrations", url: "/integrations", icon: Network },
      { title: "Approval Chain", url: "/approvals", icon: Network },
      { title: "Diagnostics", url: "/diagnostics", icon: BarChart3 },
      { title: "Change Management", url: "/changes", icon: GitBranch },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Reports", url: "/reports", icon: FileText },
      { title: "Admin QA", url: "/admin/qa", icon: BarChart3, access: "ems.admin_qa.view" },
    ],
  },
] as const;
type Entry = (typeof sections)[number]["items"][number];
export const allWorkspaceGroups: ReadonlyArray<{ label: string; items: readonly Entry[] }> =
  sections;
export function workspaceForPath(path: string) {
  const canonical = path === "/operator-app" ? "/operator-apps" : path;
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
  if (!entry) return true;
  if ("access" in entry) return actions.includes(entry.access);
  if (entry.group === "Application Studio")
    return (
      actions.includes("ems.application_studio.view") && actions.includes("ems.engineering.view")
    );
  if (entry.group === "Factory Engineering") return actions.includes("ems.engineering.view");
  return true;
}
export function workspaceGroups(site?: SiteSummary) {
  return allWorkspaceGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      site ? allowedWorkspace(item.url, site.actions ?? []) : !("access" in item),
    ),
  }));
}
