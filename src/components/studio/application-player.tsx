import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  compileApplication,
  variantColumns,
  variantForWidth,
  type StudioDefinition,
  type StudioScreen,
  type StudioValue,
  type StudioWidget,
  type Variant,
} from "@/lib/studio/model";
import {
  advanceRun,
  setInput,
  startRun,
  type ConnectorRequest,
  type ConnectorResult,
  type RunSnapshot,
  type RuntimeEvent,
  type SignalObservation,
} from "@/lib/studio/runtime";

export type PlayerAdapter = {
  signals?: Record<string, SignalObservation>;
  readMedia?: (artifactId: string, sha256: string) => string | null;
  request?: (request: ConnectorRequest, signal: AbortSignal) => Promise<ConnectorResult>;
  connectivity?: "online" | "offline";
  runId?: string;
};

const field = "min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-foreground";
const qualityTone = "rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground";

const lightTheme = {
  colorScheme: "light",
  "--background": "oklch(0.97 0.006 240)",
  "--foreground": "oklch(0.20 0.02 245)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.20 0.02 245)",
  "--primary": "oklch(0.49 0.10 205)",
  "--primary-foreground": "oklch(0.98 0.005 240)",
  "--muted": "oklch(0.93 0.01 240)",
  "--muted-foreground": "oklch(0.48 0.02 245)",
  "--accent": "oklch(0.92 0.015 230)",
  "--accent-foreground": "oklch(0.20 0.02 245)",
  "--destructive": "oklch(0.52 0.20 25)",
  "--border": "oklch(0.87 0.01 240)",
  "--input": "oklch(0.77 0.01 240)",
  "--ring": "oklch(0.49 0.10 205)",
} as CSSProperties;

export function ScreenGrid({
  screen,
  variant,
  children,
  editor = false,
}: {
  screen: StudioScreen;
  variant: Variant;
  children: (widget: StudioWidget) => ReactNode;
  editor?: boolean;
}) {
  const columns = variantColumns[variant];
  return (
    <div
      data-studio-grid={editor || undefined}
      className={`grid auto-rows-[minmax(2.65rem,auto)] content-start gap-2 p-2 ${editor ? "min-h-64 border border-dashed border-border bg-background" : ""}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {screen.widgets.map((widget) => {
        const bounds = widget.layouts[variant];
        const start = Math.min(bounds.column, columns);
        const width = Math.min(bounds.width, columns - start + 1);
        return (
          <div
            key={widget.id}
            className="min-w-0 break-words"
            style={{
              gridColumn: `${start} / span ${width}`,
              gridRow: `${bounds.row} / span ${bounds.height}`,
            }}
          >
            {children(widget)}
          </div>
        );
      })}
    </div>
  );
}

function safeMediaUrl(url: string | null | undefined): string | undefined {
  if (!url || typeof window === "undefined") return undefined;
  try {
    const target = new URL(url, window.location.origin);
    if (
      target.origin === window.location.origin &&
      ["https:", "http:", "blob:"].includes(target.protocol)
    )
      return target.href;
  } catch {
    return undefined;
  }
  return undefined;
}

function displayObservation(
  app: StudioDefinition,
  item: StudioWidget,
  observation: SignalObservation | undefined,
  now: number,
) {
  const signal = app.signals.find((source) => source.id === item.signalId);
  if (!signal || !observation || observation.quality === "unavailable") return "Unavailable";
  if (observation.quality === "bad") return "Bad quality";
  if (
    !Number.isFinite(observation.observedAt) ||
    !Number.isFinite(observation.receivedAt) ||
    observation.receivedAt < observation.observedAt ||
    observation.receivedAt > now + 1000
  )
    return "Invalid timestamps";
  if (
    now - observation.observedAt > signal.freshnessMs ||
    now - observation.receivedAt > signal.freshnessMs
  )
    return "Stale";
  const typeMatches =
    signal.type === "text"
      ? typeof observation.value === "string"
      : signal.type === "boolean"
        ? typeof observation.value === "boolean"
        : typeof observation.value === "number" && Number.isFinite(observation.value);
  if (!typeMatches) return "Invalid signal value";
  return null;
}

function Trend({ samples }: { samples: NonNullable<SignalObservation["samples"]> }) {
  const finite = samples
    .slice(-48)
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  if (finite.length < 2)
    return <p className="text-xs text-muted-foreground">Waiting for history</p>;
  const min = Math.min(...finite.map((item) => item.value));
  const max = Math.max(...finite.map((item) => item.value));
  const first = finite[0]!.time;
  const duration = Math.max(1, finite.at(-1)!.time - first);
  const points = finite
    .map(
      (item) =>
        `${5 + ((item.time - first) / duration) * 190},${60 - ((item.value - min) / Math.max(0.00001, max - min)) * 55}`,
    )
    .join(" ");
  return (
    <>
      <svg
        role="img"
        aria-label={`Trend across ${finite.length} samples, minimum ${min}, maximum ${max}`}
        viewBox="0 0 200 65"
        className="h-20 w-full text-primary"
      >
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={points} />
      </svg>
      <output className="text-xs text-muted-foreground">
        {min} to {max}
      </output>
    </>
  );
}

export function StudioWidgetView({
  item,
  app,
  run,
  now,
  disabled,
  observation,
  onInput,
  onEvent,
  readMedia,
}: {
  item: StudioWidget;
  app: StudioDefinition;
  run: RunSnapshot | null;
  now: number;
  disabled: boolean;
  observation?: SignalObservation | undefined;
  onInput: (key: string, value: StudioValue | null) => void;
  onEvent: (event: "submit" | "cancel") => void;
  readMedia?: PlayerAdapter["readMedia"];
}) {
  const raw = item.variableId ? run?.values[item.variableId] : null;
  const limit = app.variables.find((candidate) => candidate.id === item.variableId);
  const change = (next: StudioValue | null) => {
    if (item.variableId) onInput(item.variableId, next);
  };
  const controlsDisabled = disabled || !item.variableId || !run;
  const invalid = item.variableId ? run?.invalidInputs.includes(item.variableId) : undefined;
  let body: ReactNode;
  const label = `widget-${item.id}`;
  if (item.kind === "action") {
    return (
      <Button
        type="button"
        className="h-auto w-full whitespace-normal py-2"
        disabled={disabled}
        onClick={() => onEvent(item.event)}
      >
        {item.title}
      </Button>
    );
  }
  if (item.kind === "text" || item.kind === "scan" || item.kind === "evidence") {
    body =
      item.kind === "evidence" ? (
        <textarea
          id={label}
          aria-invalid={invalid}
          disabled={controlsDisabled}
          className={field}
          maxLength={2048}
          value={typeof raw === "string" ? raw : ""}
          onChange={(event) => change(event.target.value)}
          rows={3}
        />
      ) : (
        <input
          id={label}
          aria-invalid={invalid}
          disabled={controlsDisabled}
          className={field}
          maxLength={2048}
          value={typeof raw === "string" ? raw : ""}
          onChange={(event) => change(event.target.value)}
          autoComplete="off"
          placeholder={item.kind === "scan" ? "Scan or type barcode" : undefined}
        />
      );
  } else if (item.kind === "number") {
    body = (
      <>
        <input
          id={label}
          aria-invalid={invalid}
          disabled={controlsDisabled}
          className={field}
          type="number"
          step="any"
          min={limit?.minimum ?? undefined}
          max={limit?.maximum ?? undefined}
          value={typeof raw === "number" ? raw : ""}
          onChange={(event) =>
            change(event.target.value === "" ? null : event.target.valueAsNumber)
          }
        />
        <p className="text-xs text-muted-foreground">
          {item.target !== null && item.tolerance !== null
            ? `Target ${item.target} ± ${item.tolerance} ${item.unit}`
            : item.unit}
        </p>
      </>
    );
  } else if (item.kind === "check") {
    body = (
      <input
        id={label}
        aria-invalid={invalid}
        disabled={controlsDisabled}
        type="checkbox"
        className="size-5 accent-primary"
        checked={raw === true}
        onChange={(event) => change(event.target.checked)}
      />
    );
  } else if (item.kind === "choice") {
    body = (
      <select
        className={field}
        id={label}
        aria-invalid={invalid}
        disabled={controlsDisabled}
        value={typeof raw === "string" ? raw : ""}
        onChange={(event) => change(event.target.value || null)}
      >
        <option value="">Choose one</option>
        {item.choices.map((choice, index) => (
          <option key={index}>{choice}</option>
        ))}
      </select>
    );
  } else if (["signal", "alarm", "trend", "equipment"].includes(item.kind)) {
    const problem = displayObservation(app, item, observation, now);
    const value = observation?.value;
    const display =
      item.kind === "alarm"
        ? value
          ? "Alarm active"
          : "Alarm clear"
        : typeof value === "boolean"
          ? value
            ? "On"
            : "Off"
          : `${value ?? "—"} ${item.unit}`;
    body = problem ? (
      <output className={qualityTone}>{problem}</output>
    ) : (
      <>
        <output
          className={`text-lg font-semibold ${item.kind === "alarm" && value ? "text-destructive" : ""}`}
        >
          {display}
        </output>
        {item.kind === "trend" && <Trend samples={observation?.samples ?? []} />}
      </>
    );
  } else if (item.kind === "countdown") {
    const node = app.nodes.find((candidate) => candidate.id === run?.nodeId);
    body = (
      <output>
        {run && node?.timeoutMs != null
          ? `${Math.ceil(Math.max(0, node.timeoutMs + run.enteredAt - now) / 1000)} s`
          : "No active timer"}
      </output>
    );
  } else if (item.kind === "media") {
    const media = app.media.find((candidate) => candidate.id === item.mediaId);
    const url = media && safeMediaUrl(readMedia?.(media.artifactId, media.sha256));
    body = url ? (
      <img src={url} alt={media.alt} className="max-h-60 max-w-full rounded object-contain" />
    ) : (
      <p className={qualityTone}>{media ? `${media.name} unavailable` : "No media selected"}</p>
    );
  } else if (item.kind === "connection") {
    body = (
      <>
        <span aria-hidden="true" className="h-px bg-primary" />
        <p className="text-sm">{item.content}</p>
      </>
    );
  } else if (item.kind === "table") {
    const rows = item.content
      .split("\n")
      .filter(Boolean)
      .map((row) => row.split("|").map((cell) => cell.trim()));
    const headers = rows.shift() ?? [];
    body = rows.length ? (
      <div className="overflow-auto">
        <table className="w-full text-left text-xs" aria-label={item.title}>
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={index} scope="col" className="border-b border-border px-2 py-1">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {headers.map((_, cell) => (
                  <td key={cell} className="border-b border-border px-2 py-1">
                    {row[cell]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">No rows</p>
    );
  } else {
    body = <p className="whitespace-pre-line text-sm text-muted-foreground">{item.content}</p>;
  }
  return (
    <div className="grid h-full content-start gap-1.5 rounded-md border border-border bg-card p-2.5 text-card-foreground">
      {item.variableId ? (
        <label className="text-sm font-semibold" htmlFor={label}>
          {item.title}
        </label>
      ) : (
        <span className="text-sm font-semibold">{item.title}</span>
      )}
      {body}
    </div>
  );
}

function syntheticSignals(app: StudioDefinition, now: number): Record<string, SignalObservation> {
  return Object.fromEntries(
    app.signals.map((signal, index) => [
      signal.id,
      {
        value:
          signal.type === "number" ? 20 + index : signal.type === "boolean" ? false : "Simulated",
        quality: "good",
        observedAt: now,
        receivedAt: now,
        samples:
          signal.type === "number"
            ? [18, 19, 21, 20].map((value, sample) => ({
                time: now - (3 - sample) * 1000,
                value: value + index,
              }))
            : [],
      },
    ]),
  );
}

export function ApplicationPlayer({
  app,
  mode,
  adapter,
  variant,
  simulationOutcome = "accepted",
}: {
  app: StudioDefinition;
  mode: "simulation" | "player";
  adapter?: PlayerAdapter;
  variant?: Variant;
  simulationOutcome?: ConnectorResult["outcome"];
}) {
  // A mounted player pins a parsed copy. The host may mount a newer definition after
  // the current run finishes. Live adapter observations remain independently updated.
  const [compiled] = useState(() => compileApplication(app));
  const [run, updateRun] = useState<RunSnapshot | null>(null);
  const [clock, setClock] = useState(0);
  const [autoVariant, setAutoVariant] = useState<Variant>("portrait");
  const root = useRef<HTMLElement>(null);
  const current = useRef<RunSnapshot | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const commit = useCallback((next: RunSnapshot) => {
    current.current = next;
    updateRun(next);
  }, []);

  const [live] = useState(mode === "player");
  const offline = live && adapter?.connectivity === "offline";
  const definition = compiled.ok ? compiled.app : null;
  const node = definition?.nodes.find((item) => item.id === run?.nodeId);
  const screen = definition?.screens.find((item) => item.id === node?.screenId);
  const observations = live
    ? adapter?.signals
    : definition
      ? syntheticSignals(definition, clock)
      : {};
  const waitingForConnector = !!run?.pending;
  const clockNeeded = Boolean(
    run && (definition?.signals.length || (!run.outcome && node?.timeoutMs != null)),
  );
  const sequence = run?.sequence;
  const enteredAt = run?.enteredAt;
  const finished = Boolean(run?.outcome);

  const dispatch = useCallback(
    function dispatchEvent(event: RuntimeEvent) {
      const previous = current.current;
      if (!definition || !previous || offline) return;
      const next = advanceRun(definition, previous, event);
      if (next === previous) return;
      commit(next);
      const pending = next.pending;
      if (!pending || pending === previous.pending) return;

      const controller = new AbortController();
      inFlight.current = controller;
      const remaining = Math.max(0, pending.expiresAt - Date.now());
      const timer = window.setTimeout(() => controller.abort(), remaining);

      const accept = (result: ConnectorResult) => {
        const active = current.current;
        if (active?.pending?.id === pending.id) {
          dispatchEvent({ kind: "connector", sequence: next.sequence, now: Date.now(), result });
        }
      };
      const unknown: ConnectorResult = { requestId: pending.id, outcome: "unknown" };
      const abort = () => {
        window.clearTimeout(timer);
        if (inFlight.current === controller) inFlight.current = null;
        accept(unknown);
      };
      controller.signal.addEventListener("abort", abort, { once: true });

      const request = async (): Promise<ConnectorResult> => {
        if (Date.now() >= pending.expiresAt) return unknown;
        if (!live) return { requestId: pending.id, outcome: simulationOutcome };
        if (!adapter?.request) return { requestId: pending.id, outcome: "rejected" };
        try {
          const result = await adapter.request(pending, controller.signal);
          return result?.requestId === pending.id &&
            ["accepted", "rejected", "unknown"].includes(result.outcome)
            ? result
            : unknown;
        } catch {
          return unknown;
        }
      };
      void request().then((result) => {
        window.clearTimeout(timer);
        controller.signal.removeEventListener("abort", abort);
        if (inFlight.current === controller) inFlight.current = null;
        if (!controller.signal.aborted) accept(result);
      });
    },
    [adapter, commit, definition, live, offline, simulationOutcome],
  );

  useEffect(() => {
    if (!root.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAutoVariant(variantForWidth(entry.contentRect.width));
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!clockNeeded) return;
    const tick = () => setClock(Date.now());
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [clockNeeded]);
  useEffect(() => {
    if (
      enteredAt === undefined ||
      sequence === undefined ||
      finished ||
      offline ||
      node?.kind !== "screen" ||
      node.timeoutMs === null
    )
      return;
    const id = window.setTimeout(
      () => dispatch({ kind: "timer", sequence, now: Date.now() }),
      Math.max(0, enteredAt + node.timeoutMs - Date.now()) + 1,
    );
    return () => window.clearTimeout(id);
  }, [dispatch, enteredAt, finished, node, offline, sequence]);
  useEffect(() => {
    if (offline) inFlight.current?.abort();
  }, [offline]);
  useEffect(
    () => () => {
      current.current = null;
      inFlight.current?.abort();
    },
    [],
  );

  if (!definition)
    return (
      <p role="alert" className="text-sm text-destructive">
        Application definition failed validation.
      </p>
    );
  const fire = (kind: "submit" | "cancel") => {
    if (run) dispatch({ kind, sequence: run.sequence, now: Date.now() });
  };
  const input = (key: string, value: StudioValue | null) => {
    if (offline || !current.current || current.current.sequence !== run?.sequence) return;
    commit(setInput(definition, current.current, key, value));
  };
  const blocked = offline || !run || run.outcome !== null || waitingForConnector;
  return (
    <section
      ref={root}
      aria-label={`${definition.name} runtime`}
      className={`rounded-lg border border-border bg-background text-foreground ${definition.theme === "dark" ? "dark" : ""}`}
      data-theme={definition.theme}
      style={
        definition.theme === "light"
          ? lightTheme
          : definition.theme === "dark"
            ? { colorScheme: "dark" }
            : undefined
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <div>
          <h2 className="font-semibold">{definition.name}</h2>
          <p className="text-xs text-muted-foreground">
            {live ? "Player" : "Simulation"} · Runtime {definition.runtimeVersion} ·{" "}
            {variant ?? autoVariant}
          </p>
        </div>
        {!run && (
          <Button
            type="button"
            disabled={offline}
            onClick={() => {
              const now = Date.now();
              setClock(now);
              commit(
                startRun(
                  definition,
                  (live ? adapter?.runId : undefined) ?? crypto.randomUUID(),
                  now,
                ),
              );
            }}
          >
            Start run
          </Button>
        )}
      </header>
      {offline && (
        <p role="status" className="border-b border-border p-3 text-sm text-muted-foreground">
          {definition.offlinePolicy === "read-only-offline"
            ? "Offline. Current screen is read-only."
            : definition.offlinePolicy === "bounded-offline"
              ? "Offline work requires a verified edge grant. Browser actions are paused."
              : "Online connection required to continue."}
        </p>
      )}
      {run && (
        <div className="grid gap-2 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="font-medium">{screen?.name ?? node?.name ?? "Workflow step"}</h3>
            <span className={qualityTone}>
              {run.outcome ?? (waitingForConnector ? "Awaiting connector result" : "In progress")}
            </span>
          </div>
          {run.detail && (
            <p role="alert" className="px-1 text-sm text-destructive">
              {run.detail}
            </p>
          )}
          {screen && !(offline && definition.offlinePolicy !== "read-only-offline") && (
            <ScreenGrid screen={screen} variant={variant ?? autoVariant}>
              {(item) => (
                <StudioWidgetView
                  item={item}
                  app={definition}
                  run={run}
                  now={clock}
                  disabled={blocked}
                  observation={item.signalId ? observations?.[item.signalId] : undefined}
                  onInput={input}
                  onEvent={fire}
                  readMedia={live ? adapter?.readMedia : undefined}
                />
              )}
            </ScreenGrid>
          )}
          {node?.kind === "screen" && !run.outcome && (
            <div className="flex flex-wrap gap-2 px-1 pb-1">
              <Button type="button" disabled={blocked} onClick={() => fire("submit")}>
                Continue
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={blocked}
                onClick={() => fire("cancel")}
              >
                Cancel run
              </Button>
            </div>
          )}
          {run.outcome && !live && (
            <div className="px-1 pb-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  current.current = null;
                  updateRun(null);
                }}
              >
                Reset simulation
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
