import { createFileRoute } from "@tanstack/react-router";
import { EntityModule } from "@/components/EntityModule";
import { Field, Input, Select } from "@/components/ui-kit";

export const Route = createFileRoute("/machines")({
  head: () => ({ meta: [
    { title: "Machines · Engineering Portal" },
    { name: "description", content: "Register machines, telemetry protocols, edge connections and calibration." },
    { property: "og:title", content: "Machines · Engineering Portal" },
    { property: "og:description", content: "Register machines, telemetry protocols, edge connections and calibration." },
  ] }),
  component: () => (
    <EntityModule kind="machines" title="Machines" subtitle="Technical configuration, telemetry/edge protocols and calibration"
      defaults={{ vendor: "", serial: "", protocol: "OPC UA", endpoint: "", calInterval: 180, lastCal: "" }}
      group={(e) => String(e.data.protocol)}
      editor={({ data, set, disabled }) => {
        const u = (k: string, v: unknown) => set({ ...data, [k]: v });
        const due = data.lastCal ? new Date(new Date(String(data.lastCal)).getTime() + Number(data.calInterval) * 864e5) : null;
        const overdue = due && due < new Date();
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Vendor"><Input disabled={disabled} value={String(data.vendor)} onChange={(e) => u("vendor", e.target.value)} /></Field>
              <Field label="Serial no."><Input disabled={disabled} value={String(data.serial)} onChange={(e) => u("serial", e.target.value)} /></Field>
            </div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Telemetry / edge connection</h3>
            <div className="grid grid-cols-[160px_1fr] gap-2">
              <Field label="Protocol"><Select disabled={disabled} value={String(data.protocol)} onChange={(e) => u("protocol", e.target.value)}>{["OPC UA", "MQTT", "Modbus TCP", "Profinet", "EtherNet/IP", "REST"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Endpoint"><Input disabled={disabled} value={String(data.endpoint)} onChange={(e) => u("endpoint", e.target.value)} /></Field>
            </div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Calibration</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Interval (days)"><Input type="number" disabled={disabled} value={Number(data.calInterval)} onChange={(e) => u("calInterval", +e.target.value)} /></Field>
              <Field label="Last calibrated"><Input type="date" disabled={disabled} value={String(data.lastCal)} onChange={(e) => u("lastCal", e.target.value)} /></Field>
              <Field label="Next due"><div className={`h-7 font-mono text-xs leading-7 ${overdue ? "text-destructive" : "text-ok"}`}>{due ? due.toISOString().slice(0, 10) : "—"}{overdue && " · OVERDUE"}</div></Field>
            </div>
          </div>
        );
      }} />
  ),
});
