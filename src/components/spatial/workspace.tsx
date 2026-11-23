import { WorkspaceLoading } from "@/components/engineering/workspace-loading";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useBlocker } from "@tanstack/react-router";
import { verifySpatialArtifactContent } from "@/lib/spatial/artifacts";
import { Box, ChevronRight, Crosshair, Layers3, Redo2, Undo2 } from "lucide-react";
import { loadFactoryWorkspace, saveFactoryWorkspace } from "@/lib/production/workspace.functions";
import {
  changeSelection,
  draftReducer,
  mergeSpatialDocuments,
  moveSelection,
  positionSelection,
  sameValue,
  startDraft,
  type DraftEdit,
} from "@/lib/spatial/draft";
import {
  childKind,
  connectionKinds,
  createOccurrence,
  createSpace,
  duplicateOccurrences,
  emptySpatialDocument,
  floorOf,
  origin,
  snapVector,
  spatialDocumentSchema,
  templateKey,
  type Connection,
  type Occurrence,
  type SavedCamera,
  type SpaceNode,
  type SpatialDocument,
  type Vector,
} from "@/lib/spatial/model";
import {
  comparePlacements,
  validateSpatialGeometry,
  validateSpatialRelationships,
} from "@/lib/spatial/validation";
import { embeddedEncodedLimit } from "@/lib/spatial/model";
import {
  button,
  ConnectionEditor,
  control,
  Field,
  FloorControls,
  OccurrenceInspector,
  panel,
  primary,
  TemplateEditor,
  TerminalContext,
} from "./editor-controls";
import { SpatialProjection } from "./projections";
import { connectionColors } from "./palette";
import type { ViewportHandle, VisualRecord } from "./scene";

const Scene = lazy(() => import("./scene"));
type Snapshot = { revision: number; document: SpatialDocument };
const keyFor = (site: string) => ({ site, workspace: "spatial" as const });

function decodeSnapshot(site: string, snapshot: { revision: number; payload: unknown }): Snapshot {
  const document = snapshot.payload
    ? spatialDocumentSchema.parse(snapshot.payload)
    : emptySpatialDocument(site);
  if (document.siteCode !== site) throw new Error("The workspace did not match the selected site.");
  return { revision: snapshot.revision, document };
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function download(document: SpatialDocument, revision: number) {
  const blob = new Blob([JSON.stringify({ baseRevision: revision, document }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(window.document.createElement("a"), {
    href: url,
    download: `ems-layout-${document.siteCode}-r${revision}.json`,
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function treePath(spaces: ReadonlyMap<string, SpaceNode>, id: string) {
  let node = spaces.get(id);
  const path: string[] = [];
  while (node && path.length < 7) {
    path.unshift(node.label);
    node = node.parentId ? spaces.get(node.parentId) : undefined;
  }
  return path.join(" / ");
}

function isWithin(spaces: ReadonlyMap<string, SpaceNode>, nodeId: string, scope: string) {
  let node = spaces.get(nodeId);
  let depth = 0;
  while (node && depth++ < 7) {
    if (node.id === scope) return true;
    node = node.parentId ? spaces.get(node.parentId) : undefined;
  }
  return false;
}

export function FactoryWorkspace({ site }: { site: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;
    setError("");
    setSnapshot(undefined);
    void loadFactoryWorkspace({ data: keyFor(site) })
      .then((response) => {
        if (mounted) setSnapshot(decodeSnapshot(site, response));
      })
      .catch((cause: unknown) => {
        if (mounted) setError(message(cause, "The factory layout could not be loaded."));
      });
    return () => {
      mounted = false;
    };
  }, [site, attempt]);
  if (error)
    return (
      <div className={panel + " min-h-36"}>
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
        <button
          type="button"
          className={button + " mt-3"}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry loading layout
        </button>
      </div>
    );
  if (!snapshot) return <WorkspaceLoading message="Loading factory layout…" />;
  return <LayoutEditor key={site} site={site} initial={snapshot} />;
}

function LayoutEditor({ site, initial }: { site: string; initial: Snapshot }) {
  const [baseline, setBaseline] = useState(initial);
  const [draft, dispatch] = useReducer(draftReducer, initial.document, startDraft);
  const [pendingHead, setPendingHead] = useState<Snapshot | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [cameraMode, setCameraMode] = useState<SavedCamera["mode"]>("perspective");
  const [gizmo, setGizmo] = useState<"translate" | "rotate">("translate");
  const [moveSnap, setMoveSnap] = useState(0.1);
  const [angleSnap, setAngleSnap] = useState(15);
  const [section, setSection] = useState(false);
  const [sectionHeight, setSectionHeight] = useState(1.5);
  const [transparent, setTransparent] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [axis, setAxis] = useState<keyof Vector>("x");
  const [showHidden, setShowHidden] = useState(false);
  const [layer, setLayer] = useState("");
  const [isolate, setIsolate] = useState(false);
  const [overlay, setOverlay] = useState<"all" | "none" | Connection["kind"]>("all");
  const [selection, setSelection] = useState<string[]>([]);
  const [scopeId, setScopeId] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [templateId, setTemplateId] = useState("machine@1");
  const [readonlyView, setReadonlyView] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [tableFilter, setTableFilter] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const viewport = useRef<ViewportHandle>(null);
  const document = readonlyView ? baseline.document : draft.current;
  const dirty = draft.current !== baseline.document && !sameValue(draft.current, baseline.document);
  const spaces = useMemo(
    () => new Map(document.spaces.map((node) => [node.id, node])),
    [document.spaces],
  );
  const choices = useMemo(
    () => new Map(document.catalog.map((entry) => [templateKey(entry), entry])),
    [document.catalog],
  );
  const selectedTemplate = choices.get(templateId);
  const firstFloor = document.spaces.find((node) => node.kind === "floor");
  const siteNode = document.spaces.find((node) => node.kind === "site");
  const scope = spaces.get(scopeId) ?? firstFloor ?? siteNode;
  const selectedFloor = scope && floorOf(spaces, scope.id);
  const floor = selectedFloor?.floor;
  const [revisionTools, setRevisionTools] = useState(false);
  const [viewTools, setViewTools] = useState(false);
  const [compactPanel, setCompactPanel] = useState<"library" | "scene" | "properties">(
    floor ? "scene" : "library",
  );
  const stations = document.spaces.filter(
    (node) =>
      node.kind === "station" && selectedFloor && isWithin(spaces, node.id, selectedFloor.id),
  );
  const targetStation =
    (scope?.kind === "station"
      ? scope
      : stations.find((node) => scope && isWithin(spaces, node.id, scope.id))) ?? stations[0];

  const floorRecords = useMemo(
    () =>
      document.occurrences.flatMap((record): VisualRecord[] => {
        const template = choices.get(
          templateKey({ id: record.templateId, revision: record.templateRevision }),
        );
        return template && selectedFloor && isWithin(spaces, record.stationId, selectedFloor.id)
          ? [{ record, template }]
          : [];
      }),
    [document.occurrences, choices, selectedFloor, spaces],
  );
  const scopedRecords = useMemo(
    () =>
      floorRecords.filter(({ record }) => scope && isWithin(spaces, record.stationId, scope.id)),
    [floorRecords, scope, spaces],
  );
  const visibleRecords = useMemo(
    () =>
      scopedRecords.filter(
        ({ record }) =>
          (showHidden || !record.hidden) &&
          (!layer || record.layer === layer) &&
          (!isolate || selection.includes(record.id)),
      ),
    [scopedRecords, showHidden, layer, isolate, selection],
  );
  const presentIds = useMemo(
    () => new Set(floorRecords.map(({ record }) => record.id)),
    [floorRecords],
  );
  const floorLinks = useMemo(
    () =>
      document.connections.filter(
        (link) => presentIds.has(link.from.occurrenceId) && presentIds.has(link.to.occurrenceId),
      ),
    [document.connections, presentIds],
  );
  const visibleLinks = useMemo(
    () => floorLinks.filter((link) => overlay === "all" || overlay === link.kind),
    [floorLinks, overlay],
  );
  const activeSelection = floorRecords.filter(({ record }) => selection.includes(record.id));
  const selectedRecord = activeSelection.at(-1);
  const distinctLayers = [...new Set(scopedRecords.map(({ record }) => record.layer))].sort();
  const catalog = document.catalog.filter(
    (entry) =>
      !catalogQuery ||
      [entry.label, entry.kind, ...entry.capabilities].some((term) =>
        term.toLowerCase().includes(catalogQuery.toLowerCase()),
      ),
  );
  const issues = useMemo(
    () => [...validateSpatialRelationships(document), ...validateSpatialGeometry(document)],
    [document],
  );
  const diffTarget = pendingHead?.document ?? baseline.document;
  const unsavedDocument = draft.current;
  const changes = useMemo(
    () => comparePlacements(unsavedDocument, diffTarget),
    [unsavedDocument, diffTarget],
  );
  const issueTotal = issues.length;
  const [issuePage, setIssuePage] = useState(1);
  const issueVisiblePage = Math.max(1, Math.min(issuePage, Math.ceil(issueTotal / 20)));

  const edited = useCallback((apply: DraftEdit) => dispatch({ type: "edit", apply }), []);
  const updateRecord = (record: Occurrence) =>
    edited((previous) => ({
      ...previous,
      occurrences: previous.occurrences.map((item) => (item.id === record.id ? record : item)),
    }));
  const select = useCallback((id: string, multi: boolean) => {
    setSelection((previous) =>
      multi
        ? previous.includes(id)
          ? previous.filter((item) => item !== id)
          : [...previous, id]
        : [id],
    );
  }, []);
  const jumpTo = (id: string) => {
    const item = document.occurrences.find((record) => record.id === id);
    if (!item) return;
    const nextFloor = floorOf(spaces, item.stationId);
    if (nextFloor) setScopeId(nextFloor.id);
    setLayer("");
    setIsolate(false);
    if (item.hidden) setShowHidden(true);
    select(id, false);
  };

  const exit = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      dirty && (current.pathname !== next.pathname || !sameValue(current.search, next.search)),
    enableBeforeUnload: dirty,
    withResolver: true,
  });

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        !dirty ||
        readonlyView ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        (target instanceof HTMLElement &&
          target.closest("input, textarea, [contenteditable='true']"))
      )
        return;
      event.preventDefault();
      dispatch({ type: event.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [dirty, readonlyView]);

  const transform = useCallback(
    (
      id: string,
      change: Pick<Occurrence, "position" | "rotation">,
      mode: "translate" | "rotate",
    ) => {
      if (readonlyView) return;
      edited((previous) => {
        const anchor = previous.occurrences.find((record) => record.id === id);
        if (!anchor || anchor.locked) return previous;
        return {
          ...previous,
          occurrences:
            mode === "translate"
              ? moveSelection(previous.occurrences, selection, anchor, change.position)
              : previous.occurrences.map((record) =>
                  record.id === id ? { ...record, rotation: change.rotation } : record,
                ),
        };
      });
    },
    [edited, readonlyView, selection],
  );

  const place = useCallback(
    (key: string, at?: Vector) => {
      const item = choices.get(key);
      if (readonlyView || !item || !targetStation || !floor) return;
      const point = at ?? { x: floor.size.x / 2, y: 0, z: floor.size.z / 2 };
      if (point.x < 0 || point.z < 0 || point.x > floor.size.x || point.z > floor.size.z) {
        setFeedback({ message: "Drop the component within this floor.", error: true });
        return;
      }
      const placed = createOccurrence(item, targetStation.id, snapVector(point, moveSnap));
      edited((previous) => ({ ...previous, occurrences: [...previous.occurrences, placed] }));
      select(placed.id, false);
    },
    [choices, readonlyView, targetStation, floor, moveSnap, edited, select],
  );

  function addSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scope || !childKind[scope.kind]) return;
    const form = event.currentTarget;
    const label = String(new FormData(form).get("space")).trim();
    if (!label) return;
    const next = createSpace(scope, label);
    edited((previous) => ({ ...previous, spaces: [...previous.spaces, next] }));
    setScopeId(next.id);
    setSelection([]);
    form.reset();
  }

  function selectSpace(id: string) {
    setScopeId(id);
    setSelection([]);
    setLayer("");
    setIsolate(false);
    setTablePage(1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || readonlyView || !dirty) return;
    setBusy(true);
    setFeedback(undefined);
    const candidate = draft.current;
    try {
      const checked = spatialDocumentSchema.parse(candidate);
      const blockers = validateSpatialRelationships(checked);
      if (blockers.length) throw new Error(blockers[0]?.message);
      const response = await saveFactoryWorkspace({
        data: { ...keyFor(site), expected: baseline.revision, payload: checked, reason },
      });
      if (response.revision !== baseline.revision + 1)
        throw new Error(
          "The save result was ambiguous. Load the current server revision before retrying.",
        );
      setBaseline({ revision: response.revision, document: candidate });
      setPendingHead(null);
      setReason("");
      setFeedback({ message: `Revision ${response.revision} saved.`, error: false });
    } catch (cause) {
      setFeedback({ message: message(cause, "The workspace could not be saved."), error: true });
      // Determine whether this is a conflict by reading the authorized head, independent of error transport.
      try {
        const head = decodeSnapshot(site, await loadFactoryWorkspace({ data: keyFor(site) }));
        if (head.revision > baseline.revision) setPendingHead(head);
      } catch {
        /* The original error and local draft remain visible. */
      }
    } finally {
      setBusy(false);
    }
  }

  async function recover(file: File) {
    try {
      if (file.size > embeddedEncodedLimit + 5_000_000)
        throw new Error("The draft file is too large.");
      const parsed: unknown = JSON.parse(await file.text());
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("document" in parsed) ||
        !("baseRevision" in parsed)
      ) {
        throw new Error("Choose a previously exported layout draft.");
      }
      const restored = spatialDocumentSchema.parse(parsed.document);
      if (restored.siteCode !== site || parsed.baseRevision !== baseline.revision) {
        throw new Error("The downloaded draft belongs to another site or base revision.");
      }
      const blockers = validateSpatialRelationships(restored);
      if (blockers.length) throw new Error(blockers[0]?.message);
      await verifySpatialArtifactContent(restored);
      edited(() => restored);
      setReadonlyView(false);
      setFeedback({ message: "Draft restored. Review the changes before saving.", error: false });
    } catch (cause) {
      setFeedback({ message: message(cause, "Draft could not be restored."), error: true });
    }
  }

  function merge() {
    if (!pendingHead) return;
    const { merged, conflicts } = mergeSpatialDocuments(
      baseline.document,
      draft.current,
      pendingHead.document,
    );
    const blockers = validateSpatialRelationships(merged);
    if (conflicts.length || blockers.length) {
      setFeedback({
        message: conflicts.length
          ? `Conflicting changes in ${conflicts.slice(0, 4).join(", ")}. Export your draft before loading the latest revision.`
          : (blockers[0]?.message ?? "Resolve the merged layout references."),
        error: true,
      });
      return;
    }
    setBaseline(pendingHead);
    setPendingHead(null);
    dispatch({ type: "reset", document: merged });
    setFeedback({
      message: "Nonoverlapping changes merged. Review and save the new draft.",
      error: false,
    });
  }

  function dropLocalChanges() {
    if (!pendingHead) return;
    download(draft.current, baseline.revision);
    dispatch({ type: "reset", document: pendingHead.document });
    setBaseline(pendingHead);
    setPendingHead(null);
    setFeedback({
      message: "The prior draft was downloaded. The latest server revision is open.",
      error: false,
    });
  }

  function saveCamera(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const label = String(new FormData(form).get("name")).trim();
    const camera = viewport.current?.capture();
    if (!camera || !selectedFloor || !label) return;
    const next: SavedCamera = {
      ...camera,
      id: crypto.randomUUID(),
      floorId: selectedFloor.id,
      label,
    };
    edited((previous) => ({ ...previous, cameras: [...previous.cameras, next] }));
    form.reset();
  }

  const group = (clear = false) => {
    const id = clear ? null : crypto.randomUUID();
    edited((previous) => ({
      ...previous,
      occurrences: changeSelection(previous.occurrences, selection, (records) =>
        records.map((item) => ({ ...item, group: id })),
      ),
    }));
  };
  const duplicate = () => {
    const records = duplicateOccurrences(
      activeSelection.map(({ record }) => record),
      { x: 0.5, y: 0, z: 0.5 },
    );
    edited((previous) => ({ ...previous, occurrences: [...previous.occurrences, ...records] }));
    setSelection(records.map((record) => record.id));
  };
  const remove = (id: string) => {
    edited((previous) => ({
      ...previous,
      occurrences: previous.occurrences.filter((record) => record.id !== id),
      connections: previous.connections.filter(
        (item) => item.from.occurrenceId !== id && item.to.occurrenceId !== id,
      ),
    }));
    setSelection((previous) => previous.filter((item) => item !== id));
  };

  const childrenOf = new Map<string | null, SpaceNode[]>();
  for (const node of document.spaces) {
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }
  const tree = (parent: string | null, depth: number) =>
    depth > 7 ? null : (
      <ul className={depth ? "ml-1 border-l border-border pl-1" : "space-y-1"}>
        {(childrenOf.get(parent) ?? []).map((node) => (
          <li key={node.id} className="min-w-0">
            <button
              type="button"
              title={node.label}
              aria-pressed={node.id === scope?.id}
              className={`flex min-h-8 w-full min-w-0 items-center gap-1 rounded px-1 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${node.id === scope?.id ? "bg-accent font-semibold text-foreground" : "text-muted-foreground"}`}
              onClick={() => selectSpace(node.id)}
            >
              <ChevronRight aria-hidden="true" size={12} className="shrink-0" />
              <span className="truncate">{node.label}</span>
              <span className="ml-auto shrink-0 text-[10px] capitalize opacity-75">
                {node.kind}
              </span>
            </button>
            {childrenOf.has(node.id) && tree(node.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  const filtered = scopedRecords.filter(({ record, template }) =>
    `${record.label} ${template.kind} ${record.layer}`
      .toLowerCase()
      .includes(tableFilter.toLowerCase()),
  );
  const rowsPerPage = 25;
  const pages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const page = Math.min(pages, tablePage);
  const floorCameras = document.cameras.filter((camera) => camera.floorId === selectedFloor?.id);

  return (
    <div className="space-y-4">
      {exit.status === "blocked" && (
        <div className="rounded-lg border border-amber-500/60 bg-card p-3">
          <p role="status" className="text-sm font-medium">
            This workspace has unsaved changes.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={button} onClick={exit.reset}>
              Keep editing
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                download(draft.current, baseline.revision);
                exit.proceed();
              }}
            >
              Download draft and leave
            </button>
          </div>
        </div>
      )}
      <div className={panel + " flex flex-wrap items-start justify-between gap-3"}>
        <div>
          <div className="text-sm font-medium">
            {readonlyView ? "Saved design" : "Authoring draft"} · revision {baseline.revision}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {dirty
              ? "Unsaved changes"
              : baseline.revision
                ? "All changes saved"
                : "No saved revision yet"}{" "}
            · {document.occurrences.length} placements · {issueTotal} findings
          </div>
        </div>
        <button
          type="button"
          className={button + " sm:hidden"}
          aria-expanded={revisionTools}
          aria-controls="layout-revision-tools"
          onClick={() => setRevisionTools((value) => !value)}
        >
          Save &amp; revisions
        </button>
        <div
          id="layout-revision-tools"
          className={revisionTools ? "contents" : "hidden sm:contents"}
        >
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              type="button"
              aria-pressed={readonlyView}
              onClick={() => setReadonlyView((value) => !value)}
            >
              {readonlyView ? "Edit draft" : "View saved design"}
            </button>
            <button
              className={button}
              type="button"
              disabled={readonlyView || !draft.before.length}
              onClick={() => dispatch({ type: "undo" })}
            >
              <Undo2 size={15} /> Undo
            </button>
            <button
              className={button}
              type="button"
              disabled={readonlyView || !draft.after.length}
              onClick={() => dispatch({ type: "redo" })}
            >
              <Redo2 size={15} /> Redo
            </button>
            <button
              className={button}
              type="button"
              onClick={() => download(document, baseline.revision)}
            >
              Download JSON
            </button>
            <label
              className={
                button + " cursor-pointer focus-within:outline-2 focus-within:outline-ring"
              }
            >
              Recover draft
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void recover(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <form
            onSubmit={(event) => {
              void save(event);
            }}
            className="flex w-full flex-wrap items-end gap-2"
          >
            <Field name="Revision reason">
              <input
                className={control + " w-60 max-w-full"}
                disabled={readonlyView || busy}
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <button
              type="submit"
              className={primary}
              disabled={readonlyView || !dirty || !!pendingHead || busy}
            >
              {busy ? "Saving…" : "Save workspace"}
            </button>
          </form>
        </div>
        {feedback && (
          <p
            role={feedback.error ? "alert" : "status"}
            className={
              feedback.error
                ? "w-full text-sm text-destructive"
                : "w-full text-sm text-muted-foreground"
            }
          >
            {feedback.message}
          </p>
        )}
        {pendingHead && (
          <div className="w-full rounded border border-amber-500/60 p-2">
            <p className="text-sm">
              Server revision {pendingHead.revision} is newer than this draft.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={button} onClick={merge}>
                Merge nonoverlapping edits
              </button>
              <button type="button" className={button} onClick={dropLocalChanges}>
                Download draft and load latest
              </button>
            </div>
          </div>
        )}
      </div>

      <nav
        aria-label="Layout workspace panels"
        className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1 xl:hidden"
      >
        {(["library", "scene", "properties"] as const).map((id) => (
          <button
            type="button"
            key={id}
            aria-controls={`layout-${id}`}
            aria-pressed={compactPanel === id}
            onClick={() => setCompactPanel(id)}
            className={`min-h-10 rounded-md px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${compactPanel === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {{ library: "Hierarchy", scene: "Views", properties: "Properties" }[id]}
          </button>
        ))}
      </nav>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[13.5rem_minmax(0,1fr)_17rem]">
        <aside
          id="layout-library"
          aria-label="Spatial hierarchy and library"
          className={`min-w-0 space-y-3 ${compactPanel === "library" ? "" : "hidden xl:block"}`}
        >
          <div className={panel}>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Layers3 aria-hidden="true" size={16} /> Factory hierarchy
            </h2>
            <div className="max-h-72 overflow-auto">{tree(null, 0)}</div>
            {!readonlyView && scope && childKind[scope.kind] && (
              <form onSubmit={addSpace} className="mt-3 space-y-2">
                <Field name={`New ${childKind[scope.kind]} name`}>
                  <input className={control + " w-full"} name="space" maxLength={180} required />
                </Field>
                <button type="submit" className={button}>
                  Add {childKind[scope.kind]}
                </button>
              </form>
            )}
          </div>
          {!readonlyView && (
            <>
              <div className={panel}>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Box aria-hidden="true" size={16} /> Component library
                </h2>
                <Field name="Find a component">
                  <input
                    className={control + " w-full"}
                    type="search"
                    value={catalogQuery}
                    onChange={(event) => setCatalogQuery(event.target.value)}
                  />
                </Field>
                <div
                  aria-label="Component templates"
                  className="my-2 max-h-52 space-y-1 overflow-auto"
                >
                  {catalog.map((entry) => {
                    const key = templateKey(entry);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={key === templateId}
                        draggable
                        className={`block min-h-8 w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${key === templateId ? "bg-accent font-semibold" : ""}`}
                        onClick={() => setTemplateId(key)}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/x-ems-template", key);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        {entry.label} · r{entry.revision}
                      </button>
                    );
                  })}
                  {!catalog.length && (
                    <p className="text-xs text-muted-foreground">No matching templates.</p>
                  )}
                </div>
                <button
                  type="button"
                  className={button}
                  disabled={!targetStation || !selectedTemplate}
                  onClick={() => place(templateId)}
                >
                  Place on floor
                </button>
                {targetStation && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Destination · {targetStation.label}
                  </p>
                )}
              </div>
              <TemplateEditor selected={selectedTemplate} document={document} apply={edited} />
            </>
          )}
        </aside>

        <section
          id="layout-scene"
          aria-label="Factory scene"
          className={`min-w-0 space-y-3 ${compactPanel === "scene" ? "" : "hidden xl:block"}`}
        >
          {floor && selectedFloor ? (
            <>
              <div className={panel + " space-y-2"}>
                <div className="flex flex-wrap items-center gap-2">
                  <button className={button} type="button" onClick={() => viewport.current?.fit()}>
                    <Crosshair size={15} /> Fit view
                  </button>
                  <select
                    className={control}
                    aria-label="Camera projection"
                    value={cameraMode}
                    onChange={(event) => setCameraMode(event.target.value as SavedCamera["mode"])}
                  >
                    <option value="perspective">Perspective</option>
                    <option value="orthographic">Orthographic</option>
                  </select>
                  <button
                    type="button"
                    className={button + " sm:hidden"}
                    aria-expanded={viewTools}
                    aria-controls="layout-view-tools"
                    onClick={() => setViewTools((value) => !value)}
                  >
                    View tools
                  </button>
                </div>
                <div
                  id="layout-view-tools"
                  className={viewTools ? "space-y-2" : "hidden space-y-2 sm:block"}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={control}
                      aria-label="Connection overlay"
                      value={overlay}
                      onChange={(event) => setOverlay(event.target.value as typeof overlay)}
                    >
                      <option value="all">All connections</option>
                      <option value="none">Hide connections</option>
                      {connectionKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                    <select
                      className={control}
                      aria-label="Layer filter"
                      value={layer}
                      onChange={(event) => setLayer(event.target.value)}
                    >
                      <option value="">All layers</option>
                      {distinctLayers.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!readonlyView && (
                      <>
                        <select
                          className={control}
                          aria-label="Transform tool"
                          value={gizmo}
                          onChange={(event) => setGizmo(event.target.value as typeof gizmo)}
                        >
                          <option value="translate">Move</option>
                          <option value="rotate">Rotate</option>
                        </select>
                        <select
                          className={control}
                          aria-label="Grid snap distance"
                          value={moveSnap}
                          onChange={(event) => setMoveSnap(Number(event.target.value))}
                        >
                          <option value={0}>Grid snap off</option>
                          <option value={0.05}>Grid · 0.05 m</option>
                          <option value={0.1}>Grid · 0.10 m</option>
                          <option value={0.5}>Grid · 0.50 m</option>
                          <option value={1}>Grid · 1 m</option>
                        </select>
                        <select
                          className={control}
                          aria-label="Angle snap"
                          value={angleSnap}
                          onChange={(event) => setAngleSnap(Number(event.target.value))}
                        >
                          <option value={0}>Angle snap off</option>
                          <option value={5}>Angle · 5°</option>
                          <option value={15}>Angle · 15°</option>
                          <option value={45}>Angle · 45°</option>
                        </select>
                      </>
                    )}
                    <button
                      className={button}
                      type="button"
                      aria-pressed={showHidden}
                      onClick={() => setShowHidden((value) => !value)}
                    >
                      Show hidden
                    </button>
                    <button
                      className={button}
                      type="button"
                      aria-pressed={isolate}
                      disabled={!activeSelection.length && !isolate}
                      onClick={() => setIsolate((value) => !value)}
                    >
                      Isolate
                    </button>
                    <button
                      className={button}
                      type="button"
                      aria-pressed={transparent}
                      onClick={() => setTransparent((value) => !value)}
                    >
                      Transparency
                    </button>
                    <button
                      className={button}
                      type="button"
                      aria-pressed={section}
                      onClick={() => setSection((value) => !value)}
                    >
                      Section
                    </button>
                    {section && (
                      <label className="flex items-center gap-2 text-xs">
                        Height{" "}
                        <input
                          className={control + " w-20"}
                          aria-label="Section height in metres"
                          type="number"
                          min="0"
                          max={floor.size.y}
                          step="0.05"
                          value={sectionHeight}
                          onChange={(event) => setSectionHeight(Number(event.target.value))}
                        />{" "}
                        m
                      </label>
                    )}
                    {selectedRecord?.template.subcomponents.length ? (
                      <button
                        className={button}
                        type="button"
                        aria-pressed={exploded}
                        onClick={() => setExploded((value) => !value)}
                      >
                        Explode assembly
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <Suspense
                fallback={
                  <div
                    className="grid min-h-[360px] place-items-center rounded-lg bg-[#151d28] text-sm text-slate-100"
                    role="status"
                  >
                    Loading 3D tools…
                  </div>
                }
              >
                <Scene
                  key={selectedFloor.id}
                  viewport={viewport}
                  floor={floor}
                  visible={visibleRecords}
                  connections={visibleLinks}
                  artifacts={document.artifacts}
                  selection={selection}
                  mode={cameraMode}
                  gizmo={gizmo}
                  moveSnap={moveSnap}
                  angleSnap={angleSnap}
                  transparent={transparent}
                  section={section ? sectionHeight : null}
                  exploded={exploded}
                  editable={!readonlyView}
                  onSelect={select}
                  onTransform={transform}
                  onDropTemplate={place}
                />
              </Suspense>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>
                  Drag to orbit · right-drag to pan · scroll to zoom · Shift+select for multiple
                  placements
                </span>
                {visibleLinks.length > 0 &&
                  connectionKinds
                    .filter((kind) => visibleLinks.some((item) => item.kind === kind))
                    .map((kind) => (
                      <span key={kind}>
                        <span style={{ color: connectionColors[kind] }}>━</span> {kind}
                      </span>
                    ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <SpatialProjection
                  mode="plan"
                  floor={floor}
                  records={visibleRecords}
                  connections={visibleLinks}
                  selected={selection}
                  onSelect={select}
                />
                <SpatialProjection
                  mode="elevation"
                  floor={floor}
                  records={visibleRecords}
                  connections={visibleLinks}
                  selected={selection}
                  onSelect={select}
                />
              </div>
            </>
          ) : (
            <div className="grid min-h-[360px] place-items-center rounded-lg border border-border bg-card p-8 text-center">
              <div>
                <p className="font-semibold">Select a floor to open 3D</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add a building and floor in the hierarchy to start a layout.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside
          id="layout-properties"
          aria-label="Placement properties"
          className={`min-w-0 space-y-3 ${compactPanel === "properties" ? "" : "hidden xl:block"}`}
        >
          <div className={panel}>
            <h2 className="text-sm font-semibold">Placements · {scopedRecords.length}</h2>
            <div className="mt-2 max-h-48 space-y-1 overflow-auto">
              {scopedRecords.slice(0, 40).map(({ record }) => (
                <button
                  className={`flex min-h-8 w-full items-center gap-1 rounded px-1 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${selection.includes(record.id) ? "bg-accent font-semibold" : ""}`}
                  type="button"
                  key={record.id}
                  aria-pressed={selection.includes(record.id)}
                  onClick={(event) =>
                    select(record.id, event.shiftKey || event.ctrlKey || event.metaKey)
                  }
                >
                  <span className="truncate">{record.label}</span>
                  {record.hidden && <span className="ml-auto text-muted-foreground">Hidden</span>}
                  {record.locked && <span className="ml-auto text-muted-foreground">Locked</span>}
                </button>
              ))}
              {!scopedRecords.length && (
                <p className="text-xs text-muted-foreground">No equipment in this scope.</p>
              )}
            </div>
            {scopedRecords.length > 0 && (
              <button
                className={button + " mt-2"}
                type="button"
                aria-expanded={showTable}
                onClick={() => setShowTable((value) => !value)}
              >
                {showTable ? "Hide placements table" : "Open placements table"}
              </button>
            )}
          </div>
          {selectedRecord &&
            floor &&
            (!readonlyView ? (
              <OccurrenceInspector
                key={JSON.stringify(selectedRecord.record)}
                item={selectedRecord}
                stationPath={treePath(spaces, selectedRecord.record.stationId)}
                site={site}
                origin={floor.origin}
                onApply={updateRecord}
                onRemove={() => remove(selectedRecord.record.id)}
                onState={(change) => updateRecord({ ...selectedRecord.record, ...change })}
              />
            ) : (
              <div className={panel}>
                <h2 className="font-semibold">{selectedRecord.record.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {treePath(spaces, selectedRecord.record.stationId)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Position{" "}
                  {[
                    selectedRecord.record.position.x,
                    selectedRecord.record.position.y,
                    selectedRecord.record.position.z,
                  ]
                    .map((value) => value.toFixed(3))
                    .join(", ")}{" "}
                  m
                </p>
                {(selectedRecord.template.kind === "terminal" ||
                  selectedRecord.template.kind === "hmi") && (
                  <TerminalContext
                    site={site}
                    terminalId={selectedRecord.record.terminalId}
                    appId={selectedRecord.record.authoringAppId}
                    kind={selectedRecord.template.kind === "hmi" ? "hmi" : "operator"}
                  />
                )}
              </div>
            ))}
          {!readonlyView && activeSelection.length > 0 && (
            <div className={panel}>
              <h2 className="text-sm font-semibold">Selection · {activeSelection.length}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button className={button} type="button" onClick={duplicate}>
                  Duplicate
                </button>
                <button
                  className={button}
                  type="button"
                  disabled={activeSelection.length < 2}
                  onClick={() => group()}
                >
                  Group
                </button>
                <button
                  className={button}
                  type="button"
                  disabled={!activeSelection.some(({ record }) => record.group)}
                  onClick={() => group(true)}
                >
                  Ungroup
                </button>
                <select
                  className={control}
                  aria-label="Alignment axis"
                  value={axis}
                  onChange={(event) => setAxis(event.target.value as keyof Vector)}
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
                {(["align", "distribute"] as const).map((action) => (
                  <button
                    type="button"
                    className={button}
                    key={action}
                    disabled={activeSelection.length < (action === "align" ? 2 : 3)}
                    onClick={() =>
                      edited((previous) => ({
                        ...previous,
                        occurrences: positionSelection(
                          previous.occurrences,
                          selection,
                          axis,
                          action,
                        ),
                      }))
                    }
                  >
                    {action === "align" ? "Align" : "Distribute"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedRecord?.template.subcomponents.length ? (
            <details className={panel}>
              <summary className="cursor-pointer text-sm font-semibold">
                Assembly components
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {selectedRecord.template.subcomponents.map((item) => (
                  <li key={item.id}>
                    {item.label} · {item.size.x} × {item.size.y} × {item.size.z} m
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {floor && selectedFloor && !readonlyView && (
            <FloorControls
              key={JSON.stringify([
                selectedFloor.id,
                floor.size,
                floor.origin,
                floor.reference?.sha256,
              ])}
              floor={floor}
              onChange={(next) =>
                edited((previous) => ({
                  ...previous,
                  spaces: previous.spaces.map((node) =>
                    node.id === selectedFloor.id ? { ...node, floor: next } : node,
                  ),
                }))
              }
            />
          )}
          {floor && (
            <details className={panel}>
              <summary className="cursor-pointer text-sm font-semibold">Saved camera views</summary>
              {floorCameras.map((camera) => (
                <button
                  className={button + " mt-2 mr-1"}
                  type="button"
                  key={camera.id}
                  onClick={() => {
                    setCameraMode(camera.mode);
                    viewport.current?.restore(camera);
                  }}
                >
                  {camera.label}
                </button>
              ))}
              {!readonlyView && (
                <form onSubmit={saveCamera} className="mt-2 space-y-2">
                  <Field name="View name">
                    <input name="name" className={control} maxLength={180} required />
                  </Field>
                  <button className={button} type="submit">
                    Save current view
                  </button>
                </form>
              )}
            </details>
          )}
        </aside>
      </div>

      {showTable && (
        <div className={panel}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold">Placements table</h2>
            <Field name="Search placements">
              <input
                type="search"
                className={control}
                value={tableFilter}
                onChange={(event) => {
                  setTableFilter(event.target.value);
                  setTablePage(1);
                }}
              />
            </Field>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2">Occurrence</th>
                  <th className="p-2">Template</th>
                  <th className="p-2">Floor X/Y/Z (m)</th>
                  <th className="p-2">Process steps</th>
                  <th className="p-2">Terminal</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice((page - 1) * rowsPerPage, page * rowsPerPage)
                  .map(({ record, template }) => (
                    <tr
                      key={record.id}
                      className={
                        selection.includes(record.id) ? "bg-accent" : "border-b border-border"
                      }
                    >
                      <td className="p-2">
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          aria-pressed={selection.includes(record.id)}
                          onClick={() => jumpTo(record.id)}
                        >
                          {record.label}
                        </button>
                      </td>
                      <td className="p-2">
                        {template.label} · {template.revision}
                      </td>
                      <td className="whitespace-nowrap p-2 font-mono text-xs">
                        {[record.position.x, record.position.y, record.position.z]
                          .map((value) => value.toFixed(3))
                          .join(" / ")}
                      </td>
                      <td className="p-2">{record.processStepIds.join(", ") || "—"}</td>
                      <td className="p-2">{record.terminalId || "—"}</td>
                    </tr>
                  ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={5} className="p-2 text-muted-foreground">
                      No placements match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className={button}
              disabled={page <= 1}
              onClick={() => setTablePage(page - 1)}
            >
              Previous page
            </button>
            <span>
              Page {page} of {pages} · {filtered.length} placements
            </span>
            <button
              type="button"
              className={button}
              disabled={page >= pages}
              onClick={() => setTablePage(page + 1)}
            >
              Next page
            </button>
          </div>
        </div>
      )}

      {!readonlyView && floor && (
        <ConnectionEditor
          document={document}
          records={floorRecords}
          links={floorLinks}
          apply={edited}
          select={jumpTo}
        />
      )}
      <details className={panel}>
        <summary className="cursor-pointer text-sm font-semibold">
          Geometry and reference checks · {issueTotal}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Envelope checks use axis-aligned bounds in the floor frame. Verify clearances against
          approved site engineering rules.
        </p>
        {issues.slice((issueVisiblePage - 1) * 20, issueVisiblePage * 20).map((issue, index) => (
          <div key={`${issue.rule}-${index}`} className="mt-2 rounded border border-border p-2">
            <p className="text-sm font-medium">
              <span className="capitalize">{issue.severity}</span> · {issue.message}
            </p>
            <p className="text-xs text-muted-foreground">
              {issue.rule}
              {issue.toleranceM === null ? "" : ` · tolerance ${issue.toleranceM} m`} ·{" "}
              {issue.guidance}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {[...new Set(issue.ids)].flatMap((id) => {
                const record = document.occurrences.find((item) => item.id === id);
                return record
                  ? [
                      <button type="button" key={id} className={button} onClick={() => jumpTo(id)}>
                        {record.label}
                      </button>,
                    ]
                  : [];
              })}
            </div>
          </div>
        ))}
        {issueTotal > 20 && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <button
              type="button"
              className={button}
              disabled={issueVisiblePage <= 1}
              onClick={() => setIssuePage(issueVisiblePage - 1)}
            >
              Previous findings
            </button>
            <span>Page {issueVisiblePage}</span>
            <button
              type="button"
              className={button}
              disabled={issueVisiblePage * 20 >= issueTotal}
              onClick={() => setIssuePage(issueVisiblePage + 1)}
            >
              Next findings
            </button>
          </div>
        )}
        {!issueTotal && (
          <p className="mt-2 text-sm text-muted-foreground">No findings in this design.</p>
        )}
      </details>
      <details className={panel}>
        <summary className="cursor-pointer text-sm font-semibold">
          Placement comparison · {changes.length}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Compared with saved revision {pendingHead?.revision ?? baseline.revision}.
        </p>
        <ul className="mt-2 max-h-72 space-y-1 overflow-auto text-sm">
          {changes.map((entry) => (
            <li key={entry.id}>
              {entry.kinds.includes("removed") ? (
                entry.label
              ) : (
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => jumpTo(entry.id)}
                >
                  {entry.label}
                </button>
              )}{" "}
              · {entry.kinds.join(", ")}
            </li>
          ))}
          {!changes.length && <li className="text-muted-foreground">No placement changes.</li>}
        </ul>
      </details>
    </div>
  );
}
