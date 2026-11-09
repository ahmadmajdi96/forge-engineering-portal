import {HmiDesigner} from '@/components/engineering/reference-studio';
import type { Dict } from "@/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EntityModule } from "@/components/EntityModule";
import { Btn, Field, Input, Select } from "@/components/ui-kit";
import { newId } from "@/lib/store";

type Tile = { id: string; label: string; binding: string; type: "kpi" | "button" | "status" | "text" };

export const Route = createFileRoute("/hmi-layouts")({
  head: () => ({ meta: [
    { name: "twitter:card", content: "summary" },
    { property: "og:type", content: "website" },
    { title: "HMI Runtime · Engineering Portal" },
    { name: "description", content: "Build touchscreen HMI layouts with tile bindings, action buttons and display settings." },
    { property: "og:title", content: "HMI Runtime · Engineering Portal" },
    { property: "og:description", content: "Build touchscreen HMI layouts with tile bindings, action buttons and display settings." },
  ] }),
  component: HmiDesigner,
});

const PALETTE: Omit<Tile, "id">[] = [
  { label: "KPI", binding: "tag.path", type: "kpi" },
  { label: "Status lamp", binding: "tag.state", type: "status" },
  { label: "Action button", binding: "action.id", type: "button" },
  { label: "Text", binding: "tag.text", type: "text" },
];

function Builder({ data, set, disabled }: { data: Dict; set: (d: Dict) => void; disabled: boolean }) {
  const tiles = (data.tiles as Tile[]) ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const u = (k: string, v: unknown) => set({ ...data, [k]: v });
  const t = tiles.find((x) => x.id === sel);
  const updT = (p: Partial<Tile>) => u("tiles", tiles.map((x) => (x.id === sel ? { ...x, ...p } : x)));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Grid columns"><Select disabled={disabled} value={Number(data.cols)} onChange={(e) => u("cols", +e.target.value)}>{[2, 3, 4, 6].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Display theme"><Select disabled={disabled} value={String(data.theme)} onChange={(e) => u("theme", e.target.value)}><option>dark</option><option>light</option></Select></Field>
        <Field label="Font scale"><Input type="number" step={0.1} disabled={disabled} value={Number(data.fontScale)} onChange={(e) => u("fontScale", +e.target.value)} /></Field>
      </div>
      {!disabled && <div className="flex flex-wrap gap-1"><span className="mr-1 self-center text-[10px] uppercase text-muted-foreground">Palette:</span>
        {PALETTE.map((p) => <Btn key={p.label} onClick={() => { const n = { ...p, id: newId() }; u("tiles", [...tiles, n]); setSel(n.id); }}><Plus className="h-3 w-3" />{p.label}</Btn>)}</div>}
      <div className={`rounded-md border-4 border-border p-2 ${data.theme === "light" ? "bg-card" : "bg-sidebar"}`} style={{ fontSize: `${12 * Number(data.fontScale || 1)}px` }}>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Number(data.cols) || 4}, minmax(0,1fr))` }}>
          {tiles.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`flex aspect-[4/3] flex-col items-center justify-center rounded-sm border p-1 ${sel === x.id ? "border-primary ring-1 ring-primary" : "border-border"} ${x.type === "button" ? "bg-primary/20" : "bg-card"}`}>
              <span className="font-semibold">{x.label}</span>
              {x.type === "kpi" && <span className="font-mono text-lg">--.-</span>}
              {x.type === "status" && <span className="mt-1 h-3 w-3 rounded-full bg-ok" />}
              <span className="font-mono text-[0.75em] text-muted-foreground">{x.binding}</span>
            </button>
          ))}
          {tiles.length === 0 && <p className="col-span-full p-6 text-center text-muted-foreground">Empty layout</p>}
        </div>
      </div>
      {t && (
        <div className="grid grid-cols-[1fr_1fr_140px_auto] items-end gap-2 rounded-sm border border-border p-2">
          <Field label="Tile label"><Input disabled={disabled} value={t.label} onChange={(e) => updT({ label: e.target.value })} /></Field>
          <Field label="Binding (tag / action)"><Input disabled={disabled} value={t.binding} onChange={(e) => updT({ binding: e.target.value })} /></Field>
          <Field label="Type"><Select disabled={disabled} value={t.type} onChange={(e) => updT({ type: e.target.value as Tile["type"] })}>{["kpi", "status", "button", "text"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          {!disabled && <Btn variant="danger" onClick={() => { u("tiles", tiles.filter((x) => x.id !== sel)); setSel(null); }}><Trash2 className="h-3 w-3" /></Btn>}
        </div>
      )}
    </div>
  );
}
