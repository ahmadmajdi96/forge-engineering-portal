import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { VerifiedSignIn } from "@/components/engineering/verified-sign-in";
import { BarChart3, Boxes, ChevronRight, Cpu, FileText, GitBranch, LayoutDashboard, LayoutGrid, ListChecks, Loader2, LogOut, Mail, Moon, Network, Sun, UserCog, Workflow } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useStore } from "@/lib/store";
import { checkAccess } from "@/lib/access.functions";
import { ROLES } from "@/lib/permissions";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";

type NavItem = { title: string; url: "/" | "/lines" | "/stations" | "/live" | "/operator" | "/operator-apps" | "/step-templates" | "/workstations" | "/machines" | "/operator-app" | "/hmi" | "/changes" | "/analytics" | "/reports" | "/line-engineering" | "/station-connectivity" | "/edge-app-studio" | "/release-readiness" | "/registry" | "/process-routes" | "/mes-integration" | "/edge-fleet" | "/diagnostics" | "/screen-editor" | "/hmi-layouts" | "/deployments" | "/commissioning"; icon: typeof Boxes };
const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ title: "Overview", url: "/", icon: LayoutDashboard }] },
  { label: "Asset Engineering", items: [
    { title: "Line Engineering", url: "/line-engineering", icon: Network },
    { title: "Station Connectivity", url: "/station-connectivity", icon: Cpu },
    { title: "Asset Registry", url: "/registry", icon: Boxes },
    { title: "Production Lines", url: "/lines", icon: Network },
    { title: "Stations", url: "/stations", icon: Boxes },
    { title: "Workstations", url: "/workstations", icon: Boxes },
    { title: "Machines", url: "/machines", icon: Cpu },
  ] },
  { label: "Process Design", items: [
    { title: "Process & Routes", url: "/process-routes", icon: GitBranch },
    { title: "Edge App Studio", url: "/edge-app-studio", icon: Workflow },
    { title: "Screen Editor", url: "/screen-editor", icon: LayoutGrid },
    { title: "HMI Designer", url: "/hmi-layouts", icon: LayoutGrid },
    { title: "Live Shopfloor", url: "/live", icon: LayoutDashboard },
    { title: "Operator Consoles", url: "/operator", icon: ListChecks },
    { title: "HMI Runtime", url: "/hmi", icon: LayoutGrid },
    { title: "Step Templates", url: "/step-templates", icon: ListChecks },
  ] },
  { label: "Governance", items: [
    { title: "Release & MES Readiness", url: "/release-readiness", icon: GitBranch },
    { title: "Edge Fleet", url: "/edge-fleet", icon: Cpu },
    { title: "Deployments", url: "/deployments", icon: GitBranch },
    { title: "Commissioning", url: "/commissioning", icon: ListChecks },
    { title: "MES Integration", url: "/mes-integration", icon: Network },
    { title: "Diagnostics", url: "/diagnostics", icon: BarChart3 },
    { title: "Change Management", url: "/changes", icon: GitBranch },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Reports", url: "/reports", icon: FileText },
  ] },
];

const inputCls = "h-10 w-full rounded-lg border border-border/60 bg-background/50 pl-8 pr-3 text-sm focus:border-primary/50 focus:outline-none";

function SignIn() {
  const { setSession } = useStore();
  const check = useServerFn(checkAccess);
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null); const [demo, setDemo] = useState(false);
  const [role, setRole] = useState<string>(ROLES[0]);
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (demo) { setSession({ email, roles: [role], permissions: [], source: "demo" }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await check({ data: { email } });
      if (r.mode === "unconfigured") { setDemo(true); setMsg("Command Access Hub isn't connected yet — choose a demo role."); }
      else if (r.mode === "error") setMsg(r.message);
      else if (!r.active) setMsg("This account is not active in Command Access Hub.");
      else { setMsg("Hub permissions found. Sign in with a verified account above; email lookup alone does not verify identity."); }
    } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-info text-primary-foreground shadow-[var(--shadow-glow)]"><Workflow className="h-5 w-5" /></div>
          <div><h1 className="font-display text-xl font-semibold tracking-tight">Engineering Portal</h1><p className="text-xs text-muted-foreground">MES asset & process engineering</p></div>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <VerifiedSignIn />
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Work email</span>
              <div className="relative mt-1">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={inputCls} />
              </div>
            </label>
            {demo && (
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Demo role</span>
                <div className="relative mt-1">
                  <UserCog className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                </div>
              </label>
            )}
            {msg && <div className="rounded-lg border border-border/60 bg-background/40 p-2 text-xs text-muted-foreground">{msg}</div>}
            <button type="submit" disabled={busy || !email.includes("@")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {demo ? `Enter as ${role}` : busy ? "Checking access…" : "Verify with Command Access Hub"}
            </button>
          </form>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">Access, roles and permissions are managed in Command Access Hub.</p>
        </div>
      </div>
    </div>
  );
}

function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => path === url || (url !== "/" && path.startsWith(`${url}/`));
  const { session } = useStore();
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-info text-primary-foreground shadow-[var(--shadow-glow)]"><Workflow className="h-5 w-5" /></div>
          <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">Engineering Portal</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">MES · Engineering</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2">
        {GROUPS.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className="h-10 rounded-lg data-[active=true]:border data-[active=true]:border-primary/30 data-[active=true]:bg-primary/10 data-[active=true]:text-primary">
                      <Link to={item.url} className="flex items-center gap-3"><item.icon className="h-4 w-4 shrink-0" /><span className="truncate">{item.title}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="rounded-xl border border-border/60 bg-card/60 p-3 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className={`status-dot animate-pulse-glow ${session?.source === "hub" ? "text-success" : "text-warning"}`} />
            <span className="font-medium">{session?.source === "verified" ? "Verified sandbox account" : session?.source === "hub" ? "Legacy access session" : "Demo access"}</span>
          </div>
          <p className="mt-1 text-[10px] text-warning">MES preview · sample data · not connected</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function TopBar() {
  const { session, setSession, theme, toggleTheme } = useStore();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const current = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).find((i) => (i.url === "/" ? path === "/" : path.startsWith(i.url)));
  if (!session) return null;
  const name = session.name ?? session.email;
  const btn = "grid h-9 w-9 place-items-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground transition";
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <span>Engineering</span><ChevronRight className="h-3 w-3" />
        <span>{current?.group ?? "—"}</span><ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{current?.title ?? "Page"}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={toggleTheme} aria-label="Toggle theme" className={`${btn} hover:text-foreground`}>{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-primary to-info text-[10px] font-bold text-primary-foreground">{initials(name)}</div>
          <div className="hidden text-xs leading-tight sm:block"><div className="font-medium">{name}</div><div className="text-[10px] text-muted-foreground">{session.roles[0] ?? "Member"}</div></div>
        </div>
        <Button variant="ghost" onClick={() => {void supabase.auth.signOut();setSession(null);}} title="Sign out" aria-label="Sign out" className={`${btn} hover:text-destructive`}><LogOut className="h-4 w-4" /></Button>
      </div>
    </header>
  );
}

export function Shell() {
  const { session, setSession } = useStore();
  useEffect(() => { const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{if(s&&(event==='SIGNED_IN'||event==='INITIAL_SESSION'))setSession({email:s.user.email??'Verified user',roles:['Viewer'],permissions:[],source:'verified'});if(event==='SIGNED_OUT')setSession(null);});return()=>subscription.unsubscribe();},[]);
  if (!session) return <SignIn />;
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 p-4 lg:p-6"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
