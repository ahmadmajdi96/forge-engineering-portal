import { RegistryPage } from '@/components/engineering/support-pages';
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useStore, STAGES } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, VersionBadge, Select } from "@/components/ui-kit";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [
    { name: "twitter:card", content: "summary" },
    { property: "og:type", content: "website" },
    { title: "Engineering Reports · Engineering Portal" },
    { name: "description", content: "Canonical station and equipment inventory, calibration evidence and legacy identity crosswalk reports." },
    { property: "og:title", content: "Engineering Reports · Engineering Portal" },
    { property: "og:description", content: "Canonical engineering inventory and legacy identity crosswalk reports." },
  ] }),
  component: RegistryPage,
});

type Tab = "inventory" | "calibration" | "changes";
const TABS: { id: Tab; label: string }[] = [
  { id: "inventory", label: "Master data inventory" },
  { id: "calibration", label: "Machine calibration" },
  { id: "changes", label: "Signed change history" },
];

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const { entities, log } = useStore();
  const [tab, setTab] = useState<Tab>("inventory");
  const [stage, setStage] = useState("all");

  const inventory = entities.filter((e) => stage === "all" || e.status === stage);
  const calibration = useMemo(() => entities.filter((e) => e.kind === "machines").map((m) => {
    const last = m.data.lastCal ? new Date(m.data.lastCal) : null;
    const due = last ? new Date(last.getTime() + Number(m.data.calInterval || 0) * 864e5) : null;
    const days = due ? Math.ceil((due.getTime() - Date.now()) / 864e5) : null;
    return { m, due, days };
  }), [entities]);
  const signed = log.filter((l) => l.signature);

  const exportCurrent = () => {
    if (tab === "inventory") downloadCsv("master-data", [["Module", "Name", "Revision", "Stage", "Updated"], ...inventory.map((e) => [e.kind, e.name, e.version, e.status, e.updatedAt])]);
    if (tab === "calibration") downloadCsv("calibration", [["Machine", "Serial", "Last calibration", "Interval (days)", "Due", "Days left"], ...calibration.map(({ m, due, days }) => [m.name, m.data.serial ?? "", m.data.lastCal ?? "", m.data.calInterval ?? "", due?.toISOString().slice(0, 10) ?? "", days ?? ""])]);
    if (tab === "changes") downloadCsv("signed-changes", [["Time", "User", "Item", "Revision", "Action", "Reason", "Signature"], ...signed.map((l) => [l.at, l.user, l.entityName, l.version, l.action, l.note ?? "", l.signature ?? ""])]);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-xl font-semibold tracking-tight">Reports</h1><p className="text-xs text-muted-foreground">Audit-ready engineering reports with CSV export.</p></div>
        <Button size="sm" onClick={exportCurrent}><Download className="h-4 w-4" />Export CSV</Button>
      </div>
      <div className="flex gap-1 rounded-lg border border-border/60 bg-background/40 p-1 text-xs sm:w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-md px-3 py-1.5 font-medium transition ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>
      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">{TABS.find((t) => t.id === tab)?.label}</CardTitle>
          {tab === "inventory" && <Select className="w-40" value={stage} onChange={(e) => setStage(e.target.value)}><option value="all">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</Select>}
        </CardHeader>
        <CardContent>
          {tab === "inventory" && (
            <Table><TableHeader><TableRow><TableHead>Module</TableHead><TableHead>Name</TableHead><TableHead>Rev</TableHead><TableHead>Stage</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
              <TableBody>{inventory.map((e) => <TableRow key={e.id}><TableCell className="font-mono text-[11px] uppercase text-muted-foreground">{e.kind}</TableCell><TableCell>{e.name}</TableCell><TableCell><VersionBadge v={e.version} /></TableCell><TableCell><StatusBadge s={e.status} /></TableCell><TableCell className="font-mono text-xs">{new Date(e.updatedAt).toLocaleString()}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
          {tab === "calibration" && (
            <Table><TableHeader><TableRow><TableHead>Machine</TableHead><TableHead>Serial</TableHead><TableHead>Last calibration</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{calibration.map(({ m, due, days }) => (
                <TableRow key={m.id}><TableCell>{m.name}</TableCell><TableCell className="font-mono text-xs">{m.data.serial}</TableCell><TableCell className="font-mono text-xs">{m.data.lastCal || "—"}</TableCell><TableCell className="font-mono text-xs">{due ? due.toISOString().slice(0, 10) : "—"}</TableCell>
                  <TableCell>{days === null ? <span className="text-muted-foreground">No data</span> : days < 0 ? <span className="text-destructive">Overdue {-days}d</span> : days <= 30 ? <span className="text-warn">Due in {days}d</span> : <span className="text-ok">OK · {days}d</span>}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          )}
          {tab === "changes" && (
            <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Item</TableHead><TableHead>Rev</TableHead><TableHead>Action</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
              <TableBody>
                {signed.map((l) => <TableRow key={l.id}><TableCell className="font-mono text-xs">{new Date(l.at).toLocaleString()}</TableCell><TableCell>{l.user}</TableCell><TableCell>{l.entityName}</TableCell><TableCell>v{l.version}</TableCell><TableCell>{l.action}</TableCell><TableCell>{l.note}</TableCell></TableRow>)}
                {signed.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No signed changes yet. Approve an item with an e-signature to see it here.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
