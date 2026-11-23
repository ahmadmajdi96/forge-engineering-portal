import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ApplicationPlayer } from "../src/components/studio/application-player";
import { compileApplication, type StudioDefinition } from "../src/lib/studio/model";

type Active = {
  definition: StudioDefinition;
  releaseId: string;
  releaseDigest: string;
  configRevision: string;
};
type State =
  { status: "loading" | "failed" } | { status: "ready"; fixture: boolean; active: Active | null };

export function Kiosk() {
  const kind =
    new URLSearchParams(window.location.search).get("kind") === "hmi" ? "hmi" : "operator";
  const [state, set] = useState<State>({ status: "loading" });
  const [request, retry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/player?kind=${kind}`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Application readback unavailable");
        const result = (await response.json()) as { fixture: boolean; active: Active | null };
        if (result.active && !compileApplication(result.active.definition).ok)
          throw new Error("Invalid application");
        set({ status: "ready", fixture: result.fixture, active: result.active });
      })
      .catch(() => {
        if (!abort.signal.aborted) set({ status: "failed" });
      });
    return () => abort.abort();
  }, [kind, request]);
  return (
    <main>
      <header>
        <div>
          <p>ManuQube Edge Player</p>
          <h1>{kind === "hmi" ? "HMI" : "Operator application"}</h1>
        </div>
        <nav aria-label="Runtime slots">
          <a href={kind === "hmi" ? "/?kind=operator" : "/?kind=hmi"}>
            {kind === "hmi" ? "Operator application" : "HMI"}
          </a>
        </nav>
      </header>
      {state.status === "loading" && <p role="status">Loading signed application…</p>}
      {state.status === "failed" && (
        <section role="alert">
          Could not load the kiosk application.{" "}
          <button
            onClick={() => {
              set({ status: "loading" });
              retry((value) => value + 1);
            }}
          >
            Retry
          </button>
        </section>
      )}
      {state.status === "ready" &&
        (state.active ? (
          <>
            <p>
              {state.fixture
                ? "Isolated fixture simulation"
                : "Read-only player · operator sign-in unavailable"}
            </p>
            <p>
              Release {state.active.releaseId} · Configuration {state.active.configRevision}
            </p>
            <fieldset disabled={!state.fixture}>
              <ApplicationPlayer
                key={state.active.releaseDigest}
                app={state.active.definition}
                mode={state.fixture ? "simulation" : "player"}
                adapter={{ connectivity: "offline" }}
              />
            </fieldset>
          </>
        ) : (
          <section role="status">No verified application is active in this slot.</section>
        ))}
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Kiosk />);
