import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useEngineering } from "@/lib/engineering/context";
import type { DesignRecord } from "@/lib/engineering/design-records";
import { Surface, RefTable } from "./reference-ui";
import { useRecords } from "./record-editor";
export function BufferRules() {
  const { model, lineId } = useEngineering();
  const { rows, put, remove } = useRecords("buffer");
  const [draft, setDraft] = useState<DesignRecord | null>(null),
    [archive, setArchive] = useState<DesignRecord | null>(null),
    [error, setError] = useState("");
  const name = (id: string) =>
    model.stations.find((s) => s.id === id)?.name ?? (id ? `${id} · unresolved` : "Unassigned");
  const create = () => {
    setError("");
    setDraft({
      id: "BUF-" + crypto.randomUUID(),
      kind: "buffer",
      name: "",
      version: "r1",
      parent: "",
      binding: "",
      value: "",
      unit: "",
      description: "",
      required: false,
      archived: false,
    });
  };
  return (
    <Surface
      title="Buffer rules"
      actions={
        <Button variant="outline" onClick={create} disabled={model.stations.length < 2}>
          Add buffer
        </Button>
      }
    >
      {rows.length ? (
        <RefTable
          headers={["Buffer", "Upstream", "Downstream", "Capacity", "Rule", "Actions"]}
          rows={rows.map((r) => [
            r.name,
            name(r.parent),
            name(r.binding),
            r.value ? `${r.value} ${r.unit}` : "Unspecified",
            r.description || "Unspecified",
            <div className="flex flex-wrap gap-1" key={r.id}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setError("");
                  setDraft(r);
                }}
              >
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setArchive(r)}>
                Archive
              </Button>
            </div>,
          ])}
        />
      ) : (
        <p className="ref-empty">
          {model.stations.length < 2
            ? "Add two stations to define a buffer between stages."
            : "No buffer rules defined for this line."}
        </p>
      )}
      {draft && (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setDraft(null);
          }}
        >
          <DialogContent className="max-h-[88dvh] overflow-y-auto">
            <DialogTitle>Buffer definition</DialogTitle>
            <DialogDescription>
              {lineId} · {draft.id}
            </DialogDescription>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  ![draft.parent, draft.binding].every((id) =>
                    model.stations.some((s) => s.id === id),
                  ) ||
                  draft.parent === draft.binding
                ) {
                  setError("Select two different stations on this line.");
                  return;
                }
                if (put({ ...draft, name: draft.name.trim() })) setDraft(null);
              }}
            >
              <div className="asset-step-fields engineering-dialog-fields">
                <label className="span-two">
                  Name
                  <input
                    required
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                {(["parent", "binding"] as const).map((k) => (
                  <label key={k}>
                    {k === "parent" ? "Upstream station" : "Downstream station"}
                    <select
                      required
                      value={draft[k]}
                      onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    >
                      <option value="">Choose station</option>
                      {model.stations.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          disabled={s.id === draft[k === "parent" ? "binding" : "parent"]}
                        >
                          {s.name} · {s.id}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label>
                  Configured capacity
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  />
                </label>
                <label>
                  Capacity unit
                  <input
                    required={!!draft.value}
                    maxLength={32}
                    value={draft.unit}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  />
                </label>
                <label className="span-two">
                  Buffer rule
                  <input
                    list="buffer-rules"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                  <datalist id="buffer-rules">
                    <option>FIFO</option>
                    <option>LIFO</option>
                    <option>Kanban</option>
                  </datalist>
                </label>
              </div>
              {error && <p role="alert">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit">Apply to draft</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {archive && (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setArchive(null);
          }}
        >
          <DialogContent>
            <DialogTitle>Archive {archive.name}?</DialogTitle>
            <DialogDescription>
              Remove the buffer between {name(archive.parent)} and {name(archive.binding)} from the
              active draft. Its previous revisions stay available.
            </DialogDescription>
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchive(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  remove(archive.id);
                  setArchive(null);
                }}
              >
                Archive in draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Surface>
  );
}
