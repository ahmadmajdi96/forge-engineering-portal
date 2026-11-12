import { useEngineering } from './context';
import { useMes } from '../mes-store';
import { projectAssets,putLine,putStation,removeLine,removeStation } from './asset-registry';
import { MES_CONNECTION_MESSAGE } from '../mes-disconnected';
import { toast } from 'sonner';
import type { WorkOrder,DowntimeEvent,Assignment,AuditEntry,StationCommand,StationOutputFile } from '../mes-data';

/** Compatibility projection for copied asset screens; never merges operational fixtures. */
export function useAssetStore(){
  const preview=useMes();
  const {workspaceModel:model,setWorkspaceModel:setModel}=useEngineering();
  const assets=projectAssets(model);
  const apply=(change:()=>typeof model)=>{try{setModel(change());}catch(e){toast.error(e instanceof Error?e.message:'Draft edit refused');throw e;}};
  const nextId=(prefix:string,ids:string[])=>{let n=1;while(ids.includes(prefix+String(n).padStart(3,'0')))n++;return prefix+String(n).padStart(3,'0');};
  const refuse=()=>{toast.error(MES_CONNECTION_MESSAGE);throw Error(MES_CONNECTION_MESSAGE);};
  const bind=(id:string,templateId:string,remove=false)=>{const s=assets.stations.find(s=>s.id===id);if(s)apply(()=>putStation(model,{...s,templateIds:remove?(s.templateIds??[]).filter(t=>t!==templateId):Array.from(new Set([...(s.templateIds??[]),templateId]))}));};
  return {...preview,...assets,workOrders:[] as WorkOrder[],downtime:[] as DowntimeEvent[],assignments:[] as Assignment[],audit:[] as AuditEntry[],commands:[] as StationCommand[],outputs:[] as StationOutputFile[],
    createLine:(l:Parameters<typeof preview.createLine>[0])=>{const id=l.id??nextId('L-',model.lines.map(l=>l.id));if(model.lines.some(l=>l.id===id))throw Error('Line ID already exists.');apply(()=>putLine(model,{...l,id}));},
    updateLine:(id:string,p:Parameters<typeof preview.updateLine>[1])=>{const l=assets.lines.find(l=>l.id===id);if(l)apply(()=>putLine(model,{...l,...p,id}));},
    deleteLine:(id:string)=>apply(()=>removeLine(model,id)),
    createStation:(s:Parameters<typeof preview.createStation>[0])=>{const id=s.id??nextId('ST-',model.stations.map(s=>s.id));if(model.stations.some(s=>s.id===id))throw Error('Station ID already exists.');apply(()=>putStation(model,{...s,id}));},
    updateStation:(id:string,p:Parameters<typeof preview.updateStation>[1])=>{const s=assets.stations.find(s=>s.id===id);if(s)apply(()=>putStation(model,{...s,...p,id}));},
    deleteStation:(id:string)=>apply(()=>removeStation(model,id)),
    duplicateStation:(id:string)=>{const s=assets.stations.find(s=>s.id===id);if(s)apply(()=>putStation(model,{...s,id:nextId('ST-',model.stations.map(s=>s.id)),name:s.name+' (copy)',machine:undefined,templateIds:[]}));},
    moveStationSibling:(id:string,direction:'up'|'down')=>{const s=assets.stations.find(s=>s.id===id);if(!s)return;const siblings=assets.stations.filter(t=>t.lineId===s.lineId&&t.sequence===s.sequence);const target=siblings[siblings.indexOf(s)+(direction==='up'?-1:1)];if(!target)return;const stations=[...model.stations];const a=stations.findIndex(t=>t.id===id),b=stations.findIndex(t=>t.id===target.id);const first=stations[a],second=stations[b];if(first&&second){stations[a]=second;stations[b]=first;setModel({...model,stations});}},
    applyTemplateToStation:(id:string,t:string)=>bind(id,t),removeTemplateFromStation:(id:string,t:string)=>bind(id,t,true),
    createAssignment:refuse,updateAssignment:refuse,deleteAssignment:refuse,createDowntime:refuse,updateDowntime:refuse,
  };
}