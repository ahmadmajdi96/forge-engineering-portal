import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";

// These routes load their own site-authorized data or use the separate MES preview.
const independentRoutes = new Set([
  "factory-layout", "factory-process", "application-studio", "factory-releases",
  "factory-assignment", "admin", "approvals", "integrations", "account-recovery",
  "operator", "hmi", "live", "units", "work-orders", "waste-reasons",
]);

export function EngineeringWorkspaceGate({children}:{children:ReactNode}) {
  const {native,site,loadState,reload} = useEngineering();
  const path=useRouterState({select:state=>state.location.pathname});
  if (!native || loadState==="ready" || independentRoutes.has(path.split("/")[1] ?? "")) return children;
  if (loadState==="loading") return <p role="status" className="text-sm text-muted-foreground">Loading engineering workspace…</p>;
  return <section className="max-w-md space-y-3 rounded-lg border bg-card p-5">
    <h1 className="font-display text-lg font-semibold">Engineering workspace unavailable</h1>
    <p role="alert" className="text-sm text-muted-foreground">{site ? "The workspace could not be loaded. Check your access to this factory and try again." : "No factory is assigned to this account."}</p>
    {site && <Button variant="outline" onClick={()=>void reload()}>Retry workspace</Button>}
  </section>;
}
