import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Box, ChevronLeft, ChevronRight, Layers, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import {
  assetKinds,
  buildRegistry,
  pageRegistry,
  type RegistryQuery,
  type RegistryRow,
} from "@/lib/engineering/asset-search";
import { searchSavedAssets } from "@/lib/engineering/asset-search.functions";
import { ReferencePage, Surface, RefTable, RefTabs, KeyValues, Notice } from "./reference-ui";
import { HardwareAssignment } from "./hardware-assignment";
import { placedHardware } from "@/lib/engineering/hardware-lifecycle";
import { RecordActions } from "./record-editor";
import { AssetHierarchy } from "./reference-assets";
import { WorkspaceHistory } from "./workspace-history";
import { AssetReports } from "./asset-reports";

export function AssetRegister() {
  const { workspaceModel, revision, site, native, dirty, loadState, reload } = useEngineering();
  const search = useSearch({ from: "/registry" });
  const navigate = useNavigate({ from: "/registry" });
  const [retry, setRetry] = useState(0),
    [view, setView] = useState("Table");
  const [draftQuery, setDraftQuery] = useState(search.q ?? "");
  useEffect(() => setDraftQuery(search.q ?? ""), [search.q, site]);
  type Filters = Partial<typeof search>;
  function change(next: Filters) {
    void navigate({
      replace: true,
      search: (old) => ({ ...old, page: 1, engAsset: undefined, ...next }),
    });
  }
  const query = useMemo<RegistryQuery>(
    () => ({
      locate: search.engAsset,
      q: search.q ?? "",
      line: search.registryLine ?? "",
      kind: search.kind ?? "all",
      state: search.state ?? "active",
      sort: search.sort ?? "name",
      direction: search.direction ?? "asc",
      size: search.size ?? 25,
      page: search.page ?? 1,
    }),
    [
      search.engAsset,
      search.q,
      search.registryLine,
      search.kind,
      search.state,
      search.sort,
      search.direction,
      search.size,
      search.page,
    ],
  );
  const key = JSON.stringify([site, revision, query, retry]);
  const fetchPage = useServerFn(searchSavedAssets);
  const saved = Boolean(native && revision && site && !dirty);
  const [response, setResponse] = useState<{
    key: string;
    result?: ReturnType<typeof pageRegistry>;
    error?: string;
  }>();
  useEffect(() => {
    if (!saved || !site || loadState !== "ready") return;
    let current = true;
    void fetchPage({ data: { ...query, site, revision } }).then(
      (result) => {
        if (current) setResponse({ key, result });
      },
      () => {
        if (current)
          setResponse({
            key,
            error: "Could not load this revision’s asset page. Check your session or retry.",
          });
      },
    );
    return () => {
      current = false;
    };
  }, [key, saved, fetchPage, loadState, query, site, revision]);
  const local = useMemo(
    () => (saved ? [] : buildRegistry(workspaceModel)),
    [saved, workspaceModel],
  );
  const result =
    loadState === "ready"
      ? saved
        ? response?.key === key
          ? response.result
          : undefined
        : pageRegistry(local, query, site ?? workspaceModel.scope)
      : undefined;
  const error =
    loadState === "error"
      ? "The factory workspace could not be loaded."
      : saved && response?.key === key
        ? response.error
        : undefined;
  const effectivePage = result?.page;
  useEffect(() => {
    if (effectivePage && effectivePage !== query.page)
      void navigate({ replace: true, search: (p) => ({ ...p, page: effectivePage }) });
  }, [effectivePage, query.page, navigate]);
  const row = result?.rows.find((row) => row.key === search.engAsset || row.id === search.engAsset);
  const pick = (row: RegistryRow) =>
    void navigate({ replace: true, search: (p) => ({ ...p, engAsset: row.key }) });
  if (view === "Station relationships")
    return (
      <>
        <div className="mb-3">
          <Button variant="outline" onClick={() => setView("Table")}>
            Back to registry
          </Button>
        </div>
        <AssetHierarchy />
      </>
    );
  if (search.view === "reports") return <AssetReports />;
  const groups = new Map<string, RegistryRow[]>();
  for (const item of result?.rows ?? []) {
    const path = [item.line, item.station].filter(Boolean).join(" / ") || "Unassigned";
    groups.set(path, [...(groups.get(path) ?? []), item]);
  }
  return (
    <ReferencePage
      title="Assets"
      sub={`Asset registry · ${site ?? workspaceModel.scope}`}
      actions={
        <div className="ref-actions">
          <Button asChild variant="outline">
            <Link to="/registry" search={(old) => ({ ...old, view: "reports", report: "inventory" })}>
              Reports & export
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/factory-layout" search={(old) => ({ ...old })}>
              <Layers size={15} />
              Factory layout
            </Link>
          </Button>
        </div>
      }
    >
      <Surface
        title="Factory assets"
        sub={
          native
            ? dirty
              ? "Working draft with unsaved changes"
              : revision
                ? "Saved engineering revision r" + revision
                : "New engineering workspace"
            : "Illustrative engineering workspace"
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <form
            className="flex min-w-0 flex-1 items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              change({ q: draftQuery.trim() });
            }}
          >
            <label className="min-w-36 flex-1">
              Find assets
              <input
                aria-label="Find assets"
                value={draftQuery}
                maxLength={160}
                placeholder="Name, identifier, station or external ID"
                onChange={(e) => setDraftQuery(e.target.value)}
              />
            </label>
            <Button type="submit" variant="outline">
              <Search size={15} />
              Search
            </Button>
          </form>
          <label>
            Line
            <select value={query.line} onChange={(e) => change({ registryLine: e.target.value })}>
              <option value="">All lines</option>
              {workspaceModel.lines
                .filter((l) => !l.archived || query.state !== "active")
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={query.kind}
              onChange={(e) => change({ kind: e.target.value as RegistryQuery["kind"] })}
            >
              {["all", ...assetKinds].map((k) => (
                <option key={k} value={k}>
                  {k === "all" ? "All types" : k}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lifecycle
            <select
              value={query.state}
              onChange={(e) => change({ state: e.target.value as RegistryQuery["state"] })}
            >
              <option value="active">Active records</option>
              <option value="archived">Archived</option>
              <option value="all">All states</option>
            </select>
          </label>
          <label>
            Sort
            <select
              value={query.sort}
              onChange={(e) => change({ sort: e.target.value as RegistryQuery["sort"] })}
            >
              <option value="name">Name</option>
              <option value="id">Identifier</option>
              <option value="kind">Type</option>
            </select>
          </label>
          <label>
            Order
            <select
              value={query.direction}
              onChange={(e) => change({ direction: e.target.value as RegistryQuery["direction"] })}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
        <RefTabs
          items={["Table", "Tree", "Station relationships", "History", "Reports & export"]}
          value={view}
          onChange={(next) => next === "Reports & export" ? change({ view: "reports", report: "inventory" }) : setView(next)}
        />
        {view === "History" ? (
          <WorkspaceHistory />
        ) : error ? (
          <p role="alert">
            {error}{" "}
            <Button
              variant="outline"
              onClick={() => {
                if (loadState === "error") void reload();
                else setRetry((v) => v + 1);
              }}
            >
              Retry
            </Button>
          </p>
        ) : !result ? (
          <p role="status" className="ref-empty">
            Loading factory assets…
          </p>
        ) : result.total === 0 ? (
          <div className="ref-empty">
            <p>No assets match these filters.</p>
            <Button
              variant="outline"
              onClick={() => {
                setDraftQuery("");
                change({ registryLine: "", q: "", kind: "all", state: "all" });
              }}
            >
              Clear filters
            </Button>{" "}
            <Button variant="outline" asChild>
              <Link to="/lines" search={(p) => ({ ...p })}>
                Configure lines
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {view === "Table" ? (
              <RefTable
                headers={["Asset", "Identifier", "Type", "Line / station", "State"]}
                rows={result.rows.map((r) => [
                  r.name,
                  r.id,
                  r.category || r.kind,
                  [r.line, r.station].filter(Boolean).join(" / ") || "Unassigned",
                  r.archived ? "Archived" : "Active",
                ])}
                selected={row ? result.rows.indexOf(row) : -1}
                onSelect={(i) => {
                  const item = result.rows[i];
                  if (item) pick(item);
                }}
              />
            ) : (
              <div className="divide-y divide-border">
                {[...groups].map(([path, items]) => (
                  <details open key={path} className="py-2">
                    <summary className="cursor-pointer font-medium">{path}</summary>
                    <ul className="ml-4 border-l border-border pl-3">
                      {items.map((item) => (
                        <li key={item.key}>
                          <Button
                            variant={row?.key === item.key ? "secondary" : "ghost"}
                            aria-pressed={row?.key === item.key}
                            onClick={() => pick(item)}
                          >
                            <Box size={14} />
                            {item.name} · {item.id}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
              <span role="status">
                {(result.page - 1) * query.size + 1}–
                {Math.min(result.page * query.size, result.total)} of {result.total} matching assets
              </span>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Assets per page"
                  value={query.size}
                  onChange={(e) =>
                    change({ size: Number(e.target.value) as RegistryQuery["size"] })
                  }
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option value={n} key={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous asset page"
                  disabled={result.page <= 1}
                  onClick={() => change({ page: result.page - 1 })}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next asset page"
                  disabled={result.page >= result.pages}
                  onClick={() => change({ page: result.page + 1 })}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )}
      </Surface>
      {row && view !== "History" && <RegistryInspector row={row} />}
      {result && search.engAsset && !row && (
        <Notice>
          That asset is outside this page or its current filters. Search its identifier to locate
          it.
        </Notice>
      )}
    </ReferencePage>
  );
}
function RegistryInspector({ row }: { row: RegistryRow }) {
  const { workspaceModel, revision } = useEngineering();
  const record = workspaceModel.records.find((r) => r.id === row.id && r.kind === row.kind);
  const context = { engLine: row.line, engStation: row.station };
  return (
    <Surface
      title={row.name}
      sub={row.id + " · " + row.kind}
      actions={record && !row.archived ? <RecordActions record={record} /> : undefined}
    >
      <KeyValues
        items={[
          ["Parent", row.parent || "Unassigned"],
          [
            "Record revision",
            row.version || (revision ? "Workspace r" + revision : "Working draft"),
          ],
          ["Process use", row.uses.join(", ") || "No direct operation references"],
          ["Identifiers", row.identifiers.join(", ") || "No crosswalk or serial recorded"],
        ]}
      />
      {record && !row.archived && placedHardware(record) && (
        <HardwareAssignment key={row.key} record={record} />
      )}
      {!row.archived && (
        <div className="ref-actions">
          {row.kind === "line" && (
            <Button variant="outline" asChild>
              <Link
                to="/lines/$lineId"
                params={{ lineId: row.id }}
                search={(p) => ({ ...p, ...context })}
              >
                Open line
              </Link>
            </Button>
          )}
          {row.station && (
            <Button variant="outline" asChild>
              <Link
                to="/stations/$stationId"
                params={{ stationId: row.station }}
                search={(p) => ({ ...p, ...context })}
              >
                Station profile
              </Link>
            </Button>
          )}
          {(row.kind === "line" ||
            row.kind === "station" ||
            row.kind === "equipment" ||
            row.kind === "terminal") && (
            <Button variant="outline" asChild>
              <Link
                to="/factory-layout"
                search={(p) => ({
                  ...p,
                  ...context,
                  line: row.line,
                  station: row.station,
                  asset: row.kind === "equipment" || row.kind === "terminal" ? row.id : undefined,
                  assetKind:
                    row.kind === "equipment" || row.kind === "terminal" ? row.kind : undefined,
                })}
              >
                Locate in layout
              </Link>
            </Button>
          )}
        </div>
      )}
    </Surface>
  );
}
