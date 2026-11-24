import { Link } from '@tanstack/react-router';
import { useEngineering } from '@/lib/engineering/context';
import { ScopeSelectors,DetailLinks,Notice } from './reference-ui';
import { Button } from '@/components/ui/button';
import { Save,Network,Workflow } from 'lucide-react';
import { useState } from 'react';
import { DraftDialog } from './reference-ui';

export function AssetPageLinks({stationId,lineId}:{stationId?:string;lineId?:string}){
  const {site,revision,workspaceModel,actions}=useEngineering();const [saving,setSaving]=useState(false);
  const scope={site,engLine:lineId??workspaceModel.stations.find(s=>s.id===stationId)?.lineId,engStation:stationId};
  return <section className="space-y-3" aria-label="Shared engineering context"><Notice>{site??'Engineering sandbox'} · Engineering draft {revision ? `r${revision}` : 'awaiting first save'}</Notice><div className="flex flex-wrap items-center justify-between gap-3"><ScopeSelectors/><div className="flex flex-wrap gap-2">{actions.includes("ems.factory_process.view") && <Button variant="outline" asChild><Link to="/factory-process" search={scope}>Sections and routes</Link></Button>}<Button variant="outline" asChild><Link to="/line-engineering" search={scope}><Network size={15}/>Line engineering</Link></Button><Button variant="outline" asChild><Link to="/asset-steps" search={scope}><Workflow size={15}/>Production steps</Link></Button><Button onClick={()=>setSaving(true)}><Save size={15}/>Save draft</Button></div></div><div><DetailLinks/></div><DraftDialog open={saving} onClose={()=>setSaving(false)}/></section>;
}