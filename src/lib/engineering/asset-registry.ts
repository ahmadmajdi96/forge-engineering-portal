import type { EngineeringModel } from './model';
import type { ProductionLine, Station, StepTemplate } from '../mes-data';
import { upsertDesignRecord } from './design-records';

export function projectAssets(model: EngineeringModel) {
  const lines: ProductionLine[] = model.lines.filter(line=>!line.archived).map(line=>({
    ...line,oee:0,availability:0,performance:0,quality:0,output:0,uptime:"Not connected",
  }));
  const stationLines = new Map(model.stations.map(s=>[s.id,s.lineId]));
  const perLineOperations = new Map<string,number>();
  const firstOperation = new Map<string,number>();
  const machines = new Map<string,Station["machine"]>();
  const templates = new Map<string,string[]>();
  const stepTemplates: StepTemplate[] = [];
  for (const record of model.records) {
    if(record.archived)continue;
    if(record.kind==="equipment" && record.machine && !machines.has(record.parent))
      machines.set(record.parent,record.machine);
    if(record.kind==="template") {
      const assigned=templates.get(record.parent)??[];
      assigned.push(record.id);templates.set(record.parent,assigned);
      stepTemplates.push({id:record.id,name:record.name,category:record.required?"ccp":"process",isCCP:record.required,holdOnFailure:record.required,defaultTarget:record.value,defaultTolerance:record.unit,sensorBindings:record.binding,instruction:record.description,appliesTo:"both"});
    }
    if(record.kind==="operation") {
      const affectedLines=new Set<string>();
      const references=[record.parent,...record.binding.split(",").map(id=>id.trim())];
      for(const id of references) {
        const line=stationLines.get(id);
        if(!line)continue;
        affectedLines.add(line);
        if(!firstOperation.has(id))firstOperation.set(id,(perLineOperations.get(line)??0)+1);
      }
      for(const line of affectedLines)perLineOperations.set(line,(perLineOperations.get(line)??0)+1);
    }
  }
  const stations:Station[]=model.stations.map((s,index)=>({
    id:s.id,name:s.name,lineId:s.lineId??"L-01",sequence:firstOperation.get(s.id)??index+1,
    status:"idle",cycleTimeSec:0,...s.config,type:s.mode,machine:machines.get(s.id),templateIds:s.config?.templateIds??templates.get(s.id)??[],
  }));
  return {lines,stations,stepTemplates};
}

export function putLine(model:EngineeringModel,line:ProductionLine):EngineeringModel {
  if(!line.id.trim()||!line.name.trim())throw Error('Line ID and name are required.');
  const next={...model.lines.find(item=>item.id===line.id),id:line.id,name:line.name,plant:line.plant,status:line.status,target:line.target,archived:false};
  return {...model,lines:model.lines.some(l=>l.id===line.id)?model.lines.map(l=>l.id===line.id?next:l):[...model.lines,next],...(model.lines[0]?.id===line.id?{name:line.name,scope:line.plant}:{})};
}

export function putStation(model:EngineeringModel,station:Station):EngineeringModel {
  if(!model.lines.some(l=>l.id===station.lineId&&!l.archived))throw Error('Choose an existing production line.');
  if(!station.name.trim())throw Error('Station name is required.');
  if(model.archivedStations?.some(s=>s.id===station.id))throw Error('An archived station already owns this ID.');
  const existing=model.stations.find(s=>s.id===station.id);
  const {id,name,lineId,type,machine,...config}=station;
  let records=model.records;
  let equipment=existing?.equipment??[];
  if(station.machine){
    const current=records.find(r=>r.kind==='equipment'&&!r.archived&&r.parent===id&&r.machine)??records.find(r=>r.kind==='equipment'&&!r.archived&&r.parent===id);
    const assetId=current?.id??`EQ-${id}`;
    if(!current && records.some(r=>r.kind==='equipment'&&r.id===assetId))throw Error('This machine identifier is already registered. Assign an existing machine from station composition.');
    const asset={id:assetId,kind:'equipment' as const,name:station.machine.model||`${name} machine`,parent:id,version:'r1',description:'',binding:'',unit:'',value:'',required:false,archived:false,...current,machine:station.machine};
    records=upsertDesignRecord(records,asset);
    equipment=Array.from(new Set([...equipment,assetId]));
  }
  const next={...existing,id,name,lineId,mode:type,equipment,app:existing?.app??'',operation:existing?.operation??'',tracking:existing?.tracking??'lot' as const,scaleBound:existing?.scaleBound??false,challengeBound:existing?.challengeBound??false,config:{...existing?.config,...config}};
  // The existing operation record remains the process-design authority.
  return {...model,records,stations:existing?model.stations.map(s=>s.id===id?next:s):[...model.stations,next]};
}

export function removeStation(model:EngineeringModel,id:string):EngineeringModel {
  const station=model.stations.find(s=>s.id===id);
  if (!station) throw Error('Select an active station.');
  if (station.equipment.length || station.app || station.operation || model.signals.some(s=>'stationId' in s && s.stationId===id) ||
      model.records.some(r=>!r.archived&&(r.parent===id||r.binding.split(',').some(v=>v.trim()===id))))
    throw Error('Reassign station equipment, applications, signals and process dependencies first.');
  return {...model,archivedStations:[...(model.archivedStations??[]),station],stations:model.stations.filter(s=>s.id!==id)};
}
export function removeLine(model:EngineeringModel,id:string):EngineeringModel {
  if(model.stations.some(s=>s.lineId===id)||model.records.some(r=>!r.archived&&r.parent===id))throw Error('Reassign line stations and process dependencies first.');
  return {...model,lines:model.lines.map(l=>l.id===id?{...l,archived:true}:l)};
}