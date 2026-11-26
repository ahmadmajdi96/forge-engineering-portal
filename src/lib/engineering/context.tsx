import { loadFactoryWorkspace, saveFactoryWorkspace } from "@/lib/production/workspace.functions";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { makeModel, modelSchema, type EngineeringModel, validateModel } from "./model";
import { loadWorkspace, saveWorkspace } from "./workspace.functions";
import { toast } from "sonner";
type Context = {
  native: boolean;
  actions: readonly string[];
  fixture: boolean;
  lifecycle: string;
  dirty: boolean;
  loadState: "loading" | "ready" | "error";
  site: string | undefined;
  workspaceModel: EngineeringModel;
  setWorkspaceModel: (m: EngineeringModel) => void;
  lineId: string;
  selectLine: (id: string) => void;
  model: EngineeringModel;
  setModel: (m: EngineeringModel) => void;
  selected: string;
  select: (id: string) => void;
  revision: number;
  authenticated: boolean;
  canSave: boolean;
  busy: boolean;
  save: (review?: boolean) => Promise<boolean>;
  reload: () => Promise<void>;
  issues: ReturnType<typeof validateModel>;
};
const C = createContext<Context | null>(null);
function emptyWorkspace(site: string | undefined): EngineeringModel {
  return {
    name: "Factory engineering",
    scope: site ?? "",
    lines: [],
    stations: [],
    records: [],
    signals: [],
    steps: [],
    routeEdges: [],
    offline: "online-required",
    offlineMinutes: 0,
    mesAck: false,
    edgeAck: false,
    commissioned: false,
    desired: "",
    actual: "Unknown",
    reason: "",
    adapter: {
      protocol: "OPC UA",
      endpoint: "",
      credentialRef: "",
      securityMode: "SignAndEncrypt",
      pollMs: 1000,
    },
  };
}
export function EngineeringProvider({
  children,
  native = false,
  fixture = false,
  actions = [],
  scopeLine,
  scopeStation,
  scopeAsset,
  strictScope = false,
  onScopeChange,
  site,
}: {
  children: ReactNode;
  native?: boolean;
  fixture?: boolean;
  actions?: readonly string[] | undefined;
  scopeLine?: string | null;
  scopeStation?: string | null;
  scopeAsset?: string | null;
  /** Guided setup must never fall back to a different line, station or hardware record. */
  strictScope?: boolean;
  onScopeChange?: (line: string, station: string, reason?: "normalize" | "select") => void;
  site?: string | undefined;
}) {
  const [model, setModel] = useState(() => (native ? emptyWorkspace(site) : makeModel()));
  const [loadState, setLoadState] = useState<Context["loadState"]>(native ? "loading" : "ready");
  const requestId = useRef(0);
  const [baseline, setBaseline] = useState(model);
  const dirty = native && loadState === "ready" && model !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [localStation, setLocalStation] = useState("");
  const [localLine, setLocalLine] = useState("");
  const availableLines = model.lines.filter((line) => !line.archived);
  const requestedLine = scopeLine ?? localLine;
  const requestedStation = model.stations.find((s) => s.id === (scopeStation ?? localStation));
  const lineId =
    (
      availableLines.find((line) => line.id === (requestedLine || requestedStation?.lineId)) ??
      (strictScope ? undefined : availableLines[0])
    )?.id ?? "";
  const currentStations = model.stations.filter((s) => (s.lineId ?? "L-01") === lineId);
  const selected =
    (currentStations.find((s) => s.id === requestedStation?.id) ?? (strictScope ? undefined : currentStations[0]))?.id ?? "";
  useEffect(() => {
    if (strictScope || loadState !== "ready" || !onScopeChange) return;
    if ((scopeLine && scopeLine !== lineId) || (scopeStation && scopeStation !== selected))
      onScopeChange(lineId, selected, "normalize");
  }, [loadState, scopeLine, scopeStation, lineId, selected, onScopeChange, strictScope]);
  function selectLine(id: string) {
    if (strictScope) return;
    if (!availableLines.some((line) => line.id === id)) return;
    const station = model.stations.find((s) => (s.lineId ?? "L-01") === id)?.id ?? "";
    setLocalLine(id);
    setLocalStation(station);
    onScopeChange?.(id, station);
  }
  function select(id: string) {
    if (strictScope) return;
    const station = model.stations.find((s) => s.id === id);
    if (!station || selected === id) return;
    const nextLine = station.lineId ?? "L-01";
    setLocalStation(id);
    setLocalLine(nextLine);
    onScopeChange?.(nextLine, id);
  }
  const [id, setId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [lifecycle, setLifecycle] = useState("Draft");
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useServerFn(loadWorkspace),
    write = useServerFn(saveWorkspace);
  const readNative = useServerFn(loadFactoryWorkspace),
    writeNative = useServerFn(saveFactoryWorkspace);
  async function reload() {
    if (native) {
      if (
        dirty &&
        !window.confirm("Discard unsaved engineering changes and load the saved revision?")
      )
        return;
      const request = ++requestId.current;
      setLoadState("loading");
      setAuthenticated(false);
      try {
        if (!site) throw new Error("No authorized factory.");
        const result = await readNative({ data: { site, workspace: "engineering" } });
        if (request !== requestId.current) return;
        const next =
          result.revision === 0 && result.payload === null
            ? fixture
              ? makeModel()
              : emptyWorkspace(site)
            : modelSchema.parse((result.payload as { model: unknown }).model);
        setModel(next);
        setBaseline(next);
        setRevision(result.revision);
        setLifecycle(
          (result.payload as { lifecycle?: string } | null)?.lifecycle === "In Review"
            ? "In Review"
            : "Draft",
        );
        setAuthenticated(true);
        setLoadState("ready");
      } catch {
        if (request === requestId.current) setLoadState("error");
      }
      return;
    }
    try {
      const w = await load();
      if (w) {
        setId(w.id);
        setRevision(w.revision);
        if (w.model) setModel(w.model);
      }
    } catch {
      toast.error("Shared workspace is unavailable");
    }
  }
  useEffect(() => {
    if (native) {
      void reload();
      return () => {
        requestId.current++;
      };
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setAuthenticated(!!data.session);
        if (data.session) void reload();
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setAuthenticated(!!session);
        if (session) void reload();
        else {
          setId(null);
          setRevision(0);
          setModel(makeModel());
        }
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  const canSave = authenticated && (!native || actions.includes("ems.engineering.edit"));
  const saving = useRef(false);
  async function save(review = false) {
    if (saving.current) return false;
    if (!canSave) {
      toast.error(
        native
          ? "Engineering edit permission is required to save a revision."
          : "Sign in with a verified account to save a shared sandbox revision.",
      );
      return false;
    }
    if (!model.reason.trim()) {
      toast.error("Enter a change reason before saving.");
      return false;
    }
    saving.current = true;
    setBusy(true);
    try {
      if (native && site) {
        const r = await writeNative({
          data: {
            site,
            workspace: "engineering",
            expected: revision,
            payload: { model, lifecycle: review ? "In Review" : "Draft" },
            reason: model.reason,
          },
        });
        setRevision(r.revision);
        setLifecycle(review ? "In Review" : "Draft");
        setBaseline(model);
        toast.success(
          review ? "Engineering revision submitted for review" : "Engineering revision saved",
        );
        return true;
      }
      const r = await write({
        data: {
          id,
          expected: revision,
          model,
          reason: model.reason,
          lifecycle: review ? "In Review" : "Draft",
        },
      });
      setId(r.id);
      setRevision(r.revision);
      toast.success(
        review ? "Sandbox revision submitted for review" : "Immutable sandbox revision saved",
      );
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const line =
    model.lines.find((l) => l.id === lineId && !l.archived) ?? (strictScope ? undefined : model.lines.find((l) => !l.archived));
  const activeLine = line?.id ?? lineId;
  const scopedStations = model.stations.filter((s) => (s.lineId ?? "L-01") === activeLine);
  const stationIds = new Set(scopedStations.map((s) => s.id));
  const scopedRecords = model.records.filter(
    (r) => {
      if (strictScope && ["equipment", "terminal"].includes(r.kind))
        return !r.archived && (selected ? r.parent === selected : stationIds.has(r.parent)) && (!scopeAsset || r.id === scopeAsset);
      return !["operation", "buffer"].includes(r.kind) ||
        r.parent === activeLine || stationIds.has(r.parent) ||
        r.binding.split(",").some((id) => stationIds.has(id.trim()));
    },
  );
  const canonicalStations = scopedStations.map((s) => ({
    ...s,
    equipment: Array.from(
      new Set([
        ...s.equipment.filter((id) => !model.records.some((r) => r.id === id)),
        ...model.records
          .filter(
            (r) => !r.archived && ["equipment", "terminal"].includes(r.kind) && r.parent === s.id,
          )
          .map((r) => r.id),
      ]),
    ),
  }));
  const scoped = {
    ...model,
    name: line?.name ?? model.name,
    scope: line?.plant ?? model.scope,
    stations: canonicalStations,
    records: scopedRecords,
  };
  function updateScoped(next: EngineeringModel) {
    const visibleIds = new Set(scopedRecords.map((r) => JSON.stringify([r.kind, r.id])));
    setModel({
      ...next,
      lines: next.lines.map((l) =>
        l.id === activeLine ? { ...l, name: next.name, plant: next.scope } : l,
      ),
      stations: [
        ...model.stations.filter((s) => (s.lineId ?? "L-01") !== activeLine),
        ...next.stations.map((s) => ({ ...s, lineId: s.lineId ?? activeLine })),
      ],
      records: [
        ...model.records.filter((r) => !visibleIds.has(JSON.stringify([r.kind, r.id]))),
        ...next.records,
      ],
    });
  }
  return (
    <C.Provider
      value={{
        native,
        actions,
        fixture,
        lifecycle,
        site,
        loadState,
        dirty,
        workspaceModel: model,
        setWorkspaceModel: setModel,
        lineId: activeLine,
        selectLine,
        model: scoped,
        setModel: updateScoped,
        selected,
        select,
        revision,
        authenticated,
        canSave,
        busy,
        save,
        reload,
        issues: validateModel(model),
      }}
    >
      {children}
    </C.Provider>
  );
}
export function useEngineering() {
  const c = useContext(C);
  if (!c) throw new Error("Engineering provider missing");
  return c;
}
