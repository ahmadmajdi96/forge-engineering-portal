import { WorkspaceLoading } from "@/components/engineering/workspace-loading";
import { useEffect, useReducer, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  ClipboardCheck,
  Code2,
  Layers3,
  Play,
  Plus,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EmsMode, SiteSummary } from "@/lib/production/contracts";
import { loadFactoryWorkspace, saveFactoryWorkspace } from "@/lib/production/workspace.functions";
import {
  compileApplication,
  newStudioApplication,
  studioWorkspaceSchema,
  variantPixels,
  type StudioDefinition,
  type StudioIssue,
  type StudioWorkspace,
  type Variant,
} from "@/lib/studio/model";
import type { StudioPane } from "@/lib/studio/legacy-route";
import type { ConnectorResult } from "@/lib/studio/runtime";
import { validateFactoryStudioDefinition } from "@/lib/studio/validation.functions";
import { ApplicationPlayer } from "./application-player";
import { StudioBindingsEditor } from "./bindings-editor";
import { editorInput, Field } from "./editor-fields";
import { StudioScreenEditor, VariantSelect } from "./screen-editor";
import { StudioWorkflowEditor } from "./workflow-editor";

const validationEditors = {
  screens: "screens",
  widgets: "screens",
  components: "screens",
  entry: "workflow",
  nodes: "workflow",
  transitions: "workflow",
  signals: "bindings",
  variables: "bindings",
  dependencies: "bindings",
  media: "bindings",
  capabilities: "bindings",
  connectorIds: "bindings",
  evidenceIds: "bindings",
} satisfies Record<string, StudioPane>;

const workspaceReply = z.object({ revision: z.number().int().nonnegative(), payload: z.unknown() });

const empty: StudioWorkspace = { version: 1, applications: [] };
const kinds: Record<StudioDefinition["kind"], string> = {
  operator: "Operator app",
  hmi: "HMI",
  procedure: "Procedure",
};
const panes = [
  { key: "screens", label: "Screens", icon: Layers3 },
  { key: "workflow", label: "Workflow", icon: Code2 },
  { key: "bindings", label: "Bindings", icon: ClipboardCheck },
  { key: "preview", label: "Preview", icon: Play },
] as const;

type History = { past: StudioWorkspace[]; current: StudioWorkspace; future: StudioWorkspace[] };
type Edit = { type: "reset" | "commit"; workspace: StudioWorkspace } | { type: "undo" | "redo" };

function history(state: History, action: Edit): History {
  switch (action.type) {
    case "reset":
      return { past: [], current: action.workspace, future: [] };
    case "commit":
      return {
        past: [...state.past.slice(-49), state.current],
        current: action.workspace,
        future: [],
      };
    case "undo": {
      const previous = state.past.at(-1);
      return previous
        ? {
            past: state.past.slice(0, -1),
            current: previous,
            future: [state.current, ...state.future],
          }
        : state;
    }
    case "redo": {
      const next = state.future[0];
      return next
        ? { past: [...state.past, state.current], current: next, future: state.future.slice(1) }
        : state;
    }
  }
}

type StudioPageProps = {
  mode: EmsMode;
  site: SiteSummary | null;
  requestedSite?: string | undefined;
  requestedApp?: string | undefined;
  requestedKind?: StudioDefinition["kind"] | undefined;
  terminal?: string | undefined;
  initialPane?: StudioPane | undefined;
  selectApp: (app: string) => void;
  selectPane: (pane: StudioPane) => void;
};

export function ApplicationStudioPage(props: StudioPageProps) {
  const { mode, site, requestedSite } = props;
  const sandbox = mode === "sandbox";
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="application-studio-title">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            id="application-studio-title"
            className="font-display text-2xl font-semibold tracking-tight"
          >
            Application Studio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Design operator screens, HMIs and procedures. Validate their behavior before review.
          </p>
        </div>
      </header>
      {sandbox && (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          Sandbox session. Edits stay in this tab and can be exported.
        </p>
      )}
      {!sandbox && !site && (
        <p role="alert" className="rounded-md border border-border p-3 text-sm">
          {requestedSite
            ? "This factory site is unavailable in your current session."
            : "Sign in with access to a factory site to open saved applications."}
        </p>
      )}
      {(sandbox || site) && <WorkspaceStudio key={site?.key ?? "sandbox"} {...props} />}
    </section>
  );
}

function WorkspaceStudio({
  mode,
  site,
  requestedApp,
  requestedKind,
  terminal,
  initialPane,
  selectApp,
  selectPane,
}: StudioPageProps) {
  const load = useServerFn(loadFactoryWorkspace);
  const save = useServerFn(saveFactoryWorkspace);
  const validateSaved = useServerFn(validateFactoryStudioDefinition);
  const [edits, edit] = useReducer(history, { past: [], current: empty, future: [] });
  const [saved, setSaved] = useState<StudioWorkspace>(empty);
  const [revision, setRevision] = useState(0);
  const [draftApplication, setDraftApplication] = useState(requestedApp ?? "");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<StudioDefinition["kind"]>(requestedKind ?? "operator");
  const [reason, setReason] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [variant, setVariant] = useState<Variant>("panel");
  const [fetchState, setFetchState] = useState<"loading" | "ready" | "failed">(
    site ? "loading" : "ready",
  );
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [validation, setValidation] = useState<{
    source: StudioDefinition;
    issues: StudioIssue[];
    verifiedRevision?: number;
  } | null>(null);
  const [preview, setPreview] = useState<{
    source: StudioDefinition;
    app: StudioDefinition;
    tick: number;
  } | null>(null);
  const [previewOutcome, setPreviewOutcome] = useState<ConnectorResult["outcome"]>("accepted");

  const sandbox = mode === "sandbox";
  const dirty = edits.current !== saved;
  const activeKey = requestedApp ?? draftApplication;
  const app =
    edits.current.applications.find((item) => item.id === activeKey) ??
    (activeKey
      ? undefined
      : edits.current.applications.find((item) => !requestedKind || item.kind === requestedKind));
  const pane = initialPane ?? "screens";

  const loaded = useRef(false);
  const workspaceSite = site?.key;
  useEffect(() => {
    if (!workspaceSite) return;
    let current = true;
    void load({ data: { site: workspaceSite, workspace: "studio" } })
      .then((reply) => {
        const value = workspaceReply.parse(reply);
        const next = value.payload === null ? empty : studioWorkspaceSchema.parse(value.payload);
        if (!current) return;
        loaded.current = true;
        edit({ type: "reset", workspace: next });
        setSaved(next);
        setRevision(value.revision);
        setFetchState("ready");
      })
      .catch(() => {
        if (!current) return;
        setStatus({
          type: "error",
          text:
            refresh > 0 && loaded.current
              ? "Reload failed. Your current draft is still available. Retry or export a copy."
              : "Could not load this factory’s Studio. Check your site access and try again.",
        });
        setFetchState(loaded.current ? "ready" : "failed");
      });
    return () => {
      current = false;
    };
  }, [load, refresh, workspaceSite]); // The site key scopes one immutable revision stream.

  useBlocker({
    enableBeforeUnload: dirty,
    shouldBlockFn: ({ current, next }) => {
      if (!dirty) return false;
      const currentSite = "site" in current.search ? current.search.site : undefined;
      const nextSite = "site" in next.search ? next.search.site : undefined;
      const leaving = current.pathname !== next.pathname || currentSite !== nextSite;
      return (
        leaving &&
        !window.confirm(
          "Leave the Studio with unsaved edits? Export the draft first to keep a copy.",
        )
      );
    },
  });

  const apply = (workspace: StudioWorkspace) => {
    setStatus(null);
    edit({ type: "commit", workspace });
  };
  const updateApp = (next: StudioDefinition) =>
    apply({
      ...edits.current,
      applications: edits.current.applications.map((item) => (item.id === next.id ? next : item)),
    });
  const switchApp = (key: string) => {
    setDraftApplication(key);
    setValidation(null);
    setPreview(null);
    selectApp(key);
  };
  const addApplication = () => {
    const name = newName.trim();
    if (!name || edits.current.applications.length >= 100) return;
    const next = newStudioApplication(crypto.randomUUID(), name, newKind);
    apply({ ...edits.current, applications: [...edits.current.applications, next] });
    switchApp(next.id);
    setNewName("");
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(edits.current, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `studio-${site?.key ?? "sandbox"}-draft.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const saveDraft = async () => {
    if (!site || saving || !dirty || reason.trim().length < 3) return;
    const checked = studioWorkspaceSchema.safeParse(edits.current);
    if (!checked.success) {
      const first = checked.error.issues[0];
      setStatus({
        type: "error",
        text: `Draft contains an invalid field. ${first?.path.join(".") ?? ""} ${first?.message ?? ""}`,
      });
      return;
    }
    const snapshot = edits.current;
    setSaving(true);
    setStatus(null);
    try {
      const next = await save({
        data: {
          site: site.key,
          workspace: "studio",
          expected: revision,
          reason,
          payload: checked.data,
        },
      });
      setRevision(next.revision);
      setSaved(snapshot);
      setReason("");
      setStatus({ type: "success", text: `Saved factory Studio revision ${next.revision}.` });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save this factory Studio.";
      setStatus({ type: "error", text: message });
    } finally {
      setSaving(false);
    }
  };

  const reload = () => {
    if (
      dirty &&
      !window.confirm(
        "Reload the saved revision and discard the current unsaved edits? Export first to keep a copy.",
      )
    )
      return;
    setFetchState("loading");
    setStatus(null);
    setPreview(null);
    setValidation(null);
    setRefresh((number) => number + 1);
  };

  const validate = async (launch = false) => {
    if (!app || validating) return;
    if (!launch && !dirty && site && revision > 0) {
      setStatus(null);
      setValidating(true);
      try {
        const result = await validateSaved({
          data: { site: site.key, application: app.id, revision },
        });
        setValidation({ source: app, issues: result.issues, verifiedRevision: result.revision });
      } catch {
        setStatus({
          type: "error",
          text: "Could not record validation for this revision. Check your validation grant and try again.",
        });
      } finally {
        setValidating(false);
      }
      return;
    }
    const result = compileApplication(app);
    setValidation({ source: app, issues: result.ok ? [] : result.issues });
    if (launch && result.ok)
      setPreview({ source: app, app: result.app, tick: (preview?.tick ?? 0) + 1 });
  };

  const canRelease = !dirty && !sandbox && revision > 0 && app && app.kind !== "procedure" && site;
  const releaseHref = canRelease
    ? `/factory-releases?${new URLSearchParams({ site: site.key, app: app.id, revision: String(revision) })}`
    : null;
  const visibleValidation = validation?.source === app ? validation : null;

  if (fetchState === "loading") return <WorkspaceLoading message="Loading factory applications…" />;
  if (fetchState === "failed")
    return (
      <section className="eng-panel grid justify-items-start gap-2">
        <p role="alert" className="text-sm text-destructive">
          {status?.text}
        </p>
        <Button type="button" variant="outline" onClick={reload}>
          Retry loading applications
        </Button>
      </section>
    );

  return (
    <>
      <section className="eng-panel grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {edits.current.applications.length > 0 && (
            <Field label="Application">
              <select
                className={editorInput}
                value={app?.id ?? ""}
                onChange={(event) => switchApp(event.target.value)}
              >
                <option value="" disabled>
                  Select an application
                </option>
                {edits.current.applications.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name || "Unnamed app"} · {kinds[item.kind]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <details
            open={!edits.current.applications.length}
            className="min-w-0 max-w-full rounded-md border border-border/70 bg-background/50 px-3 py-1"
          >
            <summary className="cursor-pointer py-2 text-sm font-medium">New application</summary>
            <form
              className="flex min-w-0 flex-wrap items-end gap-2 border-t py-3"
              onSubmit={(event) => {
                event.preventDefault();
                addApplication();
              }}
            >
              <Field label="New application name">
                <input
                  className={editorInput}
                  value={newName}
                  maxLength={120}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </Field>
              <Field label="Application type">
                <select
                  className={editorInput}
                  value={newKind}
                  onChange={(event) => setNewKind(event.target.value as StudioDefinition["kind"])}
                >
                  {Object.entries(kinds).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                type="submit"
                variant="outline"
                disabled={!newName.trim() || edits.current.applications.length >= 100}
              >
                <Plus />
                Create application
              </Button>
            </form>
          </details>
        </div>
        {terminal && (
          <p className="text-sm text-muted-foreground">
            Terminal context <span className="font-mono text-foreground">{terminal}</span>.
            Assignment is managed from a published release.
          </p>
        )}
        {requestedApp && !app && (
          <p role="status" className="text-sm text-muted-foreground">
            The requested application is unavailable in this site.
          </p>
        )}
      </section>
      {app && (
        <>
          <section className="eng-panel grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Field label="Application name">
                <input
                  className={editorInput}
                  value={app.name}
                  maxLength={120}
                  onChange={(event) => updateApp({ ...app, name: event.target.value })}
                />
              </Field>
              <p className="text-sm text-muted-foreground">
                {sandbox ? "Sandbox draft" : `Site revision ${revision}`}
                {dirty ? " · Unsaved edits" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!edits.past.length}
                  onClick={() => edit({ type: "undo" })}
                >
                  <Undo2 />
                  Undo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!edits.future.length}
                  onClick={() => edit({ type: "redo" })}
                >
                  <Redo2 />
                  Redo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={validating}
                  onClick={() => void validate()}
                >
                  <ClipboardCheck />
                  {validating ? "Validating…" : "Validate"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {!sandbox && (
                <>
                  <Field
                    label="Change reason"
                    hint={
                      dirty && reason.trim().length < 3
                        ? "Enter at least three characters to save."
                        : undefined
                    }
                  >
                    <input
                      className={editorInput}
                      value={reason}
                      maxLength={500}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="button"
                    disabled={saving || !dirty || reason.trim().length < 3}
                    onClick={() => void saveDraft()}
                  >
                    <Save />
                    {saving ? "Saving…" : "Save draft"}
                  </Button>
                  <Button type="button" variant="outline" disabled={saving} onClick={reload}>
                    Reload saved
                  </Button>
                </>
              )}
              <Button type="button" variant="outline" onClick={download}>
                Export draft
              </Button>
              {releaseHref && (
                <Button asChild variant="secondary">
                  <a href={releaseHref}>
                    Open release review <ArrowUpRight />
                  </a>
                </Button>
              )}
            </div>
            {status && (
              <p
                role={status.type === "error" ? "alert" : "status"}
                className={`text-sm ${status.type === "error" ? "text-destructive" : "text-foreground"}`}
              >
                {status.text}
              </p>
            )}
            {validation && !visibleValidation && (
              <p className="text-xs text-muted-foreground">
                Draft changed since the last check. Validate again for current results.
              </p>
            )}
            {visibleValidation &&
              (visibleValidation.issues.length ? (
                <div role="alert" className="grid gap-2 rounded border border-destructive/50 p-2">
                  <p className="text-sm font-medium text-destructive">
                    {visibleValidation.issues.length} validation{" "}
                    {visibleValidation.issues.length === 1 ? "issue" : "issues"}
                  </p>
                  <ul className="grid max-h-64 gap-1 overflow-auto text-sm">
                    {visibleValidation.issues.map((issue, index) => {
                      const field = issue.path.split(".")[0] ?? "";
                      const editor = validationEditors[field as keyof typeof validationEditors];
                      return (
                        <li key={index}>
                          <span className="font-mono text-xs text-muted-foreground">
                            {issue.path}
                          </span>{" "}
                          {issue.message}
                          {editor && (
                            <button
                              type="button"
                              className="ml-2 min-h-9 rounded px-1 text-sm font-medium text-primary underline underline-offset-2"
                              onClick={() => {
                                selectPane(editor);
                                document.getElementById("studio-views")?.focus();
                              }}
                            >
                              Open {panes.find((item) => item.key === editor)?.label}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p role="status" className="text-sm font-medium">
                  {visibleValidation.verifiedRevision
                    ? `Saved revision ${visibleValidation.verifiedRevision} passed. Result recorded in audit.`
                    : "Application validation passed."}
                </p>
              ))}
          </section>
          <nav
            id="studio-views"
            tabIndex={-1}
            className="grid scroll-mt-20 grid-cols-2 gap-2 rounded-lg border border-border bg-card p-2 sm:grid-cols-4"
            aria-label="Studio views"
          >
            {panes.map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                type="button"
                variant={pane === key ? "default" : "outline"}
                aria-pressed={pane === key}
                onClick={() => selectPane(key)}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </nav>
          {pane === "screens" && (
            <StudioScreenEditor
              key={app.id}
              app={app}
              setApp={updateApp}
              variant={variant}
              setVariant={setVariant}
            />
          )}
          {pane === "workflow" && (
            <StudioWorkflowEditor key={app.id} app={app} setApp={updateApp} />
          )}
          {pane === "bindings" && (
            <StudioBindingsEditor key={app.id} app={app} setApp={updateApp} />
          )}
          {pane === "preview" && (
            <section id="studio-preview" className="eng-panel grid gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="mr-auto">
                  <h2 className="font-semibold">Isolated preview</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Run the pinned draft with synthetic inputs and connector results.
                  </p>
                </div>
                <VariantSelect variant={variant} setVariant={setVariant} />
                {app.connectorIds.length > 0 && (
                  <Field label="Simulated connector result">
                    <select
                      className={editorInput}
                      value={previewOutcome}
                      onChange={(event) =>
                        setPreviewOutcome(event.target.value as ConnectorResult["outcome"])
                      }
                    >
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </Field>
                )}
                <Button type="button" disabled={validating} onClick={() => void validate(true)}>
                  <Play />
                  {preview ? "Load current draft" : "Load preview"}
                </Button>
              </div>
              {preview && preview.source.id === app.id && (
                <>
                  {preview.source !== app && (
                    <p role="status" className="text-sm text-muted-foreground">
                      This preview still uses the earlier draft. Load the current draft to test your
                      edits.
                    </p>
                  )}
                  <div className="w-full" style={{ maxWidth: variantPixels[variant] }}>
                    <ApplicationPlayer
                      key={preview.tick}
                      app={preview.app}
                      mode="simulation"
                      variant={variant}
                      simulationOutcome={previewOutcome}
                    />
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
      {!app && !requestedApp && (
        <p className="eng-panel text-sm text-muted-foreground">
          Create an application to start authoring.
        </p>
      )}
    </>
  );
}
