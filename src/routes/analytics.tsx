import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { useStore, STAGES } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [
    { title: "Engineering Analytics · Engineering Portal" },
    { name: "description", content: "Lifecycle, revision and approval analytics across lines, workstations, machines and HMI configurations." },
    { property: "og:title", content: "Engineering Analytics · Engineering Portal" },
    { property: "og:description", content: "Lifecycle, revision and approval analytics for MES engineering data." },
  ] }),
  component: Analytics,
});

const KINDS = ["lines", "workstations", "machines", "operator-app", "hmi"] as const;
const STAGE_COLORS = ["var(--muted-foreground)", "var(--warn)", "var(--info)", "var(--ok)"];
const stageCfg = { Draft: { label: "Draft", color: STAGE_COLORS[0] }, "Under Review": { label: "Under Review", color: STAGE_COLORS[1] }, Approved: { label: "Approved", color: STAGE_COLORS[2] }, Active: { label: "Active", color: STAGE_COLORS[3] } } satisfies ChartConfig;

function Kpi({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card className="glass-panel gap-1 py-4">
      <CardHeader className="px-4"><CardDescription className="text-[10px] uppercase tracking-[0.18em]">{label}</CardDescription></CardHeader>
      <CardContent className="px-4"><div className="font-mono text-2xl font-semibold text-primary">{value}</div><p className="text-[11px] text-muted-foreground">{hint}</p></CardContent>
    </Card>
  );
}

function Analytics() {
  const { entities, log } = useStore();
  const active = entities.filter((e) => e.status === "Active").length;
  const pending = entities.filter((e) => e.status === "Under Review").length;
  const signed = log.filter((l) => l.signature).length;
  const avgRev = entities.length ? (entities.reduce((s, e) => s + e.version, 0) / entities.length).toFixed(1) : "0";

  const byKind = KINDS.map((k) => {
    const row: Record<string, string | number> = { kind: k };
    STAGES.forEach((s) => { row[s] = entities.filter((e) => e.kind === k && e.status === s).length; });
    return row;
  });
  const byStage = STAGES.map((s, i) => ({ stage: s, count: entities.filter((e) => e.status === s).length, fill: STAGE_COLORS[i] }));
  const revisions = [...entities].sort((a, b) => b.version - a.version).slice(0, 8).map((e) => ({ name: e.name.length > 18 ? e.name.slice(0, 17) + "…" : e.name, version: e.version }));
  const byUser = Object.entries(log.reduce<Record<string, number>>((m, l) => ((m[l.user] = (m[l.user] ?? 0) + 1), m), {})).map(([user, count]) => ({ user, count }));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div><h1 className="font-display text-xl font-semibold tracking-tight">Engineering analytics</h1><p className="text-xs text-muted-foreground">Lifecycle health of engineering master data and revisions.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Configured items" value={entities.length} hint={`${active} active in production`} />
        <Kpi label="Awaiting review" value={pending} hint="Pending approval" />
        <Kpi label="E-signatures" value={signed} hint="Signed lifecycle changes" />
        <Kpi label="Avg revision" value={`v${avgRev}`} hint="Across all items" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="glass-panel lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Lifecycle stage by module</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={stageCfg} className="h-64 w-full">
              <BarChart data={byKind}><CartesianGrid vertical={false} strokeOpacity={0.2} /><XAxis dataKey="kind" tickLine={false} axisLine={false} fontSize={11} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={24} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {STAGES.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={STAGE_COLORS[i]} />)}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardHeader><CardTitle className="text-sm">Stage distribution</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={stageCfg} className="h-64 w-full">
              <PieChart><ChartTooltip content={<ChartTooltipContent nameKey="stage" />} />
                <Pie data={byStage} dataKey="count" nameKey="stage" innerRadius={50} outerRadius={85} strokeWidth={2}>{byStage.map((d) => <Cell key={d.stage} fill={d.fill} />)}</Pie>
              </PieChart>
            </ChartContainer>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px]">{byStage.map((d) => <span key={d.stage} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />{d.stage} · {d.count}</span>)}</div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader><CardTitle className="text-sm">Most revised items</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ version: { label: "Revision", color: "var(--primary)" } }} className="h-64 w-full">
              <BarChart data={revisions} layout="vertical"><XAxis type="number" allowDecimals={false} hide /><YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="version" fill="var(--color-version)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardHeader><CardTitle className="text-sm">Change activity by engineer</CardTitle><CardDescription className="text-xs">From the change log</CardDescription></CardHeader>
          <CardContent>
            {byUser.length === 0 ? <p className="py-20 text-center text-xs text-muted-foreground">No changes recorded yet. Edit or approve an item to see activity.</p> : (
              <ChartContainer config={{ count: { label: "Changes", color: "var(--chart-2)" } }} className="h-64 w-full">
                <BarChart data={byUser}><CartesianGrid vertical={false} strokeOpacity={0.2} /><XAxis dataKey="user" tickLine={false} axisLine={false} fontSize={11} /><YAxis allowDecimals={false} width={24} tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
