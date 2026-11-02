import type { Dict } from "@/lib/store";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2, Save, Search } from "lucide-react";
import { useStore, type Entity } from "@/lib/store";
import type { Module } from "@/lib/permissions";
import { Btn, Field, Input, LifecycleBar, Panel, ReadOnlyNote, StatusBadge, VersionBadge, usePerm } from "./ui-kit";

export type EditorProps = { data: Dict; set: (d: Dict) => void; disabled: boolean };

/** Generic list + detail editor shared by every engineering module. */
export function EntityModule({ kind, title, subtitle, defaults, editor, group }: {
  kind: Entity["kind"]; title: string; subtitle: string; defaults: Dict;
  editor: (p: EditorProps) => ReactNode; group?: (e: Entity) => string;
}) {
  const { entities, upsert, remove, log } = useStore();
  const perm = usePerm(kind as Module);
  const list = entities.filter((e) => e.kind === kind);
  const [sel, setSel] = useState<string | null>(list[0]?.id ?? null);
  const [q, setQ] = useState("");
  const cur = list.find((e) => e.id === sel) ?? null;
  const [name, setName] = useState(""); const [data, setData] = useState<Dict>({});
  useEffect(() => { if (cur) { setName(cur.name); setData(cur.data); } }, [cur?.id, cur?.version, cur?.updatedAt]);
  const dirty = cur && (name !== cur.name || JSON.stringify(data) !== JSON.stringify(cur.data));

  const groups = useMemo(() => {
    const m = new Map<string, Entity[]>();
    list.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).forEach((e) => {
      const g = group ? group(e) : "All"; m.set(g, [...(m.get(g) ?? []), e]);
    });
    return [...m.entries()];
  }, [list, q, group]);

  const create = () => { const id = upsert({ kind, name: `New ${title.replace(/s$/, "")}`, data: defaults }); setSel(id); };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div><h1 className="text-sm font-semibold">{title}</h1><p className="text-[11px] text-muted-foreground">{subtitle}</p></div>
        <Btn variant="primary" onClick={create} disabled={!perm.edit}><Plus className="h-3 w-3" />New</Btn>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
        <aside className="overflow-auto border-r border-border">
          <div className="relative p-2"><Search className="absolute left-4 top-4 h-3 w-3 text-muted-foreground" /><Input className="pl-6" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {groups.map(([g, items]) => (
            <div key={g}>
              {group && <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">▾ {g}</div>}
              {items.map((e) => (
                <button key={e.id} onClick={() => setSel(e.id)} className={`flex w-full items-center justify-between gap-2 border-l-2 px-3 py-1.5 text-left text-xs hover:bg-accent ${sel === e.id ? "border-primary bg-accent" : "border-transparent"} ${group ? "pl-5" : ""}`}>
                  <span className="truncate">{e.name}</span><span className="flex shrink-0 gap-1"><VersionBadge v={e.version} /><StatusBadge s={e.status} /></span>
                </button>
              ))}
            </div>
          ))}
          {list.length === 0 && <p className="p-3 text-xs text-muted-foreground">Nothing here yet.</p>}
        </aside>
        <main className="overflow-auto p-4">
          {!cur ? <p className="text-xs text-muted-foreground">Select an item.</p> : (
            <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
              <Panel title={<span className="flex items-center gap-2">{cur.name}<VersionBadge v={cur.version} /><StatusBadge s={cur.status} /></span>}
                actions={perm.edit ? <>
                  <Btn variant="primary" disabled={!dirty} onClick={() => upsert({ id: cur.id, kind, name, data })}><Save className="h-3 w-3" />{cur.status === "Draft" ? "Save draft" : "Save as new revision"}</Btn>
                  <Btn variant="danger" onClick={() => { remove(cur.id); setSel(null); }}><Trash2 className="h-3 w-3" /></Btn></> : <ReadOnlyNote />}>
                <div className="space-y-3">
                  <Field label="Name"><Input value={name} disabled={!perm.edit} onChange={(e) => setName(e.target.value)} /></Field>
                  {editor({ data, set: setData, disabled: !perm.edit })}
                  {cur.status !== "Draft" && perm.edit && <p className="text-[11px] text-muted-foreground">Released revision — saving creates a new Draft v{cur.version + 1}.</p>}
                </div>
              </Panel>
              <div className="space-y-3">
                <Panel title="Lifecycle"><LifecycleBar e={cur} module={kind as Module} /></Panel>
                <Panel title="Change log">
                  <ul className="space-y-2">
                    {log.filter((l) => l.entityId === cur.id).slice(0, 12).map((l) => (
                      <li key={l.id} className="border-l border-border pl-2 text-[11px]">
                        <div className="font-medium">{l.action} <span className="font-mono text-muted-foreground">v{l.version}</span></div>
                        <div className="text-muted-foreground">{l.user} · {new Date(l.at).toLocaleString()}</div>
                        {l.note && <div className="italic">“{l.note}”</div>}
                        {l.signature && <div className="font-mono text-ok">✓ signed {l.signature}</div>}
                      </li>
                    ))}
                    {!log.some((l) => l.entityId === cur.id) && <li className="text-[11px] text-muted-foreground">No changes recorded this session.</li>}
                  </ul>
                </Panel>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
