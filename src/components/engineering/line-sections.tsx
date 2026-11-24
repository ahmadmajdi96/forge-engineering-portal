import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProcessRoute } from "@/lib/production/process";

export function LineSections({
  route,
  change,
  visit,
  readOnly,
}: {
  readOnly: boolean;
  route: ProcessRoute;
  change: (patch: Partial<ProcessRoute>) => void;
  visit: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const sections = route.sections ?? [];
  return (
    <section className="eng-panel space-y-3" aria-label="Line sections">
      <h2 className="text-lg font-semibold">Line sections</h2>
      {!readOnly && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (readOnly || !name.trim() || sections.length >= 100) return;
            change({ sections: [...sections, { id: crypto.randomUUID(), name: name.trim() }] });
            setName("");
          }}
        >
          <label className="engineering-picker-field">
            New section name
            <input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
          </label>
          <Button disabled={!name.trim() || sections.length >= 100}>Add section</Button>
        </form>
      )}
      {[...sections, { id: "", name: "Unassigned steps" }].map((section) => {
        const steps = route.steps.filter((step) => (step.sectionId ?? "") === section.id);
        if (!section.id && !steps.length) return null;
        return (
          <div key={section.id} className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              {section.id && !readOnly ? (
                <input
                  aria-label={`Rename ${section.name}`}
                  className="min-w-0 flex-1 rounded border bg-background px-2 py-1"
                  maxLength={160}
                  value={section.name}
                  onChange={(e) =>
                    change({
                      sections: sections.map((s) =>
                        s.id === section.id ? { ...s, name: e.target.value } : s,
                      ),
                    })
                  }
                />
              ) : (
                <strong>{section.name}</strong>
              )}
              <span>{steps.length} steps</span>
              {section.id && !readOnly && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!steps.length}
                  title="Move assigned steps before removing this section"
                  onClick={() => change({ sections: sections.filter((s) => s.id !== section.id) })}
                >
                  Remove section
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {steps.map((step) => (
                <Button key={step.id} variant="link" onClick={() => visit(step.id)}>
                  {step.name}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
