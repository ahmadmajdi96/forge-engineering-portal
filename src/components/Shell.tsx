import { Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { Boxes, Cpu, GitBranch, LayoutDashboard, LayoutGrid, ListChecks, LogOut, Moon, Network, Sun, Workflow, Wrench } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useStore } from "@/lib/store";
import { checkAccess } from "@/lib/access.functions";
import { ROLES } from "@/lib/permissions";
import { Btn, Field, Input, Select } from "./ui-kit";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/lines", label: "Production Lines", icon: Network },
  { to: "/workstations", label: "Workstations", icon: Boxes },
  { to: "/machines", label: "Machines", icon: Cpu },
  { to: "/operator-app", label: "Operator App", icon: ListChecks },
  { to: "/hmi", label: "HMI Runtime", icon: LayoutGrid },
  { to: "/changes", label: "Change Management", icon: GitBranch },
] as const;

function SignIn() {
  const { setSession } = useStore();
  const check = useServerFn(checkAccess);
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null); const [demo, setDemo] = useState(false);
  const [role, setRole] = useState<string>(ROLES[0]);
  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await check({ data: { email } });
      if (r.mode === "unconfigured") { setDemo(true); setMsg("Command Access Hub isn't connected yet — choose a demo role."); }
      else if (r.mode === "error") setMsg(r.message);
      else if (!r.active) setMsg("This account is not active in Command Access Hub.");
      else setSession({ email, name: r.name, roles: r.roles, permissions: r.permissions, source: "hub" });
    } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-sm border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-2"><Workflow className="h-5 w-5 text-primary" /><div><div className="text-sm font-semibold">Engineering Portal</div><div className="text-[11px] text-muted-foreground">MES asset & process engineering</div></div></div>
        <div className="space-y-3">
          <Field label="Work email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
          {demo && <Field label="Demo role"><Select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>}
          {msg && <p className="text-[11px] text-warn">{msg}</p>}
          {!demo ? <Btn variant="primary" className="w-full justify-center" disabled={busy || !email.includes("@")} onClick={submit}>{busy ? "Checking access…" : "Verify with Command Access Hub"}</Btn>
            : <Btn variant="primary" className="w-full justify-center" disabled={!email.includes("@")} onClick={() => setSession({ email, roles: [role], permissions: [], source: "demo" })}>Enter as {role}</Btn>}
        </div>
      </div>
    </div>
  );
}

export function Shell() {
  const { session, setSession, theme, toggleTheme } = useStore();
  if (!session) return <SignIn />;
  return (
    <div className="grid h-screen grid-cols-[208px_1fr] bg-background text-foreground">
      <nav className="flex flex-col border-r border-border bg-sidebar">
        <div className="flex h-11 items-center gap-2 border-b border-border px-3"><Wrench className="h-4 w-4 text-primary" /><span className="text-xs font-semibold tracking-wide">ENGINEERING PORTAL</span></div>
        <div className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-sidebar-foreground font-medium" }}>
              <n.icon className="h-3.5 w-3.5" />{n.label}
            </Link>
          ))}
        </div>
        <div className="space-y-2 border-t border-border p-3 text-[11px]">
          <div className="truncate font-medium">{session.name ?? session.email}</div>
          <div className="flex flex-wrap gap-1">{session.roles.map((r) => <span key={r} className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{r}</span>)}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{session.source === "hub" ? "● Access Hub verified" : "○ Demo access"}</div>
          <div className="flex gap-1"><Btn variant="ghost" onClick={toggleTheme} aria-label="Toggle theme">{theme === "dark" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}</Btn><Btn variant="ghost" onClick={() => setSession(null)}><LogOut className="h-3 w-3" />Sign out</Btn></div>
        </div>
      </nav>
      <div className="min-h-0 overflow-auto"><Outlet /></div>
    </div>
  );
}
