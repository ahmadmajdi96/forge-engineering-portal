import type { EngineeringModel } from "./model";
// The first generation of Studio stored its definitions in the engineering revision.
export function legacyStudioFields(model?: EngineeringModel) {
  return {
    steps: model?.steps ?? [],
    offline: model?.offline ?? "online-required",
    offlineMinutes: model?.offlineMinutes ?? 0,
    appWorkflows: model?.appWorkflows ?? {},
    records: (model?.records ?? [])
      .filter((r) => ["app", "screen", "widget"].includes(r.kind))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
  };
}
