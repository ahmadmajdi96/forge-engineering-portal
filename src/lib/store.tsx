import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Module } from "./permissions";

export type Status = "Draft" | "Under Review" | "Approved" | "Active";
export const STAGES: Status[] = ["Draft", "Under Review", "Approved", "Active"];

export type Entity = {
  id: string;
  kind: Exclude<Module, "changes">;
  name: string;
  version: number;
  status: Status;
  data: Record<string, unknown>;
  updatedAt: string;
};
export type LogEntry = {
  id: string; entityId: string; entityName: string; kind: string; at: string;
  user: string; action: string; note?: string | undefined; signature?: string | undefined; version: number;
};
export type Session = { email: string; name?: string | undefined; roles: string[]; permissions: string[]; source: "hub" | "demo" };

type State = { entities: Entity[]; log: LogEntry[] };
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

const SEED: State = {
  entities: [
    { id: "ln1", kind: "lines", name: "Line A – Final Assembly", version: 3, status: "Active", updatedAt: now(),
      data: { area: "Plant 1 / Hall B", taktSec: 90, bufferRule: "FIFO", bufferCap: 4, sequence: ["ws1", "ws2", "ws3"] } },
    { id: "ln2", kind: "lines", name: "Line B – Sub-Assembly", version: 1, status: "Draft", updatedAt: now(),
      data: { area: "Plant 1 / Hall C", taktSec: 120, bufferRule: "Kanban", bufferCap: 6, sequence: ["ws4"] } },
    { id: "ws1", kind: "workstations", name: "WS-A10 Torque Station", version: 2, status: "Active", updatedAt: now(),
      data: { line: "ln1", cycleSec: 85, scanner: "Zebra DS3678", printer: "—", machine: "m1", ip: "10.20.1.10" } },
    { id: "ws2", kind: "workstations", name: "WS-A20 Vision Check", version: 1, status: "Approved", updatedAt: now(),
      data: { line: "ln1", cycleSec: 60, scanner: "Cognex DM260", printer: "—", machine: "m2", ip: "10.20.1.11" } },
    { id: "ws3", kind: "workstations", name: "WS-A30 Pack & Label", version: 1, status: "Under Review", updatedAt: now(),
      data: { line: "ln1", cycleSec: 70, scanner: "Zebra DS3678", printer: "Zebra ZT411", machine: "", ip: "10.20.1.12" } },
    { id: "ws4", kind: "workstations", name: "WS-B10 Harness Prep", version: 1, status: "Draft", updatedAt: now(),
      data: { line: "ln2", cycleSec: 110, scanner: "", printer: "", machine: "", ip: "10.20.2.10" } },
    { id: "m1", kind: "machines", name: "Atlas Copco PF6000", version: 4, status: "Active", updatedAt: now(),
      data: { vendor: "Atlas Copco", serial: "PF6-22871", protocol: "OPC UA", endpoint: "opc.tcp://10.20.1.50:4840", calInterval: 180, lastCal: "2026-08-14" } },
    { id: "m2", kind: "machines", name: "Cognex In-Sight 9912", version: 2, status: "Active", updatedAt: now(),
      data: { vendor: "Cognex", serial: "IS9-00412", protocol: "MQTT", endpoint: "mqtt://edge-a:1883/vision", calInterval: 90, lastCal: "2026-10-02" } },
    { id: "op1", kind: "operator-app", name: "Torque Fastening Procedure", version: 2, status: "Active", updatedAt: now(),
      data: { steps: [
        { id: "s1", title: "Scan part serial", instruction: "Scan the DMC label on the housing.", evidence: "scan" },
        { id: "s2", title: "Fasten 4x M8 bolts", instruction: "Use PF6000 program 12, cross pattern.", evidence: "measurement", min: 24, max: 26, unit: "Nm" },
        { id: "s3", title: "Photo of assembly", instruction: "Capture top view.", evidence: "camera" },
      ] } },
    { id: "hmi1", kind: "hmi", name: "Line A Andon Panel", version: 1, status: "Under Review", updatedAt: now(),
      data: { cols: 4, theme: "dark", fontScale: 1, tiles: [
        { id: "t1", label: "OEE", binding: "line.A.oee", type: "kpi" },
        { id: "t2", label: "Output", binding: "line.A.count", type: "kpi" },
        { id: "t3", label: "Call Maintenance", binding: "andon.maint", type: "button" },
        { id: "t4", label: "Call Quality", binding: "andon.quality", type: "button" },
      ] } },
  ],
  log: [],
};

type Ctx = State & {
  session: Session | null;
  setSession: (s: Session | null) => void;
  upsert: (e: Omit<Entity, "id" | "version" | "status" | "updatedAt"> & { id?: string }) => string;
  transition: (id: string, to: Status, note?: string, signature?: string) => void;
  remove: (id: string) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
};
const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(SEED);
  const [session, setSessionState] = useState<Session | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem("ep.state"); if (s) setState(JSON.parse(s));
      const ss = localStorage.getItem("ep.session"); if (ss) setSessionState(JSON.parse(ss));
      const t = localStorage.getItem("ep.theme"); if (t === "light") setTheme("light");
    } catch { /* ignore */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem("ep.state", JSON.stringify(state)); }, [state, ready]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (ready) localStorage.setItem("ep.theme", theme);
  }, [theme, ready]);

  const setSession = (s: Session | null) => {
    setSessionState(s);
    if (s) localStorage.setItem("ep.session", JSON.stringify(s)); else localStorage.removeItem("ep.session");
  };
  const user = session?.email ?? "unknown";
  const addLog = (st: State, e: Entity, action: string, note?: string, signature?: string): LogEntry[] => [
    { id: uid(), entityId: e.id, entityName: e.name, kind: e.kind, at: now(), user, action, note, signature, version: e.version },
    ...st.log,
  ];

  const upsert: Ctx["upsert"] = (input) => {
    const id = input.id ?? uid();
    setState((st) => {
      const prev = st.entities.find((x) => x.id === id);
      // Editing a released revision forks a new Draft revision.
      const released = prev && prev.status !== "Draft";
      const e: Entity = {
        id, kind: input.kind, name: input.name, data: input.data, updatedAt: now(),
        version: prev ? (released ? prev.version + 1 : prev.version) : 1,
        status: "Draft",
      };
      const action = !prev ? "Created" : released ? `New revision v${e.version} from ${prev.status}` : "Edited";
      return { entities: prev ? st.entities.map((x) => (x.id === id ? e : x)) : [...st.entities, e], log: addLog(st, e, action) };
    });
    return id;
  };
  const transition: Ctx["transition"] = (id, to, note, signature) =>
    setState((st) => {
      const prev = st.entities.find((x) => x.id === id); if (!prev) return st;
      const e = { ...prev, status: to, updatedAt: now() };
      return { entities: st.entities.map((x) => (x.id === id ? e : x)), log: addLog(st, e, `${prev.status} → ${to}`, note, signature) };
    });
  const remove = (id: string) =>
    setState((st) => {
      const e = st.entities.find((x) => x.id === id); if (!e) return st;
      return { entities: st.entities.filter((x) => x.id !== id), log: addLog(st, e, "Deleted") };
    });

  return (
    <C.Provider value={{ ...state, session, setSession, upsert, transition, remove, theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </C.Provider>
  );
}
export const useStore = () => { const c = useContext(C); if (!c) throw new Error("no store"); return c; };
export const newId = uid;
