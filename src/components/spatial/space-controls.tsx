import { useEffect, useMemo, useState, type FormEvent } from "react";

export type SpaceNode = { id: string; label: string; kind: string; parentId: string | null };

export interface SpaceControlsProps {
  spaces: ReadonlyArray<SpaceNode>;
  scopeId: string;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onCreate: (parentId: string, label: string) => void;
  onRename: (id: string, label: string) => void;
}

const LEVELS = ["site", "building", "floor", "area"] as const;
type Level = (typeof LEVELS)[number];
const LEVEL_LABEL: Record<Level, string> = {
  site: "Site",
  building: "Building",
  floor: "Floor",
  area: "Section",
};
const CHILD_OF: Partial<Record<Level, Level>> = {
  site: "building",
  building: "floor",
  floor: "area",
};
const MAX = 180;

const fieldCls =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const btnCls =
  "inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

function isLevel(k: string): k is Level {
  return (LEVELS as readonly string[]).includes(k);
}

function validateSpaceName(
  raw: string,
  siblings: ReadonlyArray<SpaceNode>,
  selfId?: string,
): string | null {
  const name = raw.trim();
  if (!name) return "Enter a name.";
  if (name.length > MAX) return `Use ${MAX} characters or fewer.`;
  const lower = name.toLowerCase();
  if (siblings.some((s) => s.id !== selfId && s.label.trim().toLowerCase() === lower))
    return "A sibling with this name already exists.";
  return null;
}

export function SpaceControls({
  spaces,
  scopeId,
  readOnly,
  onSelect,
  onCreate,
  onRename,
}: SpaceControlsProps) {
  const byId = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const childrenOf = (parentId: string | null, kind?: Level) =>
    spaces
      .filter((s) => s.parentId === parentId && (!kind || s.kind === kind))
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label));

  const ancestry = useMemo(() => {
    const chain: SpaceNode[] = [];
    const seen = new Set<string>();
    let cur = byId.get(scopeId);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  }, [byId, scopeId]);

  const at = (level: Level) => ancestry.find((s) => s.kind === level) ?? null;
  const site = at("site");
  const building = at("building");
  const floor = at("floor");
  const area = at("area");

  const sites = useMemo(() => {
    const roots = spaces.filter((s) => s.kind === "site");
    return roots.length ? roots : site ? [site] : [];
  }, [spaces, site]);

  const selects: { level: Level; value: string; options: SpaceNode[]; parent: SpaceNode | null }[] =
    [
      { level: "site", value: site?.id ?? "", options: sites, parent: null },
      {
        level: "building",
        value: building?.id ?? "",
        options: site ? childrenOf(site.id, "building") : [],
        parent: site,
      },
      {
        level: "floor",
        value: floor?.id ?? "",
        options: building ? childrenOf(building.id, "floor") : [],
        parent: building,
      },
      {
        level: "area",
        value: area?.id ?? "",
        options: floor ? childrenOf(floor.id, "area") : [],
        parent: floor,
      },
    ];

  // Manage panel
  const [mode, setMode] = useState<"add" | "rename">("add");
  const parentCandidates = spaces.filter((s) => isLevel(s.kind) && CHILD_OF[s.kind]);
  const renameCandidates = spaces.filter(
    (s) => s.kind === "building" || s.kind === "floor" || s.kind === "area",
  );
  const defaultParent = (floor ?? building ?? site)?.id ?? parentCandidates[0]?.id ?? "";
  const defaultTarget = (area ?? floor ?? building)?.id ?? renameCandidates[0]?.id ?? "";
  const [parentId, setParentId] = useState(defaultParent);
  const [targetId, setTargetId] = useState(defaultTarget);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setParentId(defaultParent);
    setTargetId(defaultTarget);
  }, [defaultParent, defaultTarget]);

  useEffect(() => {
    if (mode === "rename") setName(byId.get(targetId)?.label ?? "");
    else setName("");
    setError(null);
  }, [mode, targetId, byId]);

  const parentNode = byId.get(parentId);
  const childLevel = parentNode && isLevel(parentNode.kind) ? CHILD_OF[parentNode.kind] : undefined;
  const pathLabel = (node: SpaceNode) => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur: SpaceNode | undefined = node;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.label);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" / ");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    if (mode === "add") {
      if (!parentNode || !childLevel)
        return setError("Choose a site, building or floor as the parent.");
      const err = validateSpaceName(name, childrenOf(parentNode.id));
      if (err) return setError(err);
      onCreate(parentNode.id, name.trim());
      setStatus(`${LEVEL_LABEL[childLevel]} “${name.trim()}” added under ${parentNode.label}.`);
      setName("");
    } else {
      const target = byId.get(targetId);
      if (!target) return setError("Choose a building, floor or section to rename.");
      const err = validateSpaceName(name, childrenOf(target.parentId), target.id);
      if (err) return setError(err);
      if (name.trim() === target.label) return setError("The name is unchanged.");
      onRename(target.id, name.trim());
      setStatus(`Renamed to “${name.trim()}”.`);
    }
    setError(null);
  };

  return (
    <section aria-label="Space selection" className="w-full min-w-0 space-y-2 pt-3">
      {spaces.length === 0 ? (
        <p
          role="status"
          className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground"
        >
          No sites, buildings, floors or sections have been defined yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {selects.map(({ level, value, options, parent }) => {
            const id = `space-select-${level}`;
            return (
              <div key={level} className="flex min-w-0 flex-col gap-1">
                <label htmlFor={id} className="text-sm font-medium">
                  {LEVEL_LABEL[level]}
                </label>
                <select
                  id={id}
                  className={fieldCls}
                  value={value}
                  disabled={options.length === 0}
                  onChange={(e) => {
                    if (e.target.value) onSelect(e.target.value);
                    else if (parent) onSelect(parent.id);
                  }}
                >
                  <option value="">
                    {options.length === 0
                      ? level !== "site" && !parent
                        ? `Choose a ${LEVEL_LABEL[LEVELS[LEVELS.indexOf(level) - 1] ?? "site"].toLowerCase()} first`
                        : "None available"
                      : `All ${LEVEL_LABEL[level].toLowerCase()}s`}
                  </option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <details>
          <summary className="cursor-pointer py-2 font-medium">
            Manage buildings, floors and sections
          </summary>
          <form
            onSubmit={submit}
            aria-labelledby="space-manage-title"
            className="space-y-4 rounded-md border border-border bg-muted/40 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 id="space-manage-title" className="text-base font-semibold">
                Manage spaces
              </h3>
              <div
                role="radiogroup"
                aria-label="Manage action"
                className="inline-flex rounded-md border border-border p-1"
              >
                {(["add", "rename"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={`${btnCls} h-9 ${mode === m ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"}`}
                  >
                    {m === "add" ? "Add" : "Rename"}
                  </button>
                ))}
              </div>
            </div>
            {readOnly && (
              <p className="text-sm text-muted-foreground">
                Read-only: you can navigate spaces but not change them.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {mode === "add" ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="space-parent" className="text-sm font-medium">
                    Parent
                  </label>
                  <select
                    id="space-parent"
                    className={fieldCls}
                    value={parentId}
                    disabled={readOnly || parentCandidates.length === 0}
                    onChange={(e) => setParentId(e.target.value)}
                  >
                    {parentCandidates.length === 0 && <option value="">No site available</option>}
                    {parentCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {LEVEL_LABEL[p.kind as Level]}: {pathLabel(p)}
                      </option>
                    ))}
                  </select>
                  {childLevel && (
                    <p className="text-xs text-muted-foreground">
                      Adds a {LEVEL_LABEL[childLevel].toLowerCase()}.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="space-target" className="text-sm font-medium">
                    Space to rename
                  </label>
                  <select
                    id="space-target"
                    className={fieldCls}
                    value={targetId}
                    disabled={readOnly || renameCandidates.length === 0}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    {renameCandidates.length === 0 && <option value="">Nothing to rename</option>}
                    {renameCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {LEVEL_LABEL[p.kind as Level]}: {pathLabel(p)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="space-name" className="text-sm font-medium">
                  Name
                </label>
                <input
                  id="space-name"
                  className={fieldCls}
                  value={name}
                  maxLength={MAX}
                  disabled={readOnly}
                  aria-invalid={error ? true : undefined}
                  aria-describedby="space-name-help"
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                />
                <p
                  id="space-name-help"
                  className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
                  role={error ? "alert" : undefined}
                >
                  {error ?? `${name.trim().length}/${MAX} characters, unique among siblings.`}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                {status}
              </p>
              <button
                type="submit"
                disabled={
                  readOnly || (mode === "add" ? !childLevel : renameCandidates.length === 0)
                }
                className={`${btnCls} w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto`}
              >
                {mode === "add"
                  ? childLevel
                    ? `Add ${LEVEL_LABEL[childLevel].toLowerCase()}`
                    : "Add"
                  : "Rename"}
              </button>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}
