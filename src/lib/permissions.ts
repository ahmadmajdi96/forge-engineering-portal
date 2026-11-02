export type Module = "workstations" | "lines" | "machines" | "operator-app" | "hmi" | "changes";
export type Action = "view" | "edit" | "submit" | "approve";

export const ROLES = ["Plant Engineer", "Automation Specialist", "Process Designer", "Viewer"] as const;
export type Role = (typeof ROLES)[number];

const ALL: Module[] = ["workstations", "lines", "machines", "operator-app", "hmi", "changes"];

const MATRIX: Record<Role, { edit: Module[]; approve: boolean }> = {
  "Plant Engineer": { edit: ["workstations", "lines", "machines"], approve: true },
  "Automation Specialist": { edit: ["machines", "hmi"], approve: false },
  "Process Designer": { edit: ["operator-app", "workstations"], approve: false },
  Viewer: { edit: [], approve: false },
};

/** Explicit hub permissions look like "module:action", e.g. "hmi:edit". */
export function can(roles: string[], perms: string[], module: Module, action: Action): boolean {
  if (perms.includes(`${module}:${action}`) || perms.includes("*")) return true;
  return roles.some((r) => {
    const m = MATRIX[r as Role];
    if (!m) return false;
    if (action === "view") return ALL.includes(module);
    if (action === "approve") return m.approve;
    return m.edit.includes(module); // edit + submit
  });
}
