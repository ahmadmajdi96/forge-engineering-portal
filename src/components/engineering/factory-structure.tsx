import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEngineering } from "@/lib/engineering/context";
import { getFactoryStructure } from "@/lib/production/engineering-relations.functions";
import { Surface } from "./reference-ui";
import { Button } from "@/components/ui/button";
export function FactoryStructure() {
  const { native, site, actions } = useEngineering();
  const get = useServerFn(getFactoryStructure);
  const allowed = !!site && actions.includes("ems.factory_layout.view");
  const query = useQuery({
    queryKey: ["factory-structure", site],
    queryFn: () => get({ data: { site: site! } }),
    enabled: allowed,
  });
  if (!native || !allowed) return null;
  const data = query.data;
  const locations =
    data?.spaces.filter((s) => ["building", "floor", "area"].includes(s.kind)) ?? [];
  return (
    <Surface
      title="Factory layout"
      sub={
        data?.revision ? `Saved layout r${data.revision} · ${data.placements} placed assets` : site
      }
      actions={
        <Button size="sm" variant="outline" asChild>
          <Link to="/factory-layout" search={{ site }}>
            Open 3D layout
          </Link>
        </Button>
      }
    >
      {query.isError ? (
        <p role="alert">
          Layout summary unavailable.{" "}
          <button onClick={() => void query.refetch()} className="underline">
            Retry
          </button>
        </p>
      ) : query.isPending ? (
        <p role="status">Loading layout…</p>
      ) : locations.length ? (
        <div className="flex flex-wrap gap-2">
          {locations.slice(0, 12).map((s) => (
            <Button key={s.id} size="sm" variant="secondary" asChild>
              <Link to="/factory-layout" search={{ site, space: s.id }}>
                {s.kind} · {s.label}
              </Link>
            </Button>
          ))}
          {locations.length > 12 && (
            <Link className="ref-issue-link" to="/factory-layout" search={{ site }}>
              Browse all {locations.length} locations
            </Link>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Open the layout to add a building, floor and area before placing equipment.
        </p>
      )}
    </Surface>
  );
}
