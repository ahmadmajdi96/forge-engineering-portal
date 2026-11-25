import {
  EmsSignInLayout,
  ManuQubeEmblem,
  SentinelPresence,
} from "@/components/engineering/ems-persona";
import { EngineeringWorkspaceGate } from "@/components/engineering/workspace-gate";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { VerifiedSignIn } from "@/components/engineering/verified-sign-in";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  Cpu,
  FileText,
  GitBranch,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Search,
  X,
  Network,
  Sun,
  UserCog,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useStore } from "@/lib/store";
import { checkAccess } from "@/lib/access.functions";
import { ROLES } from "@/lib/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import type { EmsIdentity } from "@/lib/production/contracts";

import {
  workspaceGroups,
  allWorkspaceGroups,
  workspaceForPath,
  allowedWorkspace,
} from "@/lib/engineering/navigation";

const inputCls =
  "h-10 w-full rounded-lg border border-border/60 bg-background/50 pl-8 pr-3 text-sm focus:border-primary/50 focus:outline-none";

function SignIn() {
  const { setSession } = useStore();
  const check = useServerFn(checkAccess);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [role, setRole] = useState<string>(ROLES[0]);
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (demo) {
      setSession({ email, roles: [role], permissions: [], source: "demo" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await check({ data: { email } });
      if (r.mode === "unconfigured") {
        setDemo(true);
        setMsg("Command Access Hub isn't connected yet — choose a demo role.");
      } else if (r.mode === "error") setMsg(r.message);
      else if (!r.active) setMsg("This account is not active in Command Access Hub.");
      else {
        setMsg(
          "Hub permissions found. Sign in with a verified account above; email lookup alone does not verify identity.",
        );
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <EmsSignInLayout>
      <VerifiedSignIn />
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Work email
          </span>
          <div className="relative mt-1">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={inputCls}
            />
          </div>
        </label>
        {demo && (
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Demo role
            </span>
            <div className="relative mt-1">
              <UserCog className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </label>
        )}
        {msg && (
          <div className="rounded-lg border border-border/60 bg-background/40 p-2 text-xs text-muted-foreground">
            {msg}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !email.includes("@")}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {demo ? `Enter as ${role}` : busy ? "Checking access…" : "Verify with Command Access Hub"}
        </button>
      </form>
      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Access, roles and permissions are managed in Command Access Hub.
      </p>
    </EmsSignInLayout>
  );
}

type NativeProps = { identity?: EmsIdentity | undefined; site?: string | undefined };

const secondaryPages = new Set([
  "/line-engineering",
  "/asset-steps",
  "/process-routes",
  "/step-templates",
  "/workstations",
  "/command-policy",
  "/edge-app-studio",
  "/operator-apps",
  "/procedure-designer",
  "/screen-editor",
  "/hmi-layouts",
  "/analytics",
  "/reports",
  "/diagnostics",
  "/approvals",
  "/changes",
]);
function AppSidebar({ identity, site }: NativeProps) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isActive = (url: string) => workspaceForPath(path)?.url === url;
  const { session } = useStore();
  const { isMobile, setOpenMobile, state: sidebarState } = useSidebar();
  const [filter, setFilter] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const groups = workspaceGroups(identity?.sites.find((s) => s.key === site));
  const [morePages, setMorePages] = useState(false);

  const effectiveFilter = !isMobile && sidebarState === "collapsed" ? "" : filter;
  const words = effectiveFilter.trim().toLowerCase().split(/\s+/);
  const matchingGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!identity ||
            morePages ||
            !!effectiveFilter.trim() ||
            isActive(item.url) ||
            !secondaryPages.has(item.url)) &&
          words.every((word) => (item.title + " " + group.label).toLowerCase().includes(word)),
      ),
    }))
    .filter((group) => group.items.length > 0);
  function clearFilter() {
    setFilter("");
    searchInput.current?.focus();
  }
  function followLink() {
    setFilter("");
    if (isMobile) setOpenMobile(false);
  }
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:px-1">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            onClick={followLink}
            aria-label="ManuQube EMS overview"
            className="flex items-center gap-2.5"
          >
            <ManuQubeEmblem />
            <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold tracking-tight">ManuQube EMS</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Engineering Management
              </span>
            </div>
          </Link>
          {isMobile && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close navigation"
              onClick={() => setOpenMobile(false)}
            >
              <X />
            </Button>
          )}
        </div>
        <select
          className="h-9 w-full rounded-md border bg-sidebar px-2 text-sm group-data-[collapsible=icon]:hidden"
          aria-label="Open EMS section"
          value={workspaceForPath(path)?.group ?? ""}
          onChange={(event) => {
            const first = groups.find((group) => group.label === event.target.value)?.items[0];
            if (first) {
              followLink();
              void navigate({ to: first.url });
            }
          }}
        >
          {!workspaceForPath(path) && <option value="">Open section</option>}
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <option key={g.label}>{g.label}</option>
            ))}
        </select>
        <div className="relative mt-2 group-data-[collapsible=icon]:hidden">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            ref={searchInput}
            aria-label="Find a workspace"
            placeholder="Find a workspace"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && filter) {
                event.preventDefault();
                event.stopPropagation();
                clearFilter();
              }
            }}
            className="h-10 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/30 pl-9 pr-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <nav aria-label="Engineering workspaces">
          {identity && !effectiveFilter.trim() && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={morePages}
              onClick={() => setMorePages(!morePages)}
            >
              {morePages ? "Show primary pages" : "Show all workspaces"}
            </Button>
          )}
          {!matchingGroups.length && (
            <div className="px-2 py-4 text-sm">
              <p role="status">No matching workspaces.</p>
              <Button variant="link" className="px-0" onClick={clearFilter}>
                Clear search
              </Button>
            </div>
          )}
          {matchingGroups.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                {g.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.url)}
                        tooltip={item.title}
                        className="h-10 rounded-lg data-[active=true]:border data-[active=true]:border-primary/30 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                      >
                        <Link
                          aria-current={isActive(item.url) ? "page" : undefined}
                          onClick={followLink}
                          to={item.url}
                          search={site ? { site } : {}}
                          className="flex items-center gap-3"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:px-1">
        <SentinelPresence />
        <div className="rounded-xl border border-border/60 bg-card/60 p-3 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`status-dot ${session?.source === "hub" ? "text-success" : "text-warning"}`}
            />
            <span className="font-medium">
              {identity
                ? "Factory workspace"
                : session?.source === "verified"
                  ? "Verified sandbox account"
                  : session?.source === "hub"
                    ? "Legacy access session"
                    : "Demo access"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {identity
              ? identity.sites.find((s) => s.key === site)?.name
              : "MES preview · simulated data"}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

const initials = (n: string) =>
  n
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function TopBar({ identity, site }: NativeProps) {
  const transitioning = useRouterState({ select: (state) => state.isLoading });
  const { session, setSession, theme, toggleTheme } = useStore();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const current = workspaceForPath(path);
  if (!identity && !session) return null;
  const name = identity?.name ?? session?.name ?? session?.email ?? "Member";
  const btn =
    "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground transition";
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b border-border/60 bg-background/90 px-2 sm:gap-3 sm:px-4 backdrop-blur-xl">
      {transitioning && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
        >
          <span className="sr-only">Opening workspace…</span>
        </div>
      )}
      <SidebarTrigger className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" />
      <div className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
        <Link to="/">EMS</Link>
        <ChevronRight className="h-3 w-3" />
        <span>{current?.group ?? "—"}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{current?.title ?? "Page"}</span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
        {identity && (
          <select
            aria-label="Factory"
            className="h-10 min-w-0 max-w-56 rounded-lg border bg-card px-2 text-sm"
            value={site ?? ""}
            onChange={(event) => {
              const url = new URL(window.location.href);
              url.search = "";
              url.hash = "";
              const collection = allWorkspaceGroups
                .flatMap((group) => [...group.items])
                .find((item) => item.url !== "/" && url.pathname.startsWith(item.url + "/"));
              if (collection) url.pathname = collection.url;
              else if (/^\/(units|work-orders)\//.test(url.pathname)) url.pathname = "/";
              url.searchParams.set("site", event.target.value);
              window.location.assign(url.href);
            }}
          >
            {identity.sites.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className={`${btn} hover:text-foreground`}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="hidden items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1 sm:flex">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-primary to-info text-[10px] font-bold text-primary-foreground">
            {initials(name)}
          </div>
          <div className="hidden text-xs leading-tight sm:block">
            <div className="font-medium">{name}</div>
            <div className="text-[10px] text-muted-foreground">{session?.roles[0] ?? "Member"}</div>
          </div>
        </div>
        {identity ? (
          <form method="post" action="/api/ems/auth/sign-out">
            <Button title="Sign out" aria-label="Sign out" className={btn} variant="ghost">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              void supabase.auth.signOut();
              setSession(null);
            }}
            title="Sign out"
            aria-label="Sign out"
            className={`${btn} hover:text-destructive`}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </header>
  );
}

export function Shell(props: NativeProps) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const permitted =
    !props.identity ||
    allowedWorkspace(path, props.identity.sites.find((s) => s.key === props.site)?.actions ?? []);
  const { session, setSession } = useStore();
  useEffect(() => {
    if (props.identity) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (s && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))
        setSession({
          email: s.user.email ?? "Verified user",
          roles: ["Viewer"],
          permissions: [],
          source: "verified",
        });
      if (event === "SIGNED_OUT") setSession(null);
    });
    return () => subscription.unsubscribe();
  }, []);
  if (!props.identity && !session) return <SignIn />;
  return (
    <SidebarProvider
      key={path === "/factory-layout" ? "layout" : "portal"}
      defaultOpen={path !== "/factory-layout"}
    >
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <a
          href="#workspace"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:p-3 focus:text-primary-foreground"
        >
          Skip to workspace
        </a>
        <AppSidebar {...props} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar {...props} />
          <main
            id="workspace"
            tabIndex={-1}
            className={
              path === "/factory-layout"
                ? "min-h-0 min-w-0 flex-1 p-2 sm:p-3"
                : "min-h-0 min-w-0 flex-1 p-4 lg:p-6"
            }
          >
            <EngineeringWorkspaceGate>
              {permitted ? (
                <Outlet />
              ) : (
                <section className="ref-surface p-5">
                  <h1>Workspace access required</h1>
                  <p>
                    Your account does not have access to this workspace in the selected factory.
                  </p>
                </section>
              )}
            </EngineeringWorkspaceGate>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
