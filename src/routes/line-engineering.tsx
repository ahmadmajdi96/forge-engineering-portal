import type { Dict } from "@/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { EntityModule } from "@/components/EntityModule";
import { Btn, Field, Input, Select } from "@/components/ui-kit";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/line-engineering")({
  head: () => ({ meta: [
    { title: "Production Lines · Engineering Portal" },
    { name: "description", content: "Define production lines, workstation sequencing and buffer rules." },
    { property: "og:title", content: "Production Lines · Engineering Portal" },
    { property: "og:description", content: "Define production lines, workstation sequencing and buffer rules." },
  ] }),
  component: () => <EntityModule kind="lines" title="Production Lines" subtitle="Line structure, workstation sequence and buffer rules"
    defaults={{ area: "", taktSec: 60, bufferRule: "FIFO", bufferCap: 2, sequence: [] }} group={(e) => String(e.data.area || "Unassigned")} editor={(p) => <LineEditor {...p} />} />,
});

function LineEditor({ data, set, disabled }: { data: Dict; set: (d: Dict) => void; disabled: boolean }) {
  const { entities } = useStore();
  const ws = entities.filter((e) => e.kind === "workstations");
  const seq = (data.sequence as string[]) ?? [];
  const u = (k: string, v: unknown) => set({ ...data, [k]: v });
  const move = (i: number, d: number) => { const s = [...seq]; [s[i], s[i + d]] = [s[i + d]!, s[i]!]; u("sequence", s); };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Field label="Area / hall"><Input disabled={disabled} value={String(data.area ?? "")} onChange={(e) => u("area", e.target.value)} /></Field>
        <Field label="Takt time (s)"><Input type="number" disabled={disabled} value={Number(data.taktSec)} onChange={(e) => u("taktSec", +e.target.value)} /></Field>
        <Field label="Buffer rule"><Select disabled={disabled} value={String(data.bufferRule)} onChange={(e) => u("bufferRule", e.target.value)}>{["FIFO", "LIFO", "Kanban", "None"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Buffer capacity"><Input type="number" disabled={disabled} value={Number(data.bufferCap)} onChange={(e) => u("bufferCap", +e.target.value)} /></Field>
      </div>
      <Field label="Workstation sequence">
        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border p-2">
          {seq.map((id, i) => (
            <div key={id} className="flex items-center gap-1">
              {i > 0 && <span className="font-mono text-[10px] text-muted-foreground">→[{String(data.bufferCap)}]→</span>}
              <div className="flex items-center gap-0.5 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-1 text-[11px]">
                <span className="font-mono text-muted-foreground">{(i + 1) * 10}</span> {ws.find((w) => w.id === id)?.name ?? id}
                {!disabled && <><button onClick={() => i > 0 && move(i, -1)}><ArrowUp className="h-3 w-3" /></button><button onClick={() => i < seq.length - 1 && move(i, 1)}><ArrowDown className="h-3 w-3" /></button>
                  <button onClick={() => u("sequence", seq.filter((x) => x !== id))}><X className="h-3 w-3" /></button></>}
              </div>
            </div>
          ))}
          {seq.length === 0 && <span className="text-[11px] text-muted-foreground">No workstations sequenced.</span>}
        </div>
      </Field>
      {!disabled && <div className="flex flex-wrap gap-1">{ws.filter((w) => !seq.includes(w.id)).map((w) => <Btn key={w.id} onClick={() => u("sequence", [...seq, w.id])}>+ {w.name}</Btn>)}</div>}
    </div>
  );
}
