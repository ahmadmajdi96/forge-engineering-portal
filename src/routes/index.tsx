import { EngineeringOverview } from '@/components/engineering/reference-assets';
import { DiagnosticsPage } from '@/components/engineering/support-pages';
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore, STAGES } from "@/lib/store";
import { Panel, StatusBadge, VersionBadge } from "@/components/ui-kit";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { name: "twitter:card", content: "summary" },
    { property: "og:type", content: "website" },
    { title: "Overview · Engineering Portal" },
    { name: "description", content: "Scoped engineering readiness, release blockers, stale signals and deployment evidence." },
    { property: "og:title", content: "Overview · Engineering Portal" },
    { property: "og:description", content: "Engineering readiness, release blockers and verified deployment evidence." },
  ] }),
  component: EngineeringOverview,
});

function Overview() {
  const { entities, log } = useStore();
  const lines = entities.filter((e) => e.kind === "lines");
  const ws = entities.filter((e) => e.kind === "workstations");
  const byId = Object.fromEntries(entities.map((e) => [e.id, e]));
  const pending = entities.filter((e) => e.status === "Under Review" || e.status === "Approved");
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-sm font-semibold">Engineering overview</h1>
      <div className="grid grid-cols-4 gap-3">
        {STAGES.map((s) => (
          <Panel key={s}><div className="flex items-center justify-between"><StatusBadge s={s} /><span className="font-mono text-2xl">{entities.filter((e) => e.status === s).length}</span></div></Panel>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Asset hierarchy">
          <ul className="font-mono text-xs">
            <li className="text-muted-foreground">▾ Plant 1</li>
            {lines.map((l) => (
              <li key={l.id} className="pl-4">
                <Link to="/lines" className="hover:text-primary">▾ {l.name}</Link> <VersionBadge v={l.version} />
                <ul>{ws.filter((w) => w.data.line === l.id).map((w) => {
                  const m = byId[w.data.machine as string];
                  return <li key={w.id} className="pl-4">├ <Link to="/workstations" className="hover:text-primary">{w.name}</Link> <StatusBadge s={w.status} />
                    {m && <div className="pl-6 text-muted-foreground">└ ⚙ {m.name}</div>}</li>;
                })}</ul>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={`Awaiting sign-off (${pending.length})`}>
          <ul className="divide-y divide-border">
            {pending.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-1.5 text-xs">
                <span><span className="font-mono text-[10px] uppercase text-muted-foreground">{e.kind}</span> · {e.name}</span>
                <span className="flex gap-1"><VersionBadge v={e.version} /><StatusBadge s={e.status} /></span>
              </li>
            ))}
            {pending.length === 0 && <li className="text-xs text-muted-foreground">Nothing pending.</li>}
          </ul>
        </Panel>
      </div>
      <Panel title="Recent changes">
        <ul className="space-y-1 text-xs">{log.slice(0, 8).map((l) => <li key={l.id} className="font-mono"><span className="text-muted-foreground">{new Date(l.at).toLocaleTimeString()}</span> {l.user} · {l.entityName} · {l.action}</li>)}
          {log.length === 0 && <li className="text-muted-foreground">No changes yet this session.</li>}</ul>
      </Panel>
    </div>
  );
}
