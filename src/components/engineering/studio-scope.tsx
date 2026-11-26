import { Fragment, useState, type ReactNode } from "react";
import { ScopeSelectors } from "./reference-ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import type { DesignRecord } from "@/lib/engineering/design-records";

type Kind = "app" | "operator" | "hmi";

export function StudioScope({
  kind,
  children,
}: {
  kind: Kind;
  children: (record: DesignRecord, selector: ReactNode) => ReactNode;
}) {
  const { model, setModel, lineId, selected: station } = useEngineering();
  const sourceApp = useRouterState({
    select: (r) => new URLSearchParams(r.location.searchStr).get("app"),
  });
  const [parentApp, setParentApp] = useState("");
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const records = model.records.filter((r) => !r.archived);
  const appliesToLine = (record: DesignRecord) =>
    record.parent === lineId || model.stations.some((station) => station.id === record.parent);
  const apps = records.filter((r) => r.kind === "app" && appliesToLine(r));
  const owner = apps.find((r) => r.id === (parentApp || sourceApp)) ?? apps[0];
  const options = records.filter((r) =>
    kind === "app"
      ? apps.includes(r)
      : r.kind === "screen" &&
        (r.screenKind ?? "operator") === kind &&
        (kind === "hmi"
          ? appliesToLine(r)
          : r.parent === owner?.id || (!owner && r.parent === lineId)),
  );
  // Older saved documents contain this display's widgets without a screen record.
  if (
    kind === "hmi" &&
    model.stations.some((s) => s.id === "ST-102") &&
    !model.records.some((r) => r.id === "HMI-M1") &&
    records.some((r) => r.kind === "widget" && r.parent === "HMI-M1")
  )
    options.push({
      id: "HMI-M1",
      name: "Mixing Vessel M1",
      version: "v1.8",
      kind: "screen",
      screenKind: "hmi",
      diagram: "mixing-vessel",
      parent: "ST-102",
      description: "",
      unit: "",
      binding: "",
      value: "",
      required: false,
      archived: false,
    });
  const current = options.find((r) => r.id === chosen) ?? options[0];
  const label = kind === "app" ? "Application" : kind === "hmi" ? "HMI display" : "Operator screen";
  const selector = (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <ScopeSelectors />
      {kind === "operator" && (
        <label className="grid gap-1 text-sm">
          Parent application
          <select required value={owner?.id ?? ""} onChange={(e) => setParentApp(e.target.value)}>
            {!apps.length && <option value="">Create an application first</option>}
            {apps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!!options.length && (
        <label className="grid gap-1 text-sm">
          {label}
          <select
            aria-label={label}
            className="min-h-10 rounded-md border bg-card px-3"
            value={current?.id}
            onChange={(event) => setChosen(event.target.value)}
          >
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.version}
              </option>
            ))}
          </select>
        </label>
      )}
      {adding ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            const id = crypto.randomUUID();
            const next: DesignRecord = {
              id,
              kind: kind === "app" ? "app" : "screen",
              name: name.trim(),
              parent: kind === "app" ? lineId : kind === "hmi" ? station : (owner?.id ?? lineId),
              version: "r1",
              description: "",
              binding: "",
              value: "",
              unit: "",
              required: false,
              archived: false,
              ...(kind === "app" ? {} : { screenKind: kind }),
            };
            setModel({ ...model, records: [...model.records, next] });
            setChosen(id);
            setAdding(false);
            setName("");
          }}
        >
          <label className="grid gap-1 text-sm">
            {label} name
            <input
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            type="submit"
            disabled={(kind === "operator" && !owner) || (kind === "hmi" && !station)}
          >
            Create
          </Button>
          <Button variant="ghost" type="button" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          New {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
  if (!model.lines.some((line) => !line.archived))
    return (
      <section className="reference-page">
        <h1>{label} editor</h1>
        <p>Create a production line before adding a design.</p>
        <Button asChild>
          <Link to="/lines">Open production lines</Link>
        </Button>
      </section>
    );
  return current ? (
    <Fragment key={current.id}>{children(current, selector)}</Fragment>
  ) : (
    <section className="reference-page">
      <h1>{label} editor</h1>
      {selector}
    </section>
  );
}
