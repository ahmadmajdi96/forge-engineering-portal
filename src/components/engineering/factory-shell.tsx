import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Box,
  ClipboardCheck,
  GitBranch,
  LayoutGrid,
  LogOut,
  Network,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { emsSession } from "@/lib/production/session.functions";

const destinations = [
  { path: "/factory-layout", title: "Factory layout", icon: Box },
  { path: "/factory-process", title: "Process routes", icon: GitBranch },
  { path: "/application-studio", title: "Application Studio", icon: LayoutGrid },
  { path: "/factory-releases", title: "Releases", icon: PackageCheck },
  { path: "/factory-assignment", title: "Assignments", icon: Network },
  { path: "/admin/qa", title: "Admin QA", icon: ClipboardCheck },
] as const;

export function FactoryShell({ session }: { session: Awaited<ReturnType<typeof emsSession>> }) {
  const location = useRouterState({ select: (state) => state.location });
  const next = location.pathname + location.searchStr;
  const local = session.mode === "local";
  if (!session.identity) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-4">
        <div className="glass-panel w-full max-w-md rounded-xl p-6">
          <h1 className="font-display text-2xl font-semibold">ManuQube EMS</h1>
          {session.mode === "blocked" ? (
            <p role="alert" className="mt-4 text-sm">
              EMS runtime configuration is invalid.
            </p>
          ) : session.unavailable ? (
            <div className="mt-4 space-y-3">
              <p role="alert" className="text-sm">
                Identity verification is temporarily unavailable.
              </p>
              <a className="text-sm underline" href={next}>
                Retry
              </a>
            </div>
          ) : local ? (
            <form method="post" action="/api/ems/auth/fixture" className="mt-5 grid gap-3">
              <p className="text-sm text-muted-foreground">Local factory fixtures</p>
              <input type="hidden" name="next" value={next} />
              <label className="grid gap-1 text-sm">
                Fixture access token
                <input
                  required
                  name="token"
                  type="password"
                  autoComplete="current-password"
                  className="min-h-10 rounded-md border bg-background px-3"
                />
              </label>
              <Button type="submit">Sign in to fixture</Button>
            </form>
          ) : (
            <Button asChild className="mt-5">
              <a href={`/api/ems/auth/start?next=${encodeURIComponent(next)}`}>Sign in with AMS</a>
            </Button>
          )}
        </div>
      </main>
    );
  }
  const { name, sites } = session.identity;
  const requestedSite = new URLSearchParams(location.searchStr).get("site");
  const site = sites.find((item) => item.key === requestedSite) ?? sites[0];
  const current = destinations.find((entry) => entry.path === location.pathname);
  const scope = site ? "?site=" + encodeURIComponent(site.key) : "";
  return (
    <SidebarProvider>
      <Sidebar className="border-r border-sidebar-border">
        <SidebarHeader className="p-4">
          <Link to="/" className="font-display text-lg font-semibold">
            ManuQube EMS
          </Link>
          {local && <span className="text-xs text-warning">Local fixture</span>}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {destinations.map(({ path, title, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton asChild isActive={location.pathname === path}>
                    <a href={path + scope}>
                      <Icon />
                      <span>{title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4 text-sm text-muted-foreground">{name}</SidebarFooter>
      </Sidebar>
      <div className="min-w-0 flex-1 bg-background text-foreground">
        <header className="flex min-h-14 flex-wrap items-center gap-3 border-b bg-card px-4 py-2">
          <SidebarTrigger />
          <span className="text-sm font-semibold">{current?.title ?? "Engineering"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {site && (
              <label className="flex items-center gap-2 text-sm">
                Factory
                <select
                  value={site.key}
                  onChange={(event) =>
                    location.pathname === "/"
                      ? window.location.assign(destinations[0].path + "?site=" + event.target.value)
                      : window.location.assign(location.pathname + "?site=" + event.target.value)
                  }
                  className="max-w-48 rounded-md border bg-background px-2 py-1.5"
                >
                  {sites.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <form action="/api/ems/auth/sign-out" method="post">
              <Button type="submit" size="sm" variant="outline">
                <LogOut className="size-4" /> Sign out
              </Button>
            </form>
          </div>
        </header>
        <main className="p-4 lg:p-6">
          {current && requestedSite ? (
            <Outlet />
          ) : (
            <section className="max-w-3xl space-y-4">
              <h1 className="font-display text-2xl font-semibold">
                {current ? current.title : "Factory engineering"}
              </h1>
              {!site ? (
                <p role="status" className="text-muted-foreground">
                  No factory workspace is available to this account.
                </p>
              ) : current ? (
                <Button asChild>
                  <a href={current.path + scope}>Open {site.name}</a>
                </Button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {destinations.map(({ path, title, icon: Icon }) => (
                    <a
                      key={path}
                      href={path + scope}
                      className="glass-panel flex items-center gap-3 rounded-lg p-4 hover:bg-muted focus-visible:ring-2"
                    >
                      <Icon className="size-5 text-primary" />
                      {title}
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}
