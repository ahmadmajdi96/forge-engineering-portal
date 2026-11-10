import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowRight, Network, ListOrdered, Boxes, Cable } from 'lucide-react';
import { Button } from '@/components/ui/button';

const stages = [
  { title: 'Production lines', detail: 'Structure & metrics', to: '/line-engineering', icon: Network },
  { title: 'Production steps', detail: 'Sequence & assignments', to: '/asset-steps', icon: ListOrdered },
  { title: 'Station composition', detail: 'Manual / automatic & assets', to: '/workstations', icon: Boxes },
  { title: 'Station connectivity', detail: 'Protocol, apps & data', to: '/station-connectivity', icon: Cable },
] as const;

export function AssetFlowNav() {
  const path = useRouterState({ select: state => state.location.pathname });
  return <nav className="asset-flow-nav" aria-label="Asset engineering flow">
    {stages.map((stage, index) => <div className="asset-flow-stage" key={stage.to}>
      <Button variant="ghost" asChild className={path === stage.to ? 'is-selected' : ''}>
        <Link to={stage.to} aria-current={path === stage.to ? 'step' : undefined}>
          <span className="asset-flow-number">{index + 1}</span><stage.icon size={18} />
          <span><strong>{stage.title}</strong><small>{stage.detail}</small></span>
        </Link>
      </Button>{index < stages.length - 1 && <ArrowRight size={17} />}
    </div>)}
  </nav>;
}