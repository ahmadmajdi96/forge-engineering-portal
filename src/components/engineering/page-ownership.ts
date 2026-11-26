/** Ownership is a route contract, not a sidebar label. These are existing EMS action keys. */
export type PageOwner = "engineering" | "studio" | "governance";
const studioPaths = new Set([
  "/application-studio",
  "/edge-app-studio",
  "/operator-apps",
  "/operator-app",
  "/procedure-designer",
  "/screen-editor",
  "/hmi-layouts",
]);
const governancePaths = new Set([
  "/release-readiness",
  "/diagnostics",
  "/analytics",
  "/commissioning",
  "/approvals",
  "/changes",
  "/deployments",
  "/edge-fleet",
  "/integrations",
  "/factory-releases",
  "/factory-assignment",
  "/admin/qa",
]);
export function pageOwner(path: string): PageOwner {
  if (studioPaths.has(path)) return "studio";
  if (governancePaths.has(path) || path === "/admin" || path.startsWith("/admin/"))
    return "governance";
  return "engineering";
}
export function recordKindsForPage(path: string): readonly string[] {
  if (pageOwner(path) === "studio") return ["step", "app", "screen", "widget"];
  if (pageOwner(path) === "engineering")
    return [
      "station",
      "signal",
      "equipment",
      "terminal",
      "buffer",
      "command",
      "operation",
      "template",
      "mapping",
    ];
  if (path === "/edge-fleet") return ["node"];
  if (path === "/deployments" || path === "/factory-releases") return ["release"];
  if (path === "/changes") return ["change"];
  if (path === "/approvals") return ["review"];
  if (["/commissioning", "/diagnostics", "/analytics"].includes(path)) return ["test", "evidence"];
  return ["release", "test", "evidence", "change", "review"];
}
/** Native page grants only; sandbox tools keep their existing separate authorization. */
export function nativePageAction(path: string): string | undefined {
  if (path === "/admin" || path.startsWith("/admin/")) return "ems.admin_qa.view";
  if (["/approvals", "/integrations", "/deployments", "/factory-releases"].includes(path))
    return "ems.factory_releases.view";
  if (["/edge-fleet", "/factory-assignment"].includes(path)) return "ems.factory_assignments.view";
  if (path === "/factory-layout") return "ems.factory_layout.view";
  if (path === "/factory-process") return "ems.factory_process.view";
  if (path === "/application-studio") return "ems.application_studio.view";
  if (pageOwner(path) === "studio") return "ems.application_studio.view";
  if (path === "/" || governancePaths.has(path)) return "ems.engineering.view";
  return undefined;
}
