import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Grip, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  inputTypes,
  makeWidget,
  variantColumns,
  variantPixels,
  variants,
  widgetKinds,
  widgetLabels,
  type StudioDefinition,
  type StudioScreen,
  type StudioWidget,
  type Variant,
  type WidgetRect,
} from "@/lib/studio/model";
import { ScreenGrid, StudioWidgetView } from "./application-player";
import { editorInput, Field, NumberField } from "./editor-fields";

const variantNames: Record<Variant, string> = {
  panel: "Panel landscape",
  tablet: "Tablet landscape",
  portrait: "Portrait",
};

export function VariantSelect({
  variant,
  setVariant,
}: {
  variant: Variant;
  setVariant: (variant: Variant) => void;
}) {
  return (
    <Field label="Display variant">
      <select
        className={editorInput}
        value={variant}
        onChange={(event) => setVariant(event.target.value as Variant)}
      >
        {variants.map((variant) => (
          <option value={variant} key={variant}>
            {variantNames[variant]}
          </option>
        ))}
      </select>
    </Field>
  );
}

function limitBounds(bounds: WidgetRect, variant: Variant): WidgetRect {
  const columns = variantColumns[variant];
  const column = Math.max(1, Math.min(columns, Math.round(bounds.column)));
  const row = Math.max(1, Math.min(96, Math.round(bounds.row)));
  return {
    column,
    row,
    width: Math.max(1, Math.min(columns - column + 1, Math.round(bounds.width))),
    height: Math.max(1, Math.min(97 - row, 24, Math.round(bounds.height))),
  };
}

function appendWidget(screen: StudioScreen, next: StudioWidget) {
  const layouts = { ...next.layouts };
  for (const variant of variants) {
    const row = Math.max(
      1,
      ...screen.widgets.map(
        (widget) => widget.layouts[variant].row + widget.layouts[variant].height,
      ),
    );
    layouts[variant] = limitBounds({ ...layouts[variant], row }, variant);
  }
  return { ...next, layouts };
}

export function StudioScreenEditor({
  app,
  setApp,
  variant,
  setVariant,
}: {
  app: StudioDefinition;
  setApp: (app: StudioDefinition) => void;
  variant: Variant;
  setVariant: (variant: Variant) => void;
}) {
  const [screenId, setScreenId] = useState(app.screens[0]?.id ?? "");
  const [widgetId, setWidgetId] = useState("");
  const [palette, setPalette] = useState<string>("instruction");
  const [resizing, setResizing] = useState<WidgetRect | null>(null);
  const resizeGesture = useRef<{
    x: number;
    y: number;
    colWidth: number;
    rowHeight: number;
    initial: WidgetRect;
    next: WidgetRect;
  } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const screen = app.screens.find((item) => item.id === screenId) ?? app.screens[0];
  const widget = screen?.widgets.find((item) => item.id === widgetId);
  const selectScreen = (id: string) => {
    setScreenId(id);
    setWidgetId("");
    setResizing(null);
  };
  const writeScreen = (updated: StudioScreen) =>
    setApp({
      ...app,
      screens: app.screens.map((item) => (item.id === updated.id ? updated : item)),
    });
  const writeWidget = (updated: StudioWidget) => {
    if (screen)
      writeScreen({
        ...screen,
        widgets: screen.widgets.map((item) => (item.id === updated.id ? updated : item)),
      });
  };
  const writeBounds = (widget: StudioWidget, bounds: WidgetRect) => {
    writeWidget({
      ...widget,
      layouts: { ...widget.layouts, [variant]: limitBounds(bounds, variant) },
    });
  };
  const addScreen = () => {
    const next = { id: crypto.randomUUID(), name: `Screen ${app.screens.length + 1}`, widgets: [] };
    setApp({ ...app, screens: [...app.screens, next] });
    selectScreen(next.id);
  };
  const addWidget = () => {
    if (!screen) return;
    const base = widgetKinds.find((candidate) => candidate === palette);
    const preset = app.components.find((candidate) => `template/${candidate.id}` === palette);
    if (!base && !preset) return;
    const seed = makeWidget(crypto.randomUUID(), base ?? preset!.widget.kind, 1);
    const next = appendWidget(screen, preset ? { ...seed, ...preset.widget } : seed);
    writeScreen({ ...screen, widgets: [...screen.widgets, next] });
    setWidgetId(next.id);
  };
  const dimensions = () => {
    const sheet = grid.current?.querySelector<HTMLElement>("[data-studio-grid]");
    if (!sheet) return null;
    const computed = window.getComputedStyle(sheet);
    const box = sheet.getBoundingClientRect();
    const templateRows = computed.gridTemplateRows.split(" ");
    const track = Number.parseFloat(templateRows[0] ?? "");
    const rowHeight = Number.isFinite(track) && track > 0 ? track + 8 : 50;
    return { box, colWidth: (box.width - 8) / variantColumns[variant], rowHeight, templateRows };
  };
  const drop = (event: DragEvent) => {
    if (!dragId.current) return;
    event.preventDefault();
    const current = screen?.widgets.find((candidate) => candidate.id === dragId.current);
    const metrics = dimensions();
    if (!current || !metrics) return;
    const offset = event.clientY - metrics.box.top - 8;
    let row = 1;
    let remaining = offset;
    for (const track of metrics.templateRows) {
      const height = Number.parseFloat(track) + 8;
      if (!Number.isFinite(height) || remaining < height) break;
      remaining -= height;
      row++;
    }
    const tracked = metrics.templateRows.filter((track) =>
      Number.isFinite(Number.parseFloat(track)),
    ).length;
    if (row > tracked) row += Math.floor(Math.max(0, remaining) / metrics.rowHeight);
    writeBounds(current, {
      ...current.layouts[variant],
      row,
      column: Math.floor((event.clientX - metrics.box.left - 8) / metrics.colWidth) + 1,
    });
    dragId.current = null;
  };
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>, item: StudioWidget) => {
    const metrics = dimensions();
    if (!metrics) return;
    event.preventDefault();
    const initial = item.layouts[variant];
    resizeGesture.current = {
      x: event.clientX,
      y: event.clientY,
      colWidth: metrics.colWidth,
      rowHeight: metrics.rowHeight,
      initial,
      next: initial,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = resizeGesture.current;
    if (!gesture) return;
    gesture.next = limitBounds(
      {
        ...gesture.initial,
        width: gesture.initial.width + Math.round((event.clientX - gesture.x) / gesture.colWidth),
        height:
          gesture.initial.height + Math.round((event.clientY - gesture.y) / gesture.rowHeight),
      },
      variant,
    );
    setResizing(gesture.next);
  };
  const endResize = (item: StudioWidget, keep: boolean) => {
    const gesture = resizeGesture.current;
    resizeGesture.current = null;
    setResizing(null);
    if (
      gesture &&
      keep &&
      (gesture.next.width !== gesture.initial.width ||
        gesture.next.height !== gesture.initial.height)
    ) {
      writeBounds(item, gesture.next);
    }
  };
  const shaped =
    widget && resizing && screen
      ? {
          ...screen,
          widgets: screen.widgets.map((item) =>
            item.id === widget.id
              ? { ...item, layouts: { ...item.layouts, [variant]: resizing } }
              : item,
          ),
        }
      : screen;

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[11rem_minmax(0,1fr)_14rem]">
      <section className="eng-panel grid content-start gap-3" aria-label="Screens and components">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Screens</h3>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={addScreen}
            disabled={app.screens.length >= 30}
          >
            <Plus />
            Add screen
          </Button>
        </div>
        <ul className="grid gap-1">
          {app.screens.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === screen?.id}
                className="w-full break-words rounded-md border border-transparent p-2 text-left text-sm hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10"
                onClick={() => selectScreen(item.id)}
              >
                {item.name || "Unnamed screen"}
              </button>
            </li>
          ))}
        </ul>
        {screen && (
          <>
            <Field label="Component palette">
              <select
                className={editorInput}
                value={palette}
                onChange={(event) => setPalette(event.target.value)}
              >
                {widgetKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {widgetLabels[kind]}
                  </option>
                ))}
                {app.components.length > 0 && (
                  <optgroup label="Application templates">
                    {app.components.map((preset) => (
                      <option key={preset.id} value={`template/${preset.id}`}>
                        {preset.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={addWidget}
              disabled={screen.widgets.length >= 100}
            >
              <Plus />
              Add component
            </Button>
            <h3 className="mt-1 text-sm font-semibold">Component tree</h3>
            <ul className="grid gap-1">
              {screen.widgets.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={item.id === widget?.id}
                    onClick={() => setWidgetId(item.id)}
                    className="w-full break-words rounded-md border border-transparent p-2 text-left text-xs hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10"
                  >
                    {item.title || widgetLabels[item.kind]}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="eng-panel grid min-w-0 content-start gap-3" aria-label="Screen canvas">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Screen canvas</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Drag to place. Use the properties to place or resize with the keyboard.
            </p>
          </div>
          <VariantSelect variant={variant} setVariant={setVariant} />
        </div>
        {shaped && (
          <div className="min-w-0 overflow-x-auto">
            <div
              ref={grid}
              style={{
                maxWidth: variantPixels[variant],
                minWidth: Math.min(360, variantPixels[variant]),
              }}
              onDragOver={(event) => {
                if (dragId.current) event.preventDefault();
              }}
              onDrop={drop}
            >
              <ScreenGrid screen={shaped} variant={variant} editor>
                {(item) => (
                  <div
                    className={`relative flex h-full min-w-0 flex-col rounded-md border ${item.id === widgetId ? "border-primary" : "border-transparent"}`}
                  >
                    <button
                      draggable
                      type="button"
                      aria-label={`Select or move ${item.title}`}
                      aria-pressed={item.id === widgetId}
                      className="flex min-h-8 w-full cursor-grab items-center gap-1 rounded-t bg-muted px-2 text-left text-xs font-medium"
                      onClick={() => setWidgetId(item.id)}
                      onDragStart={(event) => {
                        dragId.current = item.id;
                        setWidgetId(item.id);
                        event.dataTransfer.setData("text/plain", item.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        dragId.current = null;
                      }}
                    >
                      <Grip size={12} className="shrink-0" />
                      <span className="truncate">{item.title || widgetLabels[item.kind]}</span>
                    </button>
                    <StudioWidgetView
                      item={item}
                      app={app}
                      run={null}
                      now={0}
                      disabled
                      onEvent={() => {}}
                      onInput={() => {}}
                    />
                    {item.id === widgetId && (
                      <button
                        type="button"
                        aria-label={`Resize ${item.title}`}
                        title="Drag to resize the grid area"
                        className="absolute bottom-0 right-0 grid size-6 touch-none cursor-nwse-resize place-items-center rounded bg-primary text-primary-foreground"
                        onPointerDown={(event) => beginResize(event, item)}
                        onPointerMove={dragResize}
                        onPointerUp={() => endResize(item, true)}
                        onPointerCancel={() => endResize(item, false)}
                        onKeyDown={(event) => {
                          const change = {
                            ArrowLeft: [-1, 0],
                            ArrowRight: [1, 0],
                            ArrowUp: [0, -1],
                            ArrowDown: [0, 1],
                          }[event.key];
                          if (!change) return;
                          event.preventDefault();
                          const bounds = item.layouts[variant];
                          writeBounds(item, {
                            ...bounds,
                            width: bounds.width + change[0]!,
                            height: bounds.height + change[1]!,
                          });
                        }}
                      >
                        <span aria-hidden="true">↘</span>
                      </button>
                    )}
                  </div>
                )}
              </ScreenGrid>
            </div>
          </div>
        )}
        {!shaped && (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Add a screen to start authoring.
          </p>
        )}
      </section>
      <section
        className="eng-panel grid content-start gap-3 lg:col-span-2 xl:col-span-1"
        aria-label="Screen properties"
      >
        <h3 className="text-sm font-semibold">Properties</h3>
        {screen && (
          <>
            <Field label="Screen name">
              <input
                className={editorInput}
                value={screen.name}
                onChange={(event) => writeScreen({ ...screen, name: event.target.value })}
                maxLength={120}
              />
            </Field>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setApp({ ...app, screens: app.screens.filter((item) => item.id !== screen.id) });
                selectScreen("");
              }}
            >
              <Trash2 />
              Remove screen
            </Button>
          </>
        )}
        {widget && screen && (
          <>
            <WidgetProperties app={app} widget={widget} change={writeWidget} />
            <div className="grid grid-cols-2 gap-2">
              {(["column", "row", "width", "height"] as const).map((field) => (
                <NumberField
                  key={field}
                  label={field[0]!.toUpperCase() + field.slice(1)}
                  min={1}
                  step={1}
                  value={widget.layouts[variant][field]}
                  onChange={(next) => {
                    if (next !== null)
                      writeBounds(widget, { ...widget.layouts[variant], [field]: next });
                  }}
                />
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={app.components.length >= 100}
              onClick={() => {
                const { id: _id, layouts: _layouts, ...template } = widget;
                setApp({
                  ...app,
                  components: [
                    ...app.components,
                    { id: crypto.randomUUID(), name: widget.title, widget: template },
                  ],
                });
              }}
            >
              Save as template
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                writeScreen({
                  ...screen,
                  widgets: screen.widgets.filter((item) => item.id !== widget.id),
                });
                setWidgetId("");
              }}
            >
              <Trash2 />
              Remove component
            </Button>
          </>
        )}
      </section>
    </div>
  );
}

function WidgetProperties({
  app,
  widget,
  change,
}: {
  app: StudioDefinition;
  widget: StudioWidget;
  change: (widget: StudioWidget) => void;
}) {
  const expectedType = inputTypes[widget.kind];
  const signalWidget = ["signal", "alarm", "trend", "equipment"].includes(widget.kind);
  return (
    <>
      <p className="border-t border-border pt-3 text-xs font-semibold">
        {widgetLabels[widget.kind]}
      </p>
      <Field label="Label">
        <input
          className={editorInput}
          value={widget.title}
          maxLength={120}
          onChange={(event) => change({ ...widget, title: event.target.value })}
        />
      </Field>
      {["instruction", "connection", "table"].includes(widget.kind) && (
        <Field label={widget.kind === "table" ? "Rows, separated by |" : "Content"}>
          <textarea
            className={editorInput}
            maxLength={4000}
            rows={4}
            value={widget.content}
            onChange={(event) => change({ ...widget, content: event.target.value })}
          />
        </Field>
      )}
      {expectedType && (
        <Field label="Variable binding">
          <select
            className={editorInput}
            value={widget.variableId ?? ""}
            onChange={(event) => {
              const variable = app.variables.find((item) => item.id === event.target.value);
              change({ ...widget, variableId: variable?.id ?? null, unit: variable?.unit ?? "" });
            }}
          >
            <option value="">Select variable</option>
            {app.variables
              .filter((item) => item.type === expectedType)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      {widget.kind === "number" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={`Target ${widget.unit}`}
            value={widget.target}
            onChange={(target) => change({ ...widget, target })}
          />
          <NumberField
            label={`Tolerance ${widget.unit}`}
            value={widget.tolerance}
            min={0}
            onChange={(tolerance) => change({ ...widget, tolerance })}
          />
        </div>
      )}
      {widget.kind === "choice" && (
        <Field label="Choice options" hint="Separate options with a vertical bar.">
          <input
            className={editorInput}
            key={widget.id + widget.choices.join("|")}
            defaultValue={widget.choices.join(" | ")}
            onBlur={(event) =>
              change({
                ...widget,
                choices: event.target.value
                  .split("|")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      )}
      {widget.kind === "action" && (
        <Field label="Workflow event">
          <select
            className={editorInput}
            value={widget.event}
            onChange={(event) =>
              change({ ...widget, event: event.target.value as StudioWidget["event"] })
            }
          >
            <option value="submit">Submit</option>
            <option value="cancel">Cancel</option>
          </select>
        </Field>
      )}
      {signalWidget && (
        <Field label="Signal binding">
          <select
            className={editorInput}
            value={widget.signalId ?? ""}
            onChange={(event) => {
              const signal = app.signals.find((item) => item.id === event.target.value);
              change({ ...widget, signalId: signal?.id ?? null, unit: signal?.unit ?? "" });
            }}
          >
            <option value="">Select signal</option>
            {app.signals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {widget.kind === "media" && (
        <Field label="Media binding">
          <select
            className={editorInput}
            value={widget.mediaId ?? ""}
            onChange={(event) => change({ ...widget, mediaId: event.target.value || null })}
          >
            <option value="">Select media</option>
            {app.media.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}
