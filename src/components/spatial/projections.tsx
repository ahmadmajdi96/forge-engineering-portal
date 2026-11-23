import { memo, useId } from "react";
import {
  add,
  portPosition,
  rotate,
  type Connection,
  type FloorReference,
  type Vector,
} from "@/lib/spatial/model";
import { occurrenceBounds } from "@/lib/spatial/validation";
import { connectionColors, equipmentColors } from "./palette";
import type { VisualRecord } from "./scene";

type Point = [number, number];
type Props = {
  floor: { size: Vector; reference: FloorReference | null };
  records: VisualRecord[];
  connections: Connection[];
  selected: string[];
  mode: "plan" | "elevation";
  onSelect: (id: string, multi: boolean) => void;
};

function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chain = (items: Point[]) => {
    const result: Point[] = [];
    for (const point of items) {
      while (result.length >= 2) {
        const a = result[result.length - 2]!,
          b = result[result.length - 1]!;
        const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
        if (cross > 0) break;
        result.pop();
      }
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...chain(sorted), ...chain(sorted.reverse())];
}

export const SpatialProjection = memo(function SpatialProjection({
  floor,
  records,
  connections,
  selected,
  mode,
  onSelect,
}: Props) {
  const id = useId();
  const plan = mode === "plan";
  const width = floor.size.x,
    height = plan ? floor.size.z : floor.size.y;
  const pad = Math.max(0.25, Math.max(width, height) * 0.035);
  const stroke = Math.max(width, height) / 260;
  const project = (point: Vector): Point => [point.x, plan ? point.z : height - point.y];
  const byId = new Map(records.map((item) => [item.record.id, item]));
  const selection = new Set(selected);
  const grid = Math.max(1, Math.ceil(Math.max(width, height) / 50));

  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-border bg-[#151d28]">
      <figcaption className="border-b border-white/15 px-3 py-2 text-sm text-slate-100">
        {plan ? "Floor plan · X/Z" : "Front elevation · X/Y"}
      </figcaption>
      <svg
        className="block min-h-32 w-full"
        role="group"
        aria-label={plan ? "Floor plan in metres" : "Front elevation in metres"}
        preserveAspectRatio="xMidYMid meet"
        viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
      >
        <defs>
          <pattern id={id} patternUnits="userSpaceOnUse" width={grid} height={grid}>
            <path
              d={`M ${grid} 0 L 0 0 0 ${grid}`}
              strokeWidth={stroke / 2}
              stroke="#49627a"
              fill="none"
            />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="#1e2b3b" stroke="#90a6bc" strokeWidth={stroke} />
        {plan && floor.reference && (
          <image
            x={floor.reference.x}
            y={floor.reference.z}
            width={floor.reference.width}
            height={floor.reference.depth}
            opacity="0.62"
            preserveAspectRatio="none"
            href={`data:image/${floor.reference.format};base64,${floor.reference.base64}`}
          />
        )}
        <rect width={width} height={height} fill={`url(#${id})`} />
        {records.map(({ record, template }) => {
          const size = record.sizeOverride ?? template.size;
          let outline: Point[];
          if (record.rotation.x === 0 && record.rotation.y === 0 && record.rotation.z === 0) {
            const x = record.position.x - size.x / 2;
            const y = plan ? record.position.z - size.z / 2 : height - record.position.y - size.y;
            const endY = y + (plan ? size.z : size.y);
            outline = [
              [x, y],
              [x + size.x, y],
              [x + size.x, endY],
              [x, endY],
            ];
          } else {
            outline = hull(
              [-1, 1].flatMap((x) =>
                [0, 1].flatMap((y) =>
                  [-1, 1].map((z) =>
                    project(
                      add(
                        record.position,
                        rotate(
                          { x: (size.x * x) / 2, y: size.y * y, z: (size.z * z) / 2 },
                          record.rotation,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          }
          const chosen = selection.has(record.id);
          const bounds =
            chosen && record.clearance
              ? occurrenceBounds(record, template, record.clearance.distance)
              : null;
          const start = bounds ? project({ ...bounds.min, y: bounds.max.y }) : null;
          const end = bounds ? project({ ...bounds.max, y: bounds.min.y }) : null;
          return (
            <g key={record.id}>
              {start && end && (
                <rect
                  x={start[0]}
                  y={start[1]}
                  width={end[0] - start[0]}
                  height={end[1] - start[1]}
                  fill="none"
                  stroke="#f29179"
                  strokeWidth={stroke / 2}
                  strokeDasharray={`${stroke * 2} ${stroke}`}
                />
              )}
              <polygon
                points={outline.map((point) => point.join(",")).join(" ")}
                className="cursor-pointer hover:brightness-125 focus-visible:brightness-150"
                role="button"
                tabIndex={0}
                aria-label={record.label}
                aria-pressed={chosen}
                fill={equipmentColors[template.kind] ?? "#8491a5"}
                fillOpacity={chosen ? 1 : 0.78}
                stroke={chosen ? "#ffd488" : "#152131"}
                strokeWidth={chosen ? stroke * 1.25 : stroke / 2}
                onClick={(event) =>
                  onSelect(record.id, event.shiftKey || event.metaKey || event.ctrlKey)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(record.id, event.shiftKey || event.metaKey || event.ctrlKey);
                  }
                }}
              >
                <title>{record.label}</title>
              </polygon>
            </g>
          );
        })}
        {connections.map((link) => {
          const from = byId.get(link.from.occurrenceId),
            to = byId.get(link.to.occurrenceId);
          const a = from?.template.ports.find((port) => port.id === link.from.portId);
          const b = to?.template.ports.find((port) => port.id === link.to.portId);
          if (!from || !to || !a || !b) return null;
          const [x1, y1] = project(portPosition(from.record, from.template, a));
          const [x2, y2] = project(portPosition(to.record, to.template, b));
          return (
            <line
              key={link.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              pointerEvents="none"
              stroke={connectionColors[link.kind]}
              strokeWidth={stroke}
              strokeDasharray={link.kind === "material" ? undefined : `${stroke * 4} ${stroke * 3}`}
            >
              <title>
                {link.kind} · {a.label} to {b.label}
              </title>
            </line>
          );
        })}
      </svg>
    </figure>
  );
});
