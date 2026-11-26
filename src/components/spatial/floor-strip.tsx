import { Layers3 } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

export interface FloorStripProps {
  floorName: string;
  width: number;
  depth: number;
  sections: ReadonlyArray<{ id: string; label: string; defined: boolean; estimated?: boolean }>;
  activeSection?: string | undefined;
  onSection: (id: string) => void;
  onFloor: () => void;
}

const floorButtonClass =
  "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted sm:flex-none";

const sectionButtonClass =
  "inline-flex min-h-8 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border px-2.5 py-1 text-xs font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted";

export function FloorStrip({
  floorName,
  width,
  depth,
  sections,
  activeSection,
  onSection,
  onFloor,
}: FloorStripProps) {
  const sectionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const floorIsActive = activeSection === undefined;
  const activeSectionIndex = sections.findIndex((section) => section.id === activeSection);

  const handleSectionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % sections.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + sections.length) % sections.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = sections.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextSection = sections[nextIndex];
    if (!nextSection) return;

    sectionRefs.current[nextIndex]?.focus();
    onSection(nextSection.id);
  };

  return (
    <nav
      aria-label={`${floorName} navigation`}
      className="flex w-full min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/40 p-2 text-foreground sm:flex-nowrap sm:gap-3 sm:px-3"
    >
      <button
        type="button"
        aria-pressed={floorIsActive}
        onClick={onFloor}
        className={`${floorButtonClass} ${
          floorIsActive
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
        }`}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground">
          <Layers3 className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate text-sm font-semibold leading-5">{floorName}</span>
        <span className="shrink-0 whitespace-nowrap text-xs font-normal leading-5 text-muted-foreground">
          {width} × {depth} m
        </span>
      </button>

      <span className="hidden h-7 w-px shrink-0 bg-border/80 sm:block" aria-hidden="true" />

      <div
        role="toolbar"
        aria-label={`${floorName} sections`}
        aria-orientation="horizontal"
        className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-1.5 sm:flex-1"
      >
        {sections.length === 0 ? (
          <p className="px-2 py-1 text-xs leading-5 text-muted-foreground">
            No sections available.
          </p>
        ) : (
          sections.map((section, index) => {
            const isActive = activeSection === section.id;
            const activeTabStop =
              activeSectionIndex < 0 ? index === 0 : index === activeSectionIndex;

            return (
              <button
                key={section.id}
                ref={(node) => {
                  sectionRefs.current[index] = node;
                }}
                type="button"
                tabIndex={activeTabStop ? 0 : -1}
                aria-pressed={isActive}
                aria-keyshortcuts="ArrowLeft ArrowRight Home End"
                onClick={() => onSection(section.id)}
                onKeyDown={(event) => handleSectionKeyDown(event, index)}
                className={`${sectionButtonClass} ${
                  isActive
                    ? "border-primary/60 bg-background text-foreground shadow-sm"
                    : `${section.defined ? "border-transparent" : "border-dashed border-border/80"} bg-background/45 text-muted-foreground hover:border-border hover:bg-background hover:text-foreground`
                }`}
              >
                <span className="min-w-0 break-words">{section.label}</span>
                {!section.defined && (
                  <span className="border-l border-border/80 pl-1.5 text-xs font-normal text-muted-foreground">
                    {section.estimated ? "Equipment extent" : "No footprint"}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </nav>
  );
}
