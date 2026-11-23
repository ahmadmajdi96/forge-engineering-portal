import { useRouterState } from "@tanstack/react-router";
import { Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { emsSession } from "@/lib/production/session.functions";
export function FactoryShell({ session }: { session: Awaited<ReturnType<typeof emsSession>> }) {
  const location = useRouterState({ select: (state) => state.location });
  const next = location.pathname + location.searchStr;
  const local = session.mode === "local";
  if (!session.identity) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-info text-primary-foreground shadow-[var(--shadow-glow)]">
              <Workflow />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Engineering Portal
              </h1>
              <p className="text-xs text-muted-foreground">MES asset &amp; process engineering</p>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-6">
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
                <a href={`/api/ems/auth/start?next=${encodeURIComponent(next)}`}>
                  Sign in with AMS
                </a>
              </Button>
            )}
          </div>
        </div>
      </main>
    );
  }
  return null;
}
