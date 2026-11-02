import { createFileRoute } from "@tanstack/react-router";
import { EntityModule } from "@/components/EntityModule";
import { Field, Input, Select } from "@/components/ui-kit";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/workstations")({
  head: () => ({ meta: [
    { title: "Workstations · Engineering Portal" },
    { name: "description", content: "Configure workstations, operating parameters, hardware bindings and line assignment." },
    { property: "og:title", content: "Workstations · Engineering Portal" },
    { property: "og:description", content: "Configure workstations, operating parameters, hardware bindings and line assignment." },
  ] }),
  component: WS,
});

function WS() {
  const { entities } = useStore();
  const lines = entities.filter((e) => e.kind === "lines");
  const machines = entities.filter((e) => e.kind === "machines");
  return (
    <EntityModule kind="workstations" title="Workstations" subtitle="Operational parameters, hardware bindings and line assignment"
      defaults={{ line: "", cycleSec: 60, scanner: "", printer: "", machine: "", ip: "" }}
      group={(e) => lines.find((l) => l.id === e.data.line)?.name ?? "Unassigned"}
      editor={({ data, set, disabled }) => {
        const u = (k: string, v: unknown) => set({ ...data, [k]: v });
        return (
          <div className="space-y-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Assignment & parameters</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Production line"><Select disabled={disabled} value={String(data.line)} onChange={(e) => u("line", e.target.value)}><option value="">— Unassigned —</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
              <Field label="Target cycle (s)"><Input type="number" disabled={disabled} value={Number(data.cycleSec)} onChange={(e) => u("cycleSec", +e.target.value)} /></Field>
              <Field label="Terminal IP"><Input disabled={disabled} value={String(data.ip)} onChange={(e) => u("ip", e.target.value)} /></Field>
            </div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Hardware bindings</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Barcode scanner"><Input disabled={disabled} value={String(data.scanner)} onChange={(e) => u("scanner", e.target.value)} /></Field>
              <Field label="Label printer"><Input disabled={disabled} value={String(data.printer)} onChange={(e) => u("printer", e.target.value)} /></Field>
              <Field label="Bound machine"><Select disabled={disabled} value={String(data.machine)} onChange={(e) => u("machine", e.target.value)}><option value="">— None —</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            </div>
          </div>
        );
      }} />
  );
}
