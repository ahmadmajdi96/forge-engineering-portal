import type { EngineeringModel } from './model';
import type { ProductionLine, Station, StepTemplate } from '../mes-data';
import { upsertDesignRecord } from './design-records';

export function projectAssets(model: EngineeringModel) {
  const lines:ProductionLine[]=model.lines.filter(l=>!l.archived).map(l=>({...l,oee:0,availability:0,performance:0,quality:0,output:0,uptime:'Not connected'}));
  const stations:Station[]=model.stations.map((s,index)=>{
    const equipment=model.records.find(r=>!r.archived&&r.kind==='equipment'&&r.parent===s.id&&r.machine);
    return {id:s.id,name:s.name,lineId:s.lineId??'L-01',sequence:index+1,status:'idle',cycleTimeSec:0,...s.config,type:s.mode,machine:equipment?.machine??s.config?.machine,templateIds:s.config?.templateIds??model.records.filter(r=>r.kind==='template'&&!r.archived&&r.parent===s.id).map(r=>r.id)};
  });
  const stepTemplates:StepTemplate[]=model.records.filter(r=>r.kind==='template'&&!r.archived).map(r=>({id:r.id,name:r.name,category:r.required?'ccp':'process',isCCP:r.required,holdOnFailure:r.required,defaultTarget:r.value,defaultTolerance:r.unit,sensorBindings:r.binding,instruction:r.description,appliesTo:'both'}));
  return {lines,stations,stepTemplates};
}

export function putLine(model:EngineeringModel,line:ProductionLine):EngineeringModel {
  if(!line.id.trim()||!line.name.trim())throw Error('Line ID and name are required.');
  const next={id:line.id,name:line.name,plant:line.plant,status:line.status,target:line.target,archived:false};
  return {...model,lines:model.lines.some(l=>l.id===line.id)?model.lines.map(l=>l.id===line.id?next:l):[...model.lines,next],...(model.lines[0]?.id===line.id?{name:line.name,scope:line.plant}:{})};
}

export function putStation(model:EngineeringModel,station:Station):EngineeringModel {
  if(!model.lines.some(l=>l.id===station.lineId&&!l.archived))throw Error('Choose an existing production line.');
  if(!station.name.trim())throw Error('Station name is required.');
  const existing=model.stations.find(s=>s.id===station.id);
  const {id,name,lineId,type,...config}=station;
  let records=model.records;
  let equipment=existing?.equipment??[];
  if(station.machine){
    const current=records.find(r=>r.kind==='equipment'&&!r.archived&&r.parent===id&&r.machine)??records.find(r=>r.kind==='equipment'&&!r.archived&&r.parent===id);
    const assetId=current?.id??`EQ-${id}`;
    const asset={id:assetId,kind:'equipment' as const,name:station.machine.model||`${name} machine`,parent:id,version:'r1',description:'',binding:'',unit:'',value:'',required:false,archived:false,...current,machine:station.machine};
    records=upsertDesignRecord(records,asset);
    equipment=Array.from(new Set([...equipment,assetId]));
  }
  const next={id,name,lineId,mode:type,equipment,app:existing?.app??'',operation:existing?.operation??'',tracking:existing?.tracking??'lot' as const,scaleBound:existing?.scaleBound??false,challengeBound:existing?.challengeBound??false,config};
  // The existing operation record remains the process-design authority.
  return {...model,records,stations:existing?model.stations.map(s=>s.id===id?next:s):[...model.stations,next]};
}

export function removeStation(model:EngineeringModel,id:string):EngineeringModel {
  if(model.records.some(r=>!r.archived&&(r.parent===id||r.binding.split(',').map(v=>v.trim()).includes(id))))throw Error('Reassign station equipment and process dependencies first.');
  return {...model,stations:model.stations.filter(s=>s.id!==id)};
}
export function removeLine(model:EngineeringModel,id:string):EngineeringModel {
  if(model.stations.some(s=>s.lineId===id)||model.records.some(r=>!r.archived&&r.parent===id))throw Error('Reassign line stations and process dependencies first.');
  return {...model,lines:model.lines.map(l=>l.id===id?{...l,archived:true}:l)};
}