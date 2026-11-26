import { Link, useRouterState } from "@tanstack/react-router";
import { Network, ListOrdered, Boxes, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEngineering } from "@/lib/engineering/context";
import { useGuidedSetup } from "./setup-wizard-context";

const stages = [
  {
    title: "Production lines",
    detail: "Structure & capacity",
    to: "/line-engineering",
    icon: Network,
  },
  {
    title: "Production steps",
    detail: "Sequence & assignments",
    to: "/asset-steps",
    icon: ListOrdered,
  },
  { title: "Station composition", detail: "Station assets", to: "/workstations", icon: Boxes },
  {
    title: "Station connectivity",
    detail: "Interfaces & signals",
    to: "/station-connectivity",
    icon: Cable,
  },
] as const;

const detailLinks = [
  { title: "Asset registry", to: "/registry" },
  { title: "Station composition", to: "/workstations" },
  { title: "Equipment components", to: "/machines" },
  { title: "Terminals & peripherals", to: "/terminals" },
  { title: "Signal bindings", to: "/station-connectivity" },
  { title: "Command policy", to: "/command-policy" },
] as const;

export function EngineeringDetailNav() {
  const guided = useGuidedSetup();
  const { site, lineId, selected } = useEngineering();
  const scope = { ...(site ? { site } : {}), engLine: lineId, engStation: selected };
  if (guided) return null;
  return (
    <>
      <nav
        className="ref-detail-links engineering-detail-desktop"
        aria-label="Engineering detail pages"
      >
        {detailLinks.map((link) => (
          <Link key={link.to} to={link.to} search={scope}>
            {link.title}
          </Link>
        ))}
      </nav>
      <RelatedEngineeringPages standalone />
    </>
  );
}

export function RelatedEngineeringPages({ standalone = false }: { standalone?: boolean }) {
  const guided = useGuidedSetup();
  const { site, lineId, selected } = useEngineering();
  const scope = { ...(site ? { site } : {}), engLine: lineId, engStation: selected };
  const path = useRouterState({ select: (state) => state.location.pathname });
  const links = [
    ...stages,
    ...detailLinks.filter((link) => !stages.some((stage) => stage.to === link.to)),
  ];
  if (guided) return null;
  return (
    <details
      className={"engineering-related-pages" + (standalone ? " engineering-detail-disclosure" : "")}
    >
      <summary>Related engineering pages</summary>
      <nav aria-label="Related engineering pages">
        {links.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            search={scope}
            aria-current={path === item.to ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </nav>
    </details>
  );
}

export function AssetFlowNav() {
  const guided = useGuidedSetup();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { site, lineId, selected } = useEngineering();
  const scope = { ...(site ? { site } : {}), engLine: lineId, engStation: selected };
  if (guided) return null;
  return (
    <div className="engineering-flow-links">
      <nav className="asset-flow-nav" aria-label="Related engineering views">
        {stages.map((stage) => (
          <div className="asset-flow-stage" key={stage.to}>
            <Button variant="ghost" asChild className={path === stage.to ? "is-selected" : ""}>
              <Link
                to={stage.to}
                search={scope}
                aria-current={path === stage.to ? "page" : undefined}
              >
                <stage.icon size={18} />
                <span>
                  <strong>{stage.title}</strong>
                  <small>{stage.detail}</small>
                </span>
              </Link>
            </Button>
          </div>
        ))}
      </nav>
      <RelatedEngineeringPages />
    </div>
  );
}
