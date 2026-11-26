/** Normalization repairs URL selectors; selection is a deliberate parent change. */
export type ScopeChangeReason = "normalize" | "select";

const dependentKeys = [
  "engAsset",
  "step",
  "stepId",
  "routeId",
  "signal",
  "mapping",
  "app",
  "terminal",
  "source",
  "entity",
  "profile",
  "kind",
  "view",
  "revision",
  "space",
  "occurrence",
  "line",
  "station",
  "asset",
  "assetKind",
  "layoutId",
  "layoutType",
  "setup",
  "setupSite",
  "setupItem",
  "setupType",
] as const;
const studioKeys = [
  "app",
  "revision",
  "terminal",
  "source",
  "entity",
  "profile",
  "kind",
  "view",
] as const;
const placementKeys = [
  "space",
  "occurrence",
  "line",
  "station",
  "asset",
  "assetKind",
  "layoutId",
  "layoutType",
] as const;
const registryKeys = [
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
] as const;

/**
 * Reconcile selectors without replacing a separately identified destination.
 * Authorization and physical identity validation remain the destination's job.
 * This function never creates an asset, placement, application or revision ID.
 */
export function scopeChangeSearch(
  current: Record<string, unknown>,
  scope: Record<string, unknown>,
  destination: string,
  reason: ScopeChangeReason = "select",
): Record<string, unknown> {
  const path = destination.replace(/\/$/, "") || "/";
  const changed = (key: string) => key in scope && (current[key] ?? "") !== (scope[key] ?? "");
  // Adding the initial authorized site is not an intentional factory switch.
  const siteChanged = changed("site") && current["site"] !== undefined && current["site"] !== "";
  const parentChanged = changed("engLine") || changed("engStation");
  const hadParent = Boolean(current["engLine"] || current["engStation"]);
  const repairing = reason === "normalize" || !hadParent;
  if (!siteChanged && !parentChanged) return { ...current, ...scope };

  const result = { ...current };
  for (const key of dependentKeys) delete result[key];
  if (siteChanged) {
    delete result["engLine"];
    delete result["engStation"];
    delete result["registryLine"];
  }
  const restore = (keys: readonly string[]) => {
    for (const key of keys) if (key in current) result[key] = current[key];
  };

  if (path === "/registry" || path === "/reports") {
    // A report or registry filter is site-level state, not a station selection.
    restore(registryKeys);
    if (siteChanged) delete result["registryLine"];
  }

  if (!siteChanged && path === "/application-studio") {
    const exactTerminal =
      current["source"] === "terminalId" ||
      (typeof current["terminal"] === "string" && !current["source"]);
    const standaloneApp =
      typeof current["app"] === "string" &&
      !current["source"] &&
      !current["entity"] &&
      !current["profile"];
    // Contextual station/machine/step authoring is invalidated on a real parent
    // selection; independently named apps and assignment terminals are not.
    if (repairing || exactTerminal || standaloneApp) restore(studioKeys);
  }

  if (!siteChanged && repairing && path === "/factory-layout") {
    // Keep the original exact placement and its original inspection context.
    // In particular, never derive asset/engAsset from the normalized selector.
    restore(placementKeys);
  }

  if (siteChanged || !repairing) {
    // Pagination may reset only for an actual user scope change.
    if ("page" in current) result["page"] = 1;
  }
  return { ...result, ...scope };
}
