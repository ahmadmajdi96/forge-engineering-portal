import { compileApplication } from "../studio/model";
import type { ReleaseManifest } from "./protocol";

export function validatePackagedApplication(manifest: ReleaseManifest) {
  const result = compileApplication(manifest.application);
  if (!result.ok) throw new Error("Application package contains invalid Studio content");
  const app = result.app;
  if (
    app.id !== manifest.studio.appId ||
    app.runtimeVersion !== manifest.compatibility.runtime ||
    app.kind !== manifest.kind ||
    app.offlinePolicy !== manifest.offlinePolicy
  ) {
    throw new Error("Application identity or execution policy differs from its manifest");
  }
  if (
    !app.capabilities.every((value) => manifest.compatibility.peripherals.includes(value)) ||
    !app.signals.every(({ id }) => manifest.compatibility.signals.includes(id)) ||
    !app.connectorIds.every((value) => manifest.compatibility.commandPolicies.includes(value))
  ) {
    throw new Error("Application requirements are missing from the compatibility manifest");
  }
  if (
    !app.dependencies.every((dependency) =>
      manifest.dependencies.some(
        (ref) =>
          ref.system === dependency.system &&
          ref.object === dependency.id &&
          ref.revision === dependency.revision,
      ),
    )
  ) {
    throw new Error("Application dependencies are missing from the release manifest");
  }
  // The current player has no verified media artifact reader. Keep unresolvable packages unavailable.
  if (app.media.length) throw new Error("Package media delivery is unavailable");
  return app;
}
