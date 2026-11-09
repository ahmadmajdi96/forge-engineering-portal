import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, STAGES, type Entity } from "@/lib/store";
import { LifecycleBar, Panel, Select, StatusBadge, VersionBadge } from "@/components/ui-kit";
import type { Module } from "@/lib/permissions";
import { WorkspaceHistory } from "@/components/engineering/workspace-history";

export const Route = createFileRoute("/changes")({
  head: () => ({ meta: [
    { name: "twitter:card", content: "summary" },
    { property: "og:type", content: "website" },
    { title: "Change Management · Engineering Portal" },
    { name: "description", content: "Lifecycle board, e-signature approvals and audit log for engineering revisions." },
    { property: "og:title", content: "Change Management · Engineering Portal" },
    { property: "og:description", content: "Lifecycle board, e-signature approvals and audit log for engineering revisions." },
  ] }),
  component: WorkspaceHistory,
});

function Changes() {
  const { entities, log } = useStore();
  const [sel, setSel] = useState<Entity | null>(null);
  const [kind, setKind] = useState("all");
  const cur = sel ? entities.find((e) => e.id === sel.id) ?? null : null;
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between"><h1 className="text-sm font-semibold">Change management</h1>
        <Select className="w-44" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All modules</option>{["lines", "workstations", "machines", "operator-app", "hmi"].map((k) => <option key={k}>{k}</option>)}</Select></div>
      <div className="grid grid-cols-4 gap-3">
        {STAGES.map((s) => (
          <Panel key={s} title={<span className="flex items-center gap-2"><StatusBadge s={s} /></span>}>
            <div className="space-y-1.5">
              {entities.filter((e) => e.status === s && (kind === "all" || e.kind === kind)).map((e) => (
                <button key={e.id} onClick={() => setSel(e)} className={`w-full rounded-sm border p-2 text-left text-xs hover:bg-accent ${cur?.id === e.id ? "border-primary" : "border-border"}`}>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">{e.kind}</div>
                  <div className="flex items-center justify-between gap-1"><span className="truncate">{e.name}</span><VersionBadge v={e.version} /></div>
                </button>
              ))}
            </div>
          </Panel>
        ))}
      </div>
      {cur && <Panel title={`${cur.name} — lifecycle`}><LifecycleBar e={cur} module={cur.kind as Module} /></Panel>}
      <Panel title="Audit trail">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="py-1">Time</th><th>User</th><th>Item</th><th>Rev</th><th>Action</th><th>Reason</th><th>Signature</th></tr></thead>
          <tbody className="divide-y divide-border font-mono">
            {log.map((l) => <tr key={l.id}><td className="py-1">{new Date(l.at).toLocaleString()}</td><td>{l.user}</td><td className="font-sans">{l.entityName}</td><td>v{l.version}</td><td>{l.action}</td><td className="font-sans">{l.note ?? ""}</td><td className="text-ok">{l.signature ? "✓" : ""}</td></tr>)}
            {log.length === 0 && <tr><td colSpan={7} className="py-2 font-sans text-muted-foreground">No entries yet.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
