import { Link } from '@tanstack/react-router';
import { useEngineering } from '@/lib/engineering/context';
import { ScopeSelectors,DetailLinks,Notice } from './reference-ui';
import { Button } from '@/components/ui/button';
import { Save,Network,Workflow } from 'lucide-react';
import { useState } from 'react';
import { DraftDialog } from './reference-ui';

export function AssetPageLinks({stationId,lineId}:{stationId?:string;lineId?:string}){
  const {select,selectLine}=useEngineering();const [saving,setSaving]=useState(false);
  const choose=()=>{if(stationId)select(stationId);else if(lineId)selectLine(lineId);};
  return <section className="space-y-3" aria-label="Shared engineering context"><Notice>Shared engineering draft · MES telemetry, operator assignments and machine execution are not connected.</Notice><div className="flex flex-wrap items-center justify-between gap-3"><ScopeSelectors/><div className="flex flex-wrap gap-2"><Button variant="outline" asChild onClick={choose}><Link to="/line-engineering"><Network size={15}/>Line engineering</Link></Button><Button variant="outline" asChild onClick={choose}><Link to="/asset-steps"><Workflow size={15}/>Production steps</Link></Button><Button onClick={()=>setSaving(true)}><Save size={15}/>Save draft</Button></div></div><div onClick={choose}><DetailLinks/></div><DraftDialog open={saving} onClose={()=>setSaving(false)}/></section>;
}