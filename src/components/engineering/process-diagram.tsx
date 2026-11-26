import { useId } from "react";
import type { ProcessRoute } from "@/lib/production/process";

const width = 164,
  height = 46,
  gapX = 74,
  gapY = 34,
  margin = 30;
export function ProcessDiagram({
  route,
  selected,
  visit,
}: {
  route: ProcessRoute;
  selected: string;
  visit: (id: string) => void;
}) {
  const marker = useId().replace(/[^\w-]/g, "");
  if (!route.steps.length || route.steps.length > 40) return null;
  const ids = new Set(route.steps.map((s) => s.id));
  const depth = new Map<string, number>(),
    queue: string[] = [ids.has(route.start) ? route.start : route.steps[0]!.id];
  depth.set(queue[0]!, 0);
  const edges = route.transitions.filter((e) => ids.has(e.from) && ids.has(e.to));
  for (let i = 0; i < queue.length; i++) {
    const source = queue[i]!;
    for (const e of edges)
      if (e.from === source && e.outcome !== "rework" && !depth.has(e.to)) {
        depth.set(e.to, depth.get(source)! + 1);
        queue.push(e.to);
      }
  }
  const detachedColumn = Math.max(0, ...depth.values()) + 1;
  const rows = new Map<number, number>(),
    points = new Map<string, { x: number; y: number }>();
  for (const step of route.steps) {
    const column = depth.get(step.id) ?? detachedColumn,
      row = rows.get(column) ?? 0;
    points.set(step.id, { x: margin + column * (width + gapX), y: margin + row * (height + gapY) });
    rows.set(column, row + 1);
  }
  const diagramWidth = Math.max(...Array.from(points.values(), (p) => p.x)) + width + margin;
  const diagramHeight = Math.max(...Array.from(points.values(), (p) => p.y)) + height + margin;
  return (
    <div
      className="max-w-full overflow-x-auto rounded-md border bg-background/70"
      role="group"
      aria-label="Manufacturing route diagram"
    >
      <svg
        viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}
        width={diagramWidth}
        height={diagramHeight}
        className="min-w-fit"
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        {edges.map((edge, i) => {
          const a = points.get(edge.from)!,
            b = points.get(edge.to)!;
          const x = a.x + width,
            y = a.y + height / 2,
            endX = b.x - 2,
            endY = b.y + height / 2;
          const path =
            edge.from === edge.to
              ? `M ${x} ${y} C ${x + 28} ${y} ${x + 28} ${a.y - 15} ${x - 12} ${a.y - 15} S ${a.x + width / 2} ${a.y - 15} ${a.x + width / 2} ${a.y - 1}`
              : b.x > a.x
                ? `M ${x} ${y} C ${x + gapX / 2} ${y}, ${endX - gapX / 2} ${endY}, ${endX} ${endY}`
                : `M ${a.x + width / 2} ${a.y} C ${a.x + width / 2} ${Math.min(a.y, b.y) - 25} ${b.x + width / 2} ${Math.min(a.y, b.y) - 25} ${b.x + width / 2} ${b.y - 1}`;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={edge.outcome === "success" ? "var(--muted-foreground)" : "var(--warn)"}
              strokeWidth="1.7"
              strokeDasharray={
                edge.outcome === "success" ? undefined : edge.outcome === "failure" ? "6 3" : "2 3"
              }
              markerEnd={`url(#${marker})`}
            >
              <title>
                {edge.outcome}
                {edge.maxAttempts ? ` · ${edge.maxAttempts} attempts` : ""}
              </title>
            </path>
          );
        })}
        {route.steps.map((step) => {
          const p = points.get(step.id)!,
            active = selected === step.id;
          return (
            <g
              key={step.id}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${step.name}`}
              aria-pressed={active}
              onClick={() => visit(step.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  visit(step.id);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <title>
                {step.name} · {step.id}
              </title>
              <rect
                x={p.x}
                y={p.y}
                rx="6"
                width={width}
                height={height}
                fill="var(--card)"
                stroke={active ? "var(--primary)" : "var(--border)"}
                strokeWidth={active ? 2 : 1}
              />
              <text
                x={p.x + 10}
                y={p.y + 18}
                fill="var(--foreground)"
                fontSize="13"
                fontWeight="600"
              >
                {step.name.length > 21 ? step.name.slice(0, 20) + "…" : step.name}
              </text>
              <text x={p.x + 10} y={p.y + 35} fill="var(--muted-foreground)" fontSize="11">
                {step.id === route.start ? "Entry step" : step.outcome}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
