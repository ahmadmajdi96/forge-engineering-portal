import { FloorStrip } from "./floor-strip";
import { LayoutSetupEntry } from "./layout-setup-entry";
import { useGuidedSetup } from "@/components/engineering/setup-wizard-context";
import { buildingLevels } from "@/lib/spatial/floor-display";
import { SpaceControls } from "./space-controls";
import { useProcessApplications } from "@/lib/engineering/process-catalog";
import { processTrace } from "@/lib/spatial/process-trace";
import { useProcessRevision } from "@/lib/production/use-process-revision";
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
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link, useBlocker } from "@tanstack/react-router";
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
import { useEngineering } from "@/lib/engineering/context";
import {
  engineeringLinks,
  invalidEngineeringLinks,
  resolveLayoutTarget,
  type LayoutTarget,
} from "@/lib/spatial/engineering-links";
import { EngineeringPlacement } from "./engineering-placement";
import { placeLibraryTemplate, placementLibrary } from "@/lib/spatial/station-library";
import { SpatialProjection } from "./projections";
import { connectionColors } from "./palette";
import type { CameraDirection, ViewportHandle, VisualRecord } from "./scene";

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

function spaceTrail(spaces: ReadonlyMap<string, SpaceNode>, id: string) {
  let node = spaces.get(id);
  const path: SpaceNode[] = [];
  while (node && path.length < 7) {
    path.unshift(node);
    node = node.parentId ? spaces.get(node.parentId) : undefined;
  }
  return path;
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

export function FactoryWorkspace({
  site,
  target = {},
  canEdit,
}: {
  site: string;
  target?: LayoutTarget;
  canEdit: boolean;
}) {
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
  return <LayoutEditor canEdit={canEdit} site={site} initial={snapshot} target={target} />;
}

function LayoutEditor({
  canEdit,
  site,
  initial,
  target,
}: {
  site: string;
  canEdit: boolean;
  initial: Snapshot;
  target: LayoutTarget;
}) {
  const guidedSetup = useGuidedSetup();
  const [guidedExit, setGuidedExit] = useState(false);
  const initialTarget = useMemo(
    () => resolveLayoutTarget(initial.document, target),
    [initial, target],
  );
  const [hierarchyQuery, setHierarchyQuery] = useState("");
  const [inspectorWidth, setInspectorWidth] = useState(272);
  const boundWidth = (value: number) => Math.min(420, Math.max(216, value));
  const [baseline, setBaseline] = useState(initial);
  const [draft, dispatch] = useReducer(draftReducer, initial.document, startDraft);
  const [pendingHead, setPendingHead] = useState<Snapshot | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  }>();
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
  const [showHidden, setShowHidden] = useState(Boolean(initialTarget.occurrence?.hidden));
  const [layer, setLayer] = useState("");
  const [isolate, setIsolate] = useState(false);
  const [overlay, setOverlay] = useState<"all" | "none" | Connection["kind"]>("all");
  const [selection, setSelection] = useState<string[]>(
    initialTarget.occurrence ? [initialTarget.occurrence.id] : [],
  );
  const [scopeId, setScopeId] = useState(initialTarget.scope ?? "");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [libraryTab, setLibraryTab] = useState<"stations" | "equipment">("stations");
  const [templateId, setTemplateId] = useState("manuqube-commissioning-bench@1");
  const [savedView, setReadonlyView] = useState(false);
  const readonlyView = !canEdit || savedView;
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
  const available = useMemo(() => placementLibrary(document.catalog), [document.catalog]);
  const firstFloor = document.spaces.find((node) => node.kind === "floor");
  const siteNode = document.spaces.find((node) => node.kind === "site");
  const scope =
    spaces.get(scopeId) ?? (initialTarget.missing ? undefined : (firstFloor ?? siteNode));
  const selectedFloor =
    scope &&
    (floorOf(spaces, scope.id) ??
      document.spaces.find((node) => node.kind === "floor" && isWithin(spaces, node.id, scope.id)));
  const floor = selectedFloor?.floor;
  const [revisionTools, setRevisionTools] = useState(false);
  const [viewTools, setViewTools] = useState(false);
  const [compactPanel, setCompactPanel] = useState<"library" | "scene" | "properties">(
    floor ? "scene" : "library",
  );
  const [placementStationId, setPlacementStationId] = useState("");
  const stations = document.spaces.filter(
    (node) =>
      node.kind === "station" &&
      selectedFloor &&
      scope &&
      isWithin(spaces, node.id, selectedFloor.id) &&
      isWithin(spaces, node.id, scope.id),
  );
  const [showStack, setShowStack] = useState(false);
  const levels = useMemo(
    () => (selectedFloor ? buildingLevels(document, selectedFloor) : []),
    [document, selectedFloor],
  );
  const selectedLevel = useMemo(
    () => levels.filter((l) => l.node.id === selectedFloor?.id),
    [levels, selectedFloor?.id],
  );
  const floorAreas = selectedLevel[0]?.areas;
  const activeArea = scope && spaceTrail(spaces, scope.id).find((node) => node.kind === "area")?.id;
  const targetStation =
    stations.length === 1 ? stations[0] : stations.find((node) => node.id === placementStationId);

  const floorRecords = useMemo(
    () =>
      document.occurrences.flatMap((record): VisualRecord[] => {
        const template = choices.get(
          templateKey({
            id: record.templateId,
            revision: record.templateRevision,
          }),
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
  const engineering = useEngineering();
  const savedEngineering =
    engineering.authenticated &&
    engineering.site === site &&
    engineering.loadState === "ready" &&
    !engineering.dirty &&
    engineering.revision
      ? engineering.workspaceModel
      : undefined;
  const [traceRouteId, setTraceRoute] = useState(target?.traceRoute ?? "");
  const [traceSection, setTraceSection] = useState("");
  const [traceStep, setTraceStep] = useState(target?.traceStep ?? "");
  const [traceOnly, setTraceOnly] = useState(Boolean(target?.traceStep));
  const mayTrace =
    engineering.site === site && engineering.actions.includes("ems.factory_process.view");
  const maySeeStudio =
    engineering.site === site && engineering.actions.includes("ems.application_studio.view");
  const apps = useProcessApplications(site, maySeeStudio && mayTrace && !!traceRouteId);
  const processes = useProcessRevision(site, mayTrace);
  const traceRoute = mayTrace
    ? processes.data?.document.routes.find((r) => r.id === traceRouteId)
    : undefined;
  const trace = useMemo(
    () =>
      traceRoute
        ? processTrace(traceRoute, traceStep, traceSection, document, savedEngineering)
        : undefined,
    [traceRoute, traceStep, traceSection, document, savedEngineering],
  );
  const isolatedIds = isolate ? selection : undefined;
  const visibleRecords = useMemo(
    () =>
      scopedRecords.filter(
        ({ record }) =>
          (!traceOnly || !trace || trace.stations.has(record.stationId)) &&
          (showHidden || !record.hidden) &&
          (!layer || record.layer === layer) &&
          (!isolatedIds || isolatedIds.includes(record.id)),
      ),
    [scopedRecords, showHidden, layer, isolatedIds, traceOnly, trace],
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
  const selectedRecord = activeSelection.find(({ record }) => record.id === selection.at(-1));
  const distinctLayers = [...new Set(scopedRecords.map(({ record }) => record.layer))].sort();
  const catalog = available
    .filter((entry) => Boolean(entry.stationModel) === (libraryTab === "stations"))
    .filter(
      (entry) =>
        !catalogQuery ||
        [entry.label, entry.kind, ...entry.capabilities].some((term) =>
          term.toLowerCase().includes(catalogQuery.toLowerCase()),
        ),
    );
  const selectedTemplate = catalog.find((entry) => templateKey(entry) === templateId) ?? catalog[0];
  const issues = useMemo(
    () => [
      ...validateSpatialRelationships(document),
      ...validateSpatialGeometry(document),
      ...(savedEngineering
        ? invalidEngineeringLinks(engineeringLinks(document), savedEngineering).map((link) => ({
            rule: "engineering-reference@1",
            severity: "warning" as const,
            ids: [link.layoutId],
            toleranceM: null,
            message: `Engineering ${link.kind} ${link.engineeringId} is unavailable in this parent`,
            guidance: "Review the saved record and its station or line assignment.",
          }))
        : []),
    ],
    [document, savedEngineering],
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
    if (!item) {
      if (spaces.has(id)) {
        selectSpace(id);
        setCompactPanel("library");
      }
      return;
    }
    setScopeId(item.stationId);
    setCompactPanel("properties");
    setLayer("");
    setIsolate(false);
    if (item.hidden) setShowHidden(true);
    select(id, false);
  };

  const exit = useBlocker({
    shouldBlockFn: ({ current, next }) => {
      const leaving =
        dirty && (current.pathname !== next.pathname || !sameValue(current.search, next.search));
      if (leaving) setGuidedExit(guidedSetup || next.search["setup"] === "guided");
      return leaving;
    },
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
      const item = available.find((template) => templateKey(template) === key);
      if (readonlyView || !item || !targetStation || !floor) return;
      const point = at ?? { x: floor.size.x / 2, y: 0, z: floor.size.z / 2 };
      if (point.x < 0 || point.z < 0 || point.x > floor.size.x || point.z > floor.size.z) {
        setFeedback({
          message: "Drop the component within this floor.",
          error: true,
        });
        return;
      }
      try {
        const next = placeLibraryTemplate(
          document,
          item,
          targetStation.id,
          snapVector(point, moveSnap),
        );
        edited(() => next.document);
        select(next.record.id, false);
      } catch (error) {
        setFeedback({
          message: message(error, "Could not place this template."),
          error: true,
        });
      }
    },
    [available, document, readonlyView, targetStation, floor, moveSnap, edited, select],
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
    setPlacementStationId("");
    setScopeId(id);
    setShowStack(spaces.get(id)?.kind === "building");
    setTraceOnly(false);
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
        data: {
          ...keyFor(site),
          expected: baseline.revision,
          payload: checked,
          reason,
        },
      });
      if (response.revision !== baseline.revision + 1)
        throw new Error(
          "The save result was ambiguous. Load the current server revision before retrying.",
        );
      setBaseline({ revision: response.revision, document: candidate });
      setPendingHead(null);
      setReason("");
      setFeedback({
        message: `Revision ${response.revision} saved.`,
        error: false,
      });
    } catch (cause) {
      setFeedback({
        message: message(cause, "The workspace could not be saved."),
        error: true,
      });
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
      setFeedback({
        message: "Draft restored. Review the changes before saving.",
        error: false,
      });
    } catch (cause) {
      setFeedback({
        message: message(cause, "Draft could not be restored."),
        error: true,
      });
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
    edited((previous) => ({
      ...previous,
      cameras: [...previous.cameras, next],
    }));
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
    edited((previous) => ({
      ...previous,
      occurrences: [...previous.occurrences, ...records],
    }));
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
  const matchingNodes = new Set<string>();
  const searchTerm = hierarchyQuery.trim().toLowerCase();
  if (searchTerm) {
    for (const node of document.spaces) {
      if (
        ![node.label, node.id, node.kind, node.engineeringId].some((value) =>
          value?.toLowerCase().includes(searchTerm),
        )
      )
        continue;
      let current: SpaceNode | undefined = node;
      while (current && !matchingNodes.has(current.id)) {
        matchingNodes.add(current.id);
        current = spaces.get(current.parentId ?? "");
      }
    }
  }
  const tree = (parent: string | null, depth: number) =>
    depth > 7 ? null : (
      <ul className={depth ? "ml-1 border-l border-border pl-1" : "space-y-1"}>
        {(childrenOf.get(parent) ?? [])
          .filter((node) => !searchTerm || matchingNodes.has(node.id))
          .map((node) => (
            <li key={node.id} className="min-w-0">
              <button
                type="button"
                title={node.label}
                aria-pressed={node.id === scope?.id}
                className={`flex min-h-8 w-full min-w-0 items-center gap-1 rounded px-1 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${node.id === scope?.id ? "bg-accent font-semibold text-foreground" : "text-muted-foreground"}`}
                onClick={() => selectSpace(node.id)}
              >
                <ChevronRight aria-hidden="true" size={12} className="shrink-0" />
                <span className="min-w-0 break-words">{node.label}</span>
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
  const unresolvedTarget = resolveLayoutTarget(document, target).missing;
  const floorCameras = document.cameras.filter((camera) => camera.floorId === selectedFloor?.id);

  return (
    <div className="ems-layout-editor space-y-2">
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
              disabled={guidedExit}
              onClick={() => {
                if (guidedExit) return;
                download(draft.current, baseline.revision);
                exit.proceed();
              }}
            >
              {guidedExit ? "Save workspace before guided setup" : "Download draft and leave"}
            </button>
          </div>
        </div>
      )}
      <div
        className={
          panel + " ems-layout-status flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
        }
      >
        <div>
          {scope && (
            <nav
              aria-label="Layout location"
              className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"
            >
              {spaceTrail(spaces, scope.id)
                .filter((node) => node.kind !== "organization")
                .map((node, index) => (
                  <span key={node.id} className="inline-flex items-center gap-1">
                    {index > 0 && <ChevronRight size={12} aria-hidden="true" />}
                    <button
                      type="button"
                      className="rounded hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      aria-current={node.id === scope.id ? "location" : undefined}
                      onClick={() => selectSpace(node.id)}
                    >
                      {node.label}
                    </button>
                  </span>
                ))}
            </nav>
          )}
          <div className="text-sm font-medium">
            {canEdit ? (readonlyView ? "Saved design" : "Authoring draft") : "View-only access"} ·
            revision {baseline.revision}
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
        {!canEdit && baseline.revision > 0 && (
          <button
            type="button"
            className={button}
            onClick={() => download(baseline.document, baseline.revision)}
          >
            Download saved layout
          </button>
        )}
        {canEdit && (
          <>
            <button
              type="button"
              className={button + " xl:hidden"}
              aria-expanded={revisionTools}
              aria-controls="layout-revision-tools"
              onClick={() => setRevisionTools((value) => !value)}
            >
              Save &amp; revisions
            </button>
            <div
              id="layout-revision-tools"
              className={revisionTools ? "contents" : "hidden xl:contents"}
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
                className="ems-layout-save flex flex-wrap items-end gap-2"
              >
                <Field name="Revision reason">
                  <input
                    className={control + " w-52 max-w-full"}
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
          </>
        )}
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

      {unresolvedTarget && (
        <p role="status" className={panel + " text-sm"}>
          No layout placement matches <strong>{unresolvedTarget}</strong>. Select an area, line, or
          station in the hierarchy to link a saved engineering record.
        </p>
      )}
      <LayoutSetupEntry
        site={site}
        document={document}
        savedDocument={baseline.document}
        itemId={selection.length ? selection.at(-1) : scopeId || undefined}
        itemType={selection.length ? "occurrence" : "space"}
        dirty={dirty}
        busy={busy}
        showSave={() => {
          setReadonlyView(false);
          setRevisionTools(true);
          requestAnimationFrame(() =>
            window.document.querySelector<HTMLInputElement>(".ems-layout-save input")?.focus(),
          );
        }}
        showInspector={() => setCompactPanel("properties")}
        showHierarchy={() => setCompactPanel("library")}
        showItem={(id) => {
          jumpTo(id);
          setCompactPanel("scene");
          requestAnimationFrame(() => viewport.current?.fit());
        }}
      />
      <nav
        aria-label="Layout workspace panels"
        className="ems-layout-panes grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1 xl:hidden"
      >
        {(["scene", "library", "properties"] as const).map((id) => (
          <button
            type="button"
            key={id}
            aria-controls={`layout-${id}`}
            aria-pressed={compactPanel === id}
            onClick={() => setCompactPanel(id)}
            className={`min-h-10 rounded-md px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${compactPanel === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {
              {
                library: "Floors & hierarchy",
                scene: "Views",
                properties: "Properties",
              }[id]
            }
          </button>
        ))}
      </nav>
      <div
        style={{ "--inspector-width": inspectorWidth + "px" } as CSSProperties}
        className="ems-layout-workbench grid min-w-0 gap-3 xl:grid-cols-[clamp(15rem,17vw,19.5rem)_minmax(0,1fr)_8px_var(--inspector-width)] xl:gap-x-2"
      >
        <aside
          id="layout-library"
          aria-label="Spatial hierarchy and library"
          className={`min-w-0 space-y-3 ${compactPanel === "library" ? "" : "hidden xl:block"}`}
        >
          <details
            className={panel + " ems-layout-setup"}
            id="layout-setup"
            open={typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches}
          >
            <summary className="cursor-pointer text-sm font-semibold">
              Buildings, floors and sections
            </summary>
            <SpaceControls
              spaces={document.spaces}
              scopeId={scope?.id ?? ""}
              readOnly={readonlyView}
              onSelect={selectSpace}
              onCreate={(id, label) => {
                const parent = spaces.get(id);
                if (readonlyView || !parent || !childKind[parent.kind]) return;
                const next = createSpace(parent, label);
                edited((prev) => ({ ...prev, spaces: [...prev.spaces, next] }));
                selectSpace(next.id);
              }}
              onRename={(id, label) => {
                if (!readonlyView)
                  edited((prev) => ({
                    ...prev,
                    spaces: prev.spaces.map((n) => (n.id === id ? { ...n, label } : n)),
                  }));
              }}
            />
            {scope?.kind === "area" && floor && (
              <details className="mt-2 rounded-md border p-3">
                <summary className="cursor-pointer font-medium">
                  Section footprint · {scope.label}
                </summary>
                {readonlyView ? (
                  <p>
                    {scope.boundary
                      ? `${scope.boundary.width} × ${scope.boundary.depth} m at X ${scope.boundary.x}, Z ${scope.boundary.z}`
                      : "No footprint configured."}
                  </p>
                ) : (
                  <form
                    key={JSON.stringify([scope.id, scope.boundary])}
                    className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const boundary = {
                        x: Number(data.get("x")),
                        z: Number(data.get("z")),
                        width: Number(data.get("width")),
                        depth: Number(data.get("depth")),
                      };
                      if (
                        boundary.x + boundary.width > floor.size.x ||
                        boundary.z + boundary.depth > floor.size.z
                      ) {
                        setFeedback({
                          error: true,
                          message:
                            "The section must fit inside the floor. Check its position and dimensions.",
                        });
                        return;
                      }
                      edited((prev) => ({
                        ...prev,
                        spaces: prev.spaces.map((n) =>
                          n.id === scope.id ? { ...n, boundary } : n,
                        ),
                      }));
                      setFeedback({
                        error: false,
                        message: "Section footprint updated in the draft.",
                      });
                    }}
                  >
                    {(["x", "z", "width", "depth"] as const).map((k) => (
                      <label className="grid min-w-0 gap-1 text-sm" key={k}>
                        {
                          {
                            x: "Floor X",
                            z: "Floor Z",
                            width: "Width",
                            depth: "Depth",
                          }[k]
                        }{" "}
                        (m)
                        <input
                          className={control + " w-full"}
                          name={k}
                          type="number"
                          required
                          step="any"
                          min={k === "x" || k === "z" ? 0 : 0.001}
                          max={k === "x" || k === "width" ? floor.size.x : floor.size.z}
                          defaultValue={
                            scope.boundary?.[k] ?? (k === "x" || k === "z" ? 0 : undefined)
                          }
                        />
                      </label>
                    ))}
                    <button type="submit" className={button + " self-end"}>
                      Apply footprint
                    </button>
                  </form>
                )}
              </details>
            )}
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
          </details>
          <div className={panel}>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Layers3 aria-hidden="true" size={16} /> Factory hierarchy
            </h2>
            <input
              aria-label="Search factory hierarchy"
              placeholder="Find a space or ID"
              type="search"
              className={control + " mb-2 w-full"}
              value={hierarchyQuery}
              onChange={(e) => setHierarchyQuery(e.target.value)}
            />
            <div className="max-h-72 overflow-auto">
              {tree(null, 0)}
              {searchTerm && !matchingNodes.size && (
                <p className="text-xs text-muted-foreground">No matching spaces.</p>
              )}
            </div>
            {!readonlyView &&
              scope &&
              ["area", "line"].includes(scope.kind) &&
              childKind[scope.kind] && (
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
                <div
                  className="my-2 grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1"
                  role="group"
                  aria-label="Library collection"
                >
                  {(["stations", "equipment"] as const).map((collection) => (
                    <button
                      key={collection}
                      type="button"
                      aria-pressed={collection === libraryTab}
                      className="min-h-9 rounded-md px-1 text-xs font-medium aria-pressed:bg-card aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => {
                        setLibraryTab(collection);
                        setCatalogQuery("");
                      }}
                    >
                      {collection === "stations" ? "Station assemblies" : "Equipment"}
                    </button>
                  ))}
                </div>
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
                        aria-pressed={entry === selectedTemplate}
                        draggable
                        className={`flex min-h-9 w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${entry === selectedTemplate ? "bg-accent font-semibold" : ""}`}
                        onClick={() => setTemplateId(key)}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/x-ems-template", key);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        {entry.stationModel && (
                          <img
                            src={`/station-models/${entry.stationModel}.webp`}
                            alt=""
                            width={52}
                            height={38}
                            draggable={false}
                            className="h-10 w-14 shrink-0 rounded bg-stone-800 object-contain"
                          />
                        )}
                        <span>
                          {entry.label}{" "}
                          <span className="text-muted-foreground">· r{entry.revision}</span>
                        </span>
                      </button>
                    );
                  })}
                  {!catalog.length && (
                    <p className="text-xs text-muted-foreground">No matching templates.</p>
                  )}
                </div>
                {selectedTemplate?.stationModel && (
                  <p className="my-2 text-xs text-muted-foreground">
                    {selectedTemplate.provenance?.accuracy === "verified"
                      ? "Verified envelope"
                      : "Approximate envelope"}{" "}
                    · {selectedTemplate.size.x} × {selectedTemplate.size.y} ×{" "}
                    {selectedTemplate.size.z} m (X/Y/Z)
                  </p>
                )}
                {stations.length > 1 && (
                  <Field name="Placement station">
                    <select
                      className={control + " mb-2 w-full"}
                      value={targetStation?.id ?? ""}
                      onChange={(event) => setPlacementStationId(event.target.value)}
                    >
                      <option value="">Choose a station</option>
                      {stations.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <button
                  type="button"
                  className={button}
                  disabled={!targetStation || !selectedTemplate}
                  onClick={() => selectedTemplate && place(templateKey(selectedTemplate))}
                >
                  Place on floor
                </button>
                <p className="mt-1 text-xs text-muted-foreground">
                  {targetStation
                    ? "Destination · " + targetStation.label
                    : "Add or select a station in this scope to place equipment."}
                </p>
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
              <div className={panel + " ems-scene-tools space-y-2"}>
                <div className="ems-scene-tools-row flex flex-wrap items-center gap-2">
                  {levels.length > 1 && (
                    <button
                      type="button"
                      className={button}
                      aria-pressed={showStack}
                      onClick={() => setShowStack(!showStack)}
                    >
                      Building floors ({levels.length})
                    </button>
                  )}
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
                  <select
                    className={control}
                    aria-label="Camera direction"
                    value=""
                    onChange={(event) =>
                      viewport.current?.fit(event.target.value as CameraDirection)
                    }
                  >
                    <option value="" disabled>
                      Camera direction
                    </option>
                    <option value="isometric">Isometric</option>
                    <option value="top">Top</option>
                    <option value="front">Front</option>
                    <option value="side">Right side</option>
                  </select>
                  <button
                    type="button"
                    className={button}
                    aria-expanded={viewTools}
                    aria-controls="layout-view-tools"
                    onClick={() => setViewTools((value) => !value)}
                  >
                    View tools
                  </button>
                </div>
                <div id="layout-view-tools" className={viewTools ? "space-y-2" : "hidden"}>
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
              {scope && ["organization", "site", "building"].includes(scope.kind) && (
                <p className="text-sm font-medium">Viewing floor · {selectedFloor.label}</p>
              )}
              <div className="ems-stage">
                <Suspense
                  fallback={
                    <div
                      className="grid min-h-[360px] place-items-center rounded-lg bg-[#292624] text-sm text-stone-100"
                      role="status"
                    >
                      Loading 3D tools…
                    </div>
                  }
                >
                  <Scene
                    key={selectedFloor.id}
                    areas={floorAreas}
                    levels={showStack ? levels : selectedLevel}
                    activeFloor={selectedFloor.id}
                    onSpace={selectSpace}
                    activeAreaId={activeArea}
                    viewport={viewport}
                    floor={floor}
                    visible={visibleRecords}
                    connections={visibleLinks}
                    signalPaths={trace?.paths}
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
              </div>
              <FloorStrip
                floorName={selectedFloor.label}
                width={floor.size.x}
                depth={floor.size.z}
                sections={(floorAreas ?? []).map((a) => ({
                  id: a.id,
                  label: a.label,
                  defined: !!a.boundary && !a.estimated,
                  estimated: a.estimated,
                }))}
                activeSection={activeArea}
                onSection={selectSpace}
                onFloor={() => selectSpace(selectedFloor.id)}
              />
              {showStack && levels.length > 1 && (
                <p className="text-sm text-muted-foreground">
                  Separated floor view · Equipment is shown on {selectedFloor.label}. Select a floor
                  to work on it.
                </p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>
                  Drag to orbit · right-drag to pan · scroll to zoom · Shift+select for multiple
                  placements
                </span>
                {!!trace?.paths.length && (
                  <span>
                    <span aria-hidden="true" style={{ color: "#61e4cb" }}>
                      ➜{" "}
                    </span>
                    {trace.paths.length} configured signal{" "}
                    {trace.paths.length === 1 ? "path" : "paths"}
                  </span>
                )}
                {visibleLinks.length > 0 &&
                  connectionKinds
                    .filter((kind) => visibleLinks.some((item) => item.kind === kind))
                    .map((kind) => (
                      <span key={kind}>
                        <span style={{ color: connectionColors[kind] }}>━</span> {kind}
                      </span>
                    ))}
              </div>
              {mayTrace && (
                <details open={target?.traceRoute ? true : undefined} className={panel}>
                  <summary className="cursor-pointer font-medium">Process and signal flows</summary>
                  <div className="mt-2 grid gap-2">
                    <label className="engineering-picker-field">
                      Trace route
                      <select
                        value={traceRouteId}
                        onChange={(e) => {
                          setTraceRoute(e.target.value);
                          setTraceSection("");
                          setTraceStep("");
                        }}
                      >
                        <option value="">Physical layout only</option>
                        {processes.data?.document.routes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {processes.isError && <p role="alert">Process revision unavailable.</p>}
                    {traceRoute && trace && (
                      <>
                        <label className="engineering-picker-field">
                          Trace section
                          <select
                            value={traceSection}
                            onChange={(e) => {
                              setTraceSection(e.target.value);
                              setTraceStep("");
                            }}
                          >
                            <option value="">All sections</option>
                            {traceRoute.sections?.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="engineering-picker-field">
                          Trace step
                          <select value={traceStep} onChange={(e) => setTraceStep(e.target.value)}>
                            <option value="">All steps in scope</option>
                            {traceRoute.steps
                              .filter((s) => !traceSection || s.sectionId === traceSection)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={traceOnly}
                            onChange={(e) => setTraceOnly(e.target.checked)}
                          />{" "}
                          Isolate assigned stations
                        </label>
                        <Link
                          className="ref-issue-link"
                          to="/factory-process"
                          search={{
                            site,
                            engLine: traceRoute.lineId,
                            routeId: traceRoute.id,
                            stepId: traceStep || undefined,
                          }}
                        >
                          Open {traceStep ? "step" : "route"} definition
                        </Link>
                        <p className="text-xs">
                          Configured signal paths · Process revision {processes.data?.revision}.
                          Live observations unavailable.
                        </p>
                        {trace.steps
                          .filter((s) => s.completionSignal)
                          .map((s) => (
                            <div key={s.id} className="rounded border p-2 text-sm">
                              <strong>{s.name}</strong> · {s.completionSignal}
                              {savedEngineering?.signals
                                .filter((signal) => signal.key === s.completionSignal)
                                .map((signal) => (
                                  <p key={signal.key}>
                                    <Link
                                      className="ref-issue-link"
                                      to="/station-connectivity"
                                      search={{
                                        site,
                                        engLine: traceRoute.lineId,
                                        engStation: signal.stationId,
                                        signal: signal.key,
                                      }}
                                    >
                                      Source {signal.equipmentId}
                                    </Link>{" "}
                                    · {signal.protocol} {signal.address} · {signal.type}{" "}
                                    {signal.unit} · Freshness limit {signal.maxAge} s
                                  </p>
                                ))}
                              <ul>
                                {s.consumers?.map((c) => {
                                  if (c.kind === "mes") {
                                    const mapping = savedEngineering?.records.find(
                                      (record) =>
                                        record.kind === "mapping" && record.id === c.mappingId,
                                    );
                                    return (
                                      <li key={"mes/" + c.mappingId}>
                                        MES mapping ·{" "}
                                        {mapping ? (
                                          <Link
                                            className="ref-issue-link"
                                            to="/mes-integration"
                                            search={{
                                              site,
                                              engLine: traceRoute.lineId,
                                              engStation: mapping.parent,
                                              mapping: c.mappingId,
                                            }}
                                          >
                                            {c.mappingId}
                                          </Link>
                                        ) : (
                                          c.mappingId
                                        )}
                                        {mapping?.binding && <> → {mapping.binding}</>}
                                      </li>
                                    );
                                  }
                                  const app = maySeeStudio
                                    ? apps.data?.find((app) => app.id === c.appId)
                                    : undefined;
                                  const widgets = app?.screens.flatMap((screen) =>
                                    screen.widgets
                                      .filter((widget) => widget.signalId === c.signalId)
                                      .map((widget) => screen.name + " / " + widget.title),
                                  );
                                  return (
                                    <li key={JSON.stringify([c.appId, c.signalId])}>
                                      Application input ·{" "}
                                      {maySeeStudio ? (
                                        <Link
                                          className="ref-issue-link"
                                          to="/application-studio"
                                          search={{
                                            site,
                                            app: c.appId,
                                            view: "bindings",
                                          }}
                                        >
                                          {app?.name ?? c.appId} / {c.signalId}
                                        </Link>
                                      ) : (
                                        c.appId + " / " + c.signalId
                                      )}
                                      {widgets?.length ? (
                                        <div>Screen / widget · {widgets.join(", ")}</div>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                        {!trace.paths.length && (
                          <p className="text-xs">
                            No drawable source-to-terminal paths in this selection.
                          </p>
                        )}
                        {trace.findings.map((f, i) => (
                          <p key={i} className="text-xs">
                            {f}
                          </p>
                        ))}
                      </>
                    )}
                  </div>
                </details>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <SpatialProjection
                  mode="plan"
                  areas={floorAreas}
                  floor={floor}
                  records={visibleRecords}
                  connections={visibleLinks}
                  selected={selection}
                  signalPaths={trace?.paths}
                  onSelect={select}
                />
                <SpatialProjection
                  mode="elevation"
                  areas={floorAreas}
                  floor={floor}
                  records={visibleRecords}
                  connections={visibleLinks}
                  selected={selection}
                  signalPaths={trace?.paths}
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

        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize properties panel"
          aria-controls="layout-properties"
          aria-valuenow={inspectorWidth}
          aria-valuemin={216}
          aria-valuemax={420}
          aria-valuetext={inspectorWidth + " pixels"}
          title="Drag to resize, or use the left and right arrow keys"
          className="hidden cursor-col-resize touch-none rounded bg-border/50 hover:bg-primary/60 focus-visible:outline-2 focus-visible:outline-ring xl:block"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              const right = event.currentTarget.parentElement?.getBoundingClientRect().right;
              if (right !== undefined)
                setInspectorWidth(boundWidth(Math.round(right - event.clientX)));
            }
          }}
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              setInspectorWidth((value) =>
                event.key === "Home"
                  ? 216
                  : event.key === "End"
                    ? 420
                    : boundWidth(value + (event.key === "ArrowLeft" ? 16 : -16)),
              );
            }
          }}
        />
        <aside
          id="layout-properties"
          aria-label="Placement properties"
          className={`min-w-0 space-y-3 ${compactPanel === "properties" ? "" : "hidden xl:block"}`}
        >
          <LayoutSetupEntry
            inspector
            site={site}
            document={document}
            savedDocument={baseline.document}
            itemId={selection.length ? selection.at(-1) : scopeId || undefined}
            itemType={selection.length ? "occurrence" : "space"}
            dirty={dirty}
            busy={busy}
            showSave={() => {
              setReadonlyView(false);
              setRevisionTools(true);
              requestAnimationFrame(() =>
                window.document.querySelector<HTMLInputElement>(".ems-layout-save input")?.focus(),
              );
            }}
            showInspector={() => setCompactPanel("properties")}
            showHierarchy={() => setCompactPanel("library")}
            showItem={(id) => {
              jumpTo(id);
              setCompactPanel("scene");
              requestAnimationFrame(() => viewport.current?.fit());
            }}
          />
          {scope && (
            <EngineeringPlacement
              key={scope.id + "/" + (selectedRecord?.record.id ?? "")}
              site={site}
              scope={scope}
              placed={selectedRecord?.record}
              document={document}
              readonly={readonlyView}
              target={target}
              apply={edited}
              selectSpace={selectSpace}
            />
          )}
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
                stationPath={spaceTrail(spaces, selectedRecord.record.stationId)
                  .map((node) => node.label)
                  .join(" / ")}
                site={site}
                origin={floor.origin}
                onApply={updateRecord}
                connectionCount={
                  document.connections.filter(
                    (link) =>
                      link.from.occurrenceId === selectedRecord.record.id ||
                      link.to.occurrenceId === selectedRecord.record.id,
                  ).length
                }
                onRemove={() => remove(selectedRecord.record.id)}
                onState={(change) => updateRecord({ ...selectedRecord.record, ...change })}
              />
            ) : (
              <div className={panel}>
                <h2 className="font-semibold">{selectedRecord.record.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {spaceTrail(spaces, selectedRecord.record.stationId)
                    .map((node) => node.label)
                    .join(" / ")}
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
                    engineeringId={
                      selectedRecord.record.asset?.system === "EMS" &&
                      selectedRecord.record.asset.kind === "terminal"
                        ? selectedRecord.record.asset.id
                        : undefined
                    }
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
                const record =
                  document.occurrences.find((item) => item.id === id) ?? spaces.get(id);
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
