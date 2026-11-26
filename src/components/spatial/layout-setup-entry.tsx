import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Box, Link2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { useFactorySetup } from "@/components/engineering/setup-wizard-context";
import {
  resolveSetupItem,
  setupLayoutSearch,
  type SetupDocument,
  type SetupItemType,
} from "@/components/engineering/setup-wizard-state";

/** Selection is supplied by the real viewport/hierarchy, never inferred from a default line. */
export function LayoutSetupEntry({
  site,
  document,
  savedDocument,
  itemId,
  itemType,
  dirty,
  busy,
  showSave,
  showInspector,
  showHierarchy,
  showItem,
  inspector = false,
}: {
  site: string;
  document: SetupDocument;
  savedDocument: SetupDocument;
  itemId: string | undefined;
  itemType: SetupItemType;
  dirty: boolean;
  busy: boolean;
  showSave: () => void;
  showInspector: () => void;
  showHierarchy?: () => void;
  showItem: (id: string) => void;
  inspector?: boolean;
}) {
  const engineering = useEngineering();
  const wizard = useFactorySetup();
  const [dismissed, setDismissed] = useState(false);
  const [checked, setChecked] = useState(false);
  const dismissalKey = `sentinel-setup-dismissed:${site}:${itemType}:${itemId ?? ""}`;
  const publish = wizard?.publish;
  const focus = useRef(showItem);
  focus.current = showItem;
  const registerFocus = wizard?.registerFocus;
  const guidedId = wizard?.scope?.id;
  useEffect(() => {
    if (!inspector && guidedId) return registerFocus?.(() => focus.current(guidedId));
    return undefined;
  }, [inspector, guidedId, registerFocus]);
  useEffect(() => {
    setChecked(false);
    try {
      setDismissed(sessionStorage.getItem(dismissalKey) === "1");
    } catch {
      setDismissed(false);
    }
    setChecked(true);
  }, [dismissalKey]);
  useEffect(() => {
    publish?.(savedDocument, dirty);
  }, [savedDocument, dirty, publish]);
  const scope = itemId
    ? resolveSetupItem({ site, id: itemId, type: itemType }, document, engineering.workspaceModel)
    : undefined;
  if (
    checked &&
    !scope &&
    !inspector &&
    !wizard?.active &&
    wizard?.actions.includes("ems.factory_layout.view")
  )
    return (
      <section
        className="sentinel-setup sentinel-setup-empty"
        aria-label="Sentinel factory setup entry"
      >
        <Box size={18} aria-hidden="true" />
        <p>Sentinel · Choose a physical space or placed item for setup.</p>
        <Button variant="outline" size="sm" onClick={showHierarchy ?? showInspector}>
          Choose item in hierarchy
        </Button>
      </section>
    );
  if (
    !checked ||
    !scope ||
    (dismissed && !inspector) ||
    wizard?.active ||
    !wizard?.actions.includes("ems.factory_layout.view")
  )
    return null;
  if (inspector)
    return dirty ? (
      <Button variant="outline" className="w-full" onClick={showSave} disabled={busy}>
        <Save size={14} />
        Save layout before setup
      </Button>
    ) : (
      <Button variant="outline" className="w-full" asChild>
        <Link to={"/factory-layout" as never} search={setupLayoutSearch(scope) as never}>
          Start setup for selected item
          <ArrowRight size={14} />
        </Link>
      </Button>
    );
  return (
    <section
      className="sentinel-setup sentinel-setup-entry"
      aria-label="Set up selected physical item"
    >
      <header className="sentinel-setup-header">
        <div className="sentinel-setup-identity">
          <Box size={18} aria-hidden="true" />
          <div>
            <strong>Set up {scope.label}</strong>
            <small>
              Sentinel · {scope.type} {scope.id}
              {scope.asset
                ? ` · ${scope.asset}`
                : scope.station
                  ? ` · ${scope.station}`
                  : scope.line
                    ? ` · ${scope.line}`
                    : " · Engineering link not configured"}
            </small>
          </div>
        </div>
        <div className="sentinel-setup-controls">
          {dirty ? (
            <Button size="sm" onClick={showSave} disabled={busy}>
              <Save size={14} />
              Save layout before setup
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link to={"/factory-layout" as never} search={setupLayoutSearch(scope) as never}>
                Start item setup
                <ArrowRight size={14} />
              </Link>
            </Button>
          )}
          {(!scope.line || !scope.station || (scope.type === "occurrence" && !scope.asset)) && (
            <Button variant="outline" size="sm" onClick={showInspector}>
              <Link2 size={14} />
              Link in Properties
            </Button>
          )}
          {!inspector && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Dismiss setup suggestion for ${scope.label}`}
              onClick={() => {
                setDismissed(true);
                try {
                  sessionStorage.setItem(dismissalKey, "1");
                } catch {
                  /* Dismissal still lasts for this mounted item. */
                }
              }}
            >
              <X size={14} />
              Dismiss
            </Button>
          )}
        </div>
      </header>
    </section>
  );
}
