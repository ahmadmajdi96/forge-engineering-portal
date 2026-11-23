import { useRef, useState, type FormEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { emsSession } from "@/lib/production/session.functions";
export function FactoryShell({ session }: { session: Awaited<ReturnType<typeof emsSession>> }) {
  const location = useRouterState({ select: (state) => state.location });
  const next = location.pathname + location.searchStr;
  const local = session.mode === "local";
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const tokenInput = useRef<HTMLInputElement>(null);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const body = new URLSearchParams({ token: tokenInput.current?.value ?? "", next });
    setPending(true);
    setError("");
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? "The access token was rejected. Check the token and try again."
            : "Sign-in is unavailable. Try again in a moment.",
        );
        setPending(false);
        tokenInput.current?.focus();
        tokenInput.current?.select();
        return;
      }
      const result = (await response.json()) as { next: string };
      window.location.assign(result.next);
    } catch {
      setPending(false);
      setError("Could not reach the portal. Check your connection and try again.");
      tokenInput.current?.focus();
    }
  }
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
              <form
                method="post"
                action="/api/ems/auth/fixture"
                onSubmit={signIn}
                aria-busy={pending}
                className="grid gap-4"
              >
                <h2 className="font-display text-lg font-semibold">
                  Sign in to the training workspace
                </h2>
                <input type="hidden" name="next" value={next} />
                <label className="grid gap-1 text-sm">
                  Fixture access token
                  <input
                    ref={tokenInput}
                    aria-describedby={error ? "fixture-error" : undefined}
                    required
                    name="token"
                    type="password"
                    autoComplete="current-password"
                    className="min-h-10 rounded-md border bg-background px-3"
                  />
                </label>
                {error && (
                  <p id="fixture-error" role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" className="min-h-11" disabled={pending}>
                  {pending ? "Signing in…" : "Sign in to fixture"}
                </Button>
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
