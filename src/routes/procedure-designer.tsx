import type { Dict } from "@/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDown, ArrowUp, Camera, Gauge, Plus, ScanLine, Trash2, Check } from "lucide-react";
import { EntityModule } from "@/components/EntityModule";
import { Btn, Field, Input, Select } from "@/components/ui-kit";
import { newId } from "@/lib/store";

type Step = { id: string; title: string; instruction: string; evidence: "none" | "camera" | "measurement" | "scan" | "confirm"; min?: number; max?: number; unit?: string };

export const Route = createFileRoute("/procedure-designer")({
  head: () => ({ meta: [
    { name: "twitter:card", content: "summary" },
    { property: "og:type", content: "website" },
    { title: "Operator App · Engineering Portal" },
    { name: "description", content: "Author step templates and procedures with evidence requirements and preview before publishing." },
    { property: "og:title", content: "Operator App · Engineering Portal" },
    { property: "og:description", content: "Author step templates and procedures with evidence requirements and preview before publishing." },
  ] }),
  component: () => (
    <EntityModule kind="operator-app" title="Operator App Procedures" subtitle="Step templates, procedure designer, evidence rules and live preview"
      defaults={{ steps: [] }} editor={(p) => <Designer {...p} />} />
  ),
});

const TEMPLATES: Omit<Step, "id">[] = [
  { title: "Scan serial", instruction: "Scan the part label.", evidence: "scan" },
  { title: "Torque check", instruction: "Fasten and record torque.", evidence: "measurement", min: 0, max: 10, unit: "Nm" },
  { title: "Photo evidence", instruction: "Capture a photo of the result.", evidence: "camera" },
  { title: "Visual confirm", instruction: "Confirm the item is OK.", evidence: "confirm" },
];
const ICON = { camera: Camera, measurement: Gauge, scan: ScanLine, confirm: Check, none: Check };

function Designer({ data, set, disabled }: { data: Dict; set: (d: Dict) => void; disabled: boolean }) {
  const steps = (data.steps as Step[]) ?? [];
  const put = (s: Step[]) => set({ ...data, steps: s });
  const upd = (i: number, p: Partial<Step>) => put(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const [pv, setPv] = useState(0);
  const cur = steps[Math.min(pv, steps.length - 1)];
  return (
    <div className="grid gap-3 2xl:grid-cols-[1fr_260px]">
      <div className="space-y-2">
        {!disabled && <div className="flex flex-wrap gap-1"><span className="mr-1 self-center text-[10px] uppercase text-muted-foreground">Templates:</span>
          {TEMPLATES.map((t) => <Btn key={t.title} onClick={() => put([...steps, { ...t, id: newId() }])}><Plus className="h-3 w-3" />{t.title}</Btn>)}</div>}
        {steps.map((s, i) => { const I = ICON[s.evidence]; return (
          <div key={s.id} className="space-y-2 rounded-sm border border-border p-2">
            <div className="flex items-center gap-2"><span className="font-mono text-[10px] text-primary">STEP {String(i + 1).padStart(2, "0")}</span><I className="h-3 w-3 text-muted-foreground" />
              <Input disabled={disabled} value={s.title} onChange={(e) => upd(i, { title: e.target.value })} />
              {!disabled && <><Btn variant="ghost" onClick={() => i > 0 && put(steps.map((x, j) => (j === i ? steps[i - 1]! : j === i - 1 ? s : x)))}><ArrowUp className="h-3 w-3" /></Btn>
                <Btn variant="ghost" onClick={() => i < steps.length - 1 && put(steps.map((x, j) => (j === i ? steps[i + 1]! : j === i + 1 ? s : x)))}><ArrowDown className="h-3 w-3" /></Btn>
                <Btn variant="ghost" onClick={() => put(steps.filter((x) => x.id !== s.id))}><Trash2 className="h-3 w-3" /></Btn></>}
            </div>
            <Input disabled={disabled} value={s.instruction} onChange={(e) => upd(i, { instruction: e.target.value })} />
            <div className="grid grid-cols-4 gap-2">
              <Field label="Evidence"><Select disabled={disabled} value={s.evidence} onChange={(e) => upd(i, { evidence: e.target.value as Step["evidence"] })}>{["none", "confirm", "scan", "camera", "measurement"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
              {s.evidence === "measurement" && <>
                <Field label="Min"><Input type="number" disabled={disabled} value={s.min ?? 0} onChange={(e) => upd(i, { min: +e.target.value })} /></Field>
                <Field label="Max"><Input type="number" disabled={disabled} value={s.max ?? 0} onChange={(e) => upd(i, { max: +e.target.value })} /></Field>
                <Field label="Unit"><Input disabled={disabled} value={s.unit ?? ""} onChange={(e) => upd(i, { unit: e.target.value })} /></Field></>}
            </div>
          </div>); })}
        {steps.length === 0 && <p className="text-xs text-muted-foreground">Add a step from the templates above.</p>}
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Operator preview</div>
        <div className="aspect-[9/16] max-w-[260px] rounded-lg border-4 border-border bg-background p-3 text-xs">
          {cur ? (<div className="flex h-full flex-col">
            <div className="font-mono text-[10px] text-muted-foreground">STEP {Math.min(pv, steps.length - 1) + 1} / {steps.length}</div>
            <div className="mt-1 text-sm font-semibold">{cur.title}</div>
            <p className="mt-1 text-muted-foreground">{cur.instruction}</p>
            <div className="mt-3 flex flex-1 items-center justify-center rounded-sm border border-dashed border-border">
              {cur.evidence === "camera" && <span className="flex items-center gap-1"><Camera className="h-4 w-4" /> Capture photo</span>}
              {cur.evidence === "measurement" && <span className="font-mono">{cur.min}–{cur.max} {cur.unit}</span>}
              {cur.evidence === "scan" && <span className="flex items-center gap-1"><ScanLine className="h-4 w-4" /> Waiting for scan…</span>}
              {(cur.evidence === "confirm" || cur.evidence === "none") && <span>Tap to confirm</span>}
            </div>
            <div className="mt-2 flex gap-1"><Btn className="flex-1 justify-center" onClick={() => setPv(Math.max(0, pv - 1))}>Back</Btn><Btn variant="primary" className="flex-1 justify-center" onClick={() => setPv(Math.min(steps.length - 1, pv + 1))}>Next</Btn></div>
          </div>) : <p className="text-muted-foreground">No steps.</p>}
        </div>
      </div>
    </div>
  );
}
