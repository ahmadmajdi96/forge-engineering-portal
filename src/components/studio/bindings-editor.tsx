import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudioDefinition, StudioSignal, StudioVariable } from "@/lib/studio/model";
import { editorInput, Field, NumberField } from "./editor-fields";

type Change = (app: StudioDefinition) => void;
type Media = StudioDefinition["media"][number];
type Dependency = StudioDefinition["dependencies"][number];

export function StudioBindingsEditor({ app, setApp }: { app: StudioDefinition; setApp: Change }) {
  function updateIDs(field: "capabilities" | "connectorIds" | "evidenceIds", value: string) {
    const list = value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const previous = app[field];
    if (list.length !== previous.length || list.some((item, index) => item !== previous[index])) {
      setApp({ ...app, [field]: list });
    }
  }
  function writeVariable(next: StudioVariable) {
    setApp({ ...app, variables: app.variables.map((item) => (item.id === next.id ? next : item)) });
  }
  function writeSignal(next: StudioSignal) {
    setApp({ ...app, signals: app.signals.map((item) => (item.id === next.id ? next : item)) });
  }
  function writeMedia(next: Media) {
    setApp({ ...app, media: app.media.map((item) => (item.id === next.id ? next : item)) });
  }
  function writeDependency(index: number, next: Dependency) {
    setApp({
      ...app,
      dependencies: app.dependencies.map((item, position) => (position === index ? next : item)),
    });
  }
  return (
    <div className="grid gap-3">
      <section className="eng-panel grid gap-3">
        <h3 className="text-sm font-semibold">Runtime requirements</h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Theme">
            <select
              className={editorInput}
              value={app.theme}
              onChange={(event) =>
                setApp({ ...app, theme: event.target.value as StudioDefinition["theme"] })
              }
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>
          <Field label="Offline policy">
            <select
              className={editorInput}
              value={app.offlinePolicy}
              onChange={(event) =>
                setApp({
                  ...app,
                  offlinePolicy: event.target.value as StudioDefinition["offlinePolicy"],
                })
              }
            >
              <option value="online-required">Require online access</option>
              <option value="read-only-offline">Read-only offline</option>
              <option value="bounded-offline">Bounded offline with verified edge grant</option>
            </select>
          </Field>
          <Field label="Required capabilities" hint="Match approved device capability keys.">
            <input
              className={editorInput}
              key={app.capabilities.join(",")}
              defaultValue={app.capabilities.join(", ")}
              onBlur={(event) => updateIDs("capabilities", event.target.value)}
            />
          </Field>
          <Field label="Connector IDs" hint="Requests require an allowlisted runtime adapter.">
            <input
              className={editorInput}
              key={app.connectorIds.join(",")}
              defaultValue={app.connectorIds.join(", ")}
              onBlur={(event) => updateIDs("connectorIds", event.target.value)}
            />
          </Field>
          <Field label="Evidence IDs" hint="Use comma-separated stable identifiers.">
            <input
              className={editorInput}
              key={app.evidenceIds.join(",")}
              defaultValue={app.evidenceIds.join(", ")}
              onBlur={(event) => updateIDs("evidenceIds", event.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="eng-panel grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Variables</h3>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={app.variables.length >= 100}
            onClick={() =>
              setApp({
                ...app,
                variables: [
                  ...app.variables,
                  {
                    id: crypto.randomUUID(),
                    name: "New variable",
                    type: "text",
                    scope: "run",
                    initial: null,
                    unit: "",
                    minimum: null,
                    maximum: null,
                  },
                ],
              })
            }
          >
            <Plus />
            Add variable
          </Button>
        </div>
        {app.variables.map((variable) => (
          <div
            key={variable.id}
            className="grid items-end gap-2 rounded border border-border p-2 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Field label="Variable name">
              <input
                className={editorInput}
                value={variable.name}
                maxLength={120}
                onChange={(event) => writeVariable({ ...variable, name: event.target.value })}
              />
            </Field>
            <Field label="Data type">
              <select
                className={editorInput}
                value={variable.type}
                onChange={(event) =>
                  writeVariable({
                    ...variable,
                    type: event.target.value as StudioVariable["type"],
                    initial: null,
                    unit: "",
                    minimum: null,
                    maximum: null,
                  })
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
              </select>
            </Field>
            <Field label="Scope">
              <select
                className={editorInput}
                value={variable.scope}
                onChange={(event) =>
                  writeVariable({
                    ...variable,
                    scope: event.target.value as StudioVariable["scope"],
                  })
                }
              >
                <option value="run">Run</option>
                <option value="step">Step</option>
              </select>
            </Field>
            {variable.type === "number" && (
              <>
                <Field label="Unit">
                  <input
                    className={editorInput}
                    value={variable.unit}
                    maxLength={24}
                    onChange={(event) => writeVariable({ ...variable, unit: event.target.value })}
                  />
                </Field>
                <NumberField
                  label="Minimum"
                  value={variable.minimum}
                  onChange={(minimum) => writeVariable({ ...variable, minimum })}
                />
                <NumberField
                  label="Maximum"
                  value={variable.maximum}
                  onChange={(maximum) => writeVariable({ ...variable, maximum })}
                />
                <NumberField
                  label="Default value"
                  value={typeof variable.initial === "number" ? variable.initial : null}
                  onChange={(initial) => writeVariable({ ...variable, initial })}
                />
              </>
            )}
            {variable.type === "text" && (
              <Field label="Default value">
                <input
                  className={editorInput}
                  value={typeof variable.initial === "string" ? variable.initial : ""}
                  onChange={(event) =>
                    writeVariable({ ...variable, initial: event.target.value || null })
                  }
                  maxLength={2048}
                />
              </Field>
            )}
            {variable.type === "boolean" && (
              <Field label="Default value">
                <select
                  className={editorInput}
                  value={variable.initial === null ? "" : String(variable.initial)}
                  onChange={(event) =>
                    writeVariable({
                      ...variable,
                      initial: event.target.value ? event.target.value === "true" : null,
                    })
                  }
                >
                  <option value="">Unset</option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </Field>
            )}
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                setApp({
                  ...app,
                  variables: app.variables.filter((item) => item.id !== variable.id),
                })
              }
            >
              <Trash2 />
              Remove variable
            </Button>
          </div>
        ))}
      </section>
      <section className="eng-panel grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Semantic signals</h3>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={app.signals.length >= 100}
            onClick={() =>
              setApp({
                ...app,
                signals: [
                  ...app.signals,
                  {
                    id: crypto.randomUUID(),
                    name: "New signal",
                    type: "boolean",
                    unit: "",
                    freshnessMs: 5000,
                  },
                ],
              })
            }
          >
            <Plus />
            Add signal
          </Button>
        </div>
        {app.signals.map((signal) => (
          <div
            key={signal.id}
            className="grid items-end gap-2 rounded border border-border p-2 sm:grid-cols-2 xl:grid-cols-5"
          >
            <Field label="Signal name">
              <input
                className={editorInput}
                value={signal.name}
                maxLength={120}
                onChange={(event) => writeSignal({ ...signal, name: event.target.value })}
              />
            </Field>
            <Field label="Data type">
              <select
                className={editorInput}
                value={signal.type}
                onChange={(event) =>
                  writeSignal({
                    ...signal,
                    type: event.target.value as StudioSignal["type"],
                    unit: "",
                  })
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
              </select>
            </Field>
            {signal.type === "number" && (
              <Field label="Unit">
                <input
                  className={editorInput}
                  value={signal.unit}
                  maxLength={24}
                  onChange={(event) => writeSignal({ ...signal, unit: event.target.value })}
                />
              </Field>
            )}
            <NumberField
              label="Fresh for (milliseconds)"
              value={signal.freshnessMs}
              min={1}
              max={600000}
              step={1}
              onChange={(freshnessMs) => {
                if (freshnessMs !== null) writeSignal({ ...signal, freshnessMs });
              }}
            />
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                setApp({ ...app, signals: app.signals.filter((item) => item.id !== signal.id) })
              }
            >
              <Trash2 />
              Remove signal
            </Button>
          </div>
        ))}
      </section>
      <section className="eng-panel grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Media artifacts</h3>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={app.media.length >= 50}
            onClick={() =>
              setApp({
                ...app,
                media: [
                  ...app.media,
                  {
                    id: crypto.randomUUID(),
                    name: "New media",
                    mediaType: "image/png",
                    artifactId: "",
                    sha256: "",
                    alt: "",
                  },
                ],
              })
            }
          >
            <Plus />
            Add artifact reference
          </Button>
        </div>
        {app.media.map((media) => (
          <div
            key={media.id}
            className="grid items-end gap-2 rounded border border-border p-2 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Field label="Media name">
              <input
                className={editorInput}
                value={media.name}
                maxLength={120}
                onChange={(event) => writeMedia({ ...media, name: event.target.value })}
              />
            </Field>
            <Field label="Alternative text">
              <input
                className={editorInput}
                value={media.alt}
                maxLength={120}
                onChange={(event) => writeMedia({ ...media, alt: event.target.value })}
              />
            </Field>
            <Field label="Artifact ID">
              <input
                className={editorInput}
                value={media.artifactId}
                maxLength={96}
                onChange={(event) => writeMedia({ ...media, artifactId: event.target.value })}
              />
            </Field>
            <Field label="SHA-256">
              <input
                className={editorInput}
                value={media.sha256}
                maxLength={64}
                onChange={(event) => writeMedia({ ...media, sha256: event.target.value })}
              />
            </Field>
            <Field label="File type">
              <select
                className={editorInput}
                value={media.mediaType}
                onChange={(event) =>
                  writeMedia({ ...media, mediaType: event.target.value as Media["mediaType"] })
                }
              >
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </Field>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                setApp({ ...app, media: app.media.filter((item) => item.id !== media.id) })
              }
            >
              <Trash2 />
              Remove artifact
            </Button>
          </div>
        ))}
      </section>
      <section className="eng-panel grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Pinned dependencies</h3>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={app.dependencies.length >= 100}
            onClick={() =>
              setApp({
                ...app,
                dependencies: [...app.dependencies, { system: "PLMS", id: "", revision: "" }],
              })
            }
          >
            <Plus />
            Add dependency
          </Button>
        </div>
        {app.dependencies.map((dependency, index) => (
          <div
            key={index}
            className="grid items-end gap-2 rounded border border-border p-2 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Field label="System">
              <select
                className={editorInput}
                value={dependency.system}
                onChange={(event) =>
                  writeDependency(index, {
                    ...dependency,
                    system: event.target.value as Dependency["system"],
                  })
                }
              >
                <option>PLMS</option>
                <option>RMS</option>
                <option>QMS</option>
                <option>EMS</option>
              </select>
            </Field>
            <Field label="Record ID">
              <input
                className={editorInput}
                value={dependency.id}
                maxLength={96}
                onChange={(event) =>
                  writeDependency(index, { ...dependency, id: event.target.value })
                }
              />
            </Field>
            <Field label="Exact revision">
              <input
                className={editorInput}
                value={dependency.revision}
                maxLength={96}
                onChange={(event) =>
                  writeDependency(index, { ...dependency, revision: event.target.value })
                }
              />
            </Field>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                setApp({
                  ...app,
                  dependencies: app.dependencies.filter((_, position) => index !== position),
                })
              }
            >
              <Trash2 />
              Remove dependency
            </Button>
          </div>
        ))}
      </section>
    </div>
  );
}
