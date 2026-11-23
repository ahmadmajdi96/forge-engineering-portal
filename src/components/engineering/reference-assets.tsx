import {WorkspaceHistory} from './workspace-history';
import {AddRecord,RecordActions,useRecords} from './record-editor';
import {useState} from 'react';
import {Link} from '@tanstack/react-router';
import {Layers,Network,Server,AlertTriangle,CheckCircle2,FileText,ExternalLink,Search,Box,Settings2,Monitor,ShieldCheck,Pencil,ArrowRight,Radio,Lock,Save,Plus,Barcode,Printer,Weight,Activity,Copy,Check,ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useEngineering} from '@/lib/engineering/context';
import {Surface,ReferencePage,ScopeSelectors,RefTabs,RefTable,KeyValues,Notice,StationList,Badge,DetailLinks,DraftDialog} from './reference-ui';

const engineeringSteps = [
  {to:'/line-engineering', title:'Configure the line', detail:'Set the topology, production steps and station assignments.', icon:Network},
  {to:'/process-routes', title:'Design a process', detail:'Map operations and material flow across stations.', icon:Settings2},
  {to:'/edge-app-studio', title:'Edit the operator workflow', detail:'Build screens, bindings and operator steps.', icon:Monitor},
] as const;

const factorySteps = [
  {to:'/factory-layout', title:'Place factory assets', detail:'Arrange the floor plan and inspect it in 3D.', icon:Box},
  {to:'/factory-process', title:'Build a factory route', detail:'Connect placed assets into a process sequence.', icon:Network},
  {to:'/application-studio', title:'Author an application', detail:'Validate the operator application and save a revision.', icon:Monitor},
  {to:'/factory-releases', title:'Review and publish', detail:'Inspect the submitted application revision and its evidence.', icon:ShieldCheck},
  {to:'/factory-assignment', title:'Assign a release', detail:'Select a published release for an eligible target.', icon:Server},
] as const;

const issueEditors = {
  Registry:'/registry', Mapping:'/asset-steps', Equipment:'/workstations', Process:'/process-routes',
  Signals:'/station-connectivity', Workflow:'/edge-app-studio', Policy:'/command-policy',
} as const;

export function EngineeringOverview() {
  const {model,workspaceModel,select,issues,revision,native,site} = useEngineering();
  const stations = model.stations;
  const mappings = stations.filter(station=>station.operation).length;
  const bindings = stations.filter(station=>station.app && station.challengeBound).length;
  const nodes = workspaceModel.records.filter(record=>record.kind==='node' && !record.archived).length;
  const metrics = [
    {label:'Station mappings',value:`${mappings} / ${stations.length}`,icon:Layers},
    {label:'Process bindings',value:`${bindings} / ${stations.length}`,icon:Settings2},
    {label:'Workspace edge targets',value:nodes,icon:Server},
    {label:'Workspace design issues',value:issues.length,icon:AlertTriangle},
  ];
  const steps = native && site ? factorySteps : engineeringSteps;
  return <ReferencePage title="Engineering Overview" sourceLabel={native ? "Factory engineering draft" : "Sandbox engineering draft"} sub="Configure the production line, resolve design issues and review saved revisions.">
    <ScopeSelectors/>
    <div className="ref-kpis">{metrics.map(({icon:Icon,label,value})=><div className="ref-kpi" key={label}>
      <Icon aria-hidden="true" size={25} className={label==='Workspace design issues' && issues.length?'text-warning':'text-info'}/>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>)}</div>
    <div className="ref-overview-grid">
      <div className="ref-stack">
        <Surface title={<><Network/>Line configuration</>} sub={`${model.scope} / ${model.name}`}
          actions={<Button variant="outline" size="sm" asChild><Link to="/line-engineering">Edit topology<ArrowRight size={14}/></Link></Button>}>
          <KeyValues items={[
            ['Stations', stations.length],
            ['Control mode', `${stations.filter(station=>station.mode==='automatic').length} automatic · ${stations.filter(station=>station.mode==='manual').length} manual`],
            ['Saved workspace revision', revision ? `r${revision}` : 'No revision loaded'],
          ]}/>
        </Surface>
        <Surface title={<><AlertTriangle/>Workspace design issues</>} sub="Open the editor for the affected object."
          actions={<Button variant="outline" size="sm" asChild><Link to="/release-readiness">Review readiness<ArrowRight size={14}/></Link></Button>}>
          {issues.length ? <RefTable headers={['Object','Issue','Editor']} rows={issues.map(issue=>{
            const target=issueEditors[issue.category as keyof typeof issueEditors] ?? '/release-readiness';
            const station=workspaceModel.stations.find(item=>item.id===issue.object);
            return [<strong>{issue.object}</strong>,issue.message,<Link className="ref-issue-link" to={target}
              onClick={()=>{if(station) select(station.id);}}>{issue.category}<ArrowRight size={13}/></Link>];
          })}/> : <p className="ref-empty"><CheckCircle2 size={16}/>No engineering validation issues in this workspace.</p>}
        </Surface>
        <Surface title={<><Network/>Stations</>} sub={model.name}>
          {stations.length ? <div className="ref-station-tiles">{stations.map(station=>
            <Button variant="outline" key={station.id} asChild><Link to="/workstations" onClick={()=>select(station.id)}>
              <Box size={19}/><span>{station.id}<strong>{station.name}</strong></span><Badge tone={station.mode==='automatic'?'cyan':'neutral'}>{station.mode}</Badge>
            </Link></Button>)}</div> : <p className="ref-empty">No stations configured for this line. <Link className="ref-issue-link" to="/line-engineering">Configure line</Link></p>}
        </Surface>
      </div>
      <div className="ref-stack">
        <Surface title={native && site ? 'Factory engineering workflow' : 'Engineering workflow'}>
          <nav aria-label="Engineering workflow"><ol className="ref-journey">{steps.map(({to,title,detail,icon:Icon})=>
            <li key={to}><Link to={to} search={site ? {site} : {}}><Icon size={18} aria-hidden="true"/>
              <span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={15} aria-hidden="true"/></Link></li>)}</ol></nav>
        </Surface>
        <Surface title="Engineering reviews">
          <Link to="/approvals" className="ref-issue-link">Open approval chain<ArrowRight size={15}/></Link>
        </Surface>
      </div>
    </div>
  </ReferencePage>;
}

function EmptyStationPage({title}:{title:string}) {
  return <ReferencePage title={title}><ScopeSelectors/><Surface title="No stations on this line">
    <Button asChild variant="outline"><Link to="/line-engineering">Configure line<ArrowRight size={14}/></Link></Button>
  </Surface></ReferencePage>;
}
export function AssetHierarchy() {
  const {model,selected,revision,lineId} = useEngineering();
  const station = model.stations.find(item=>item.id===selected) ?? model.stations[0];
  const [tab,setTab]=useState('Containment');
  const [dialog,setDialog]=useState<'draft'|'review'|null>(null);
  if (!station) return <EmptyStationPage title="Asset Model / Hierarchy"/>;
  const records=model.records.filter(item=>!item.archived && item.parent===station.id);
  const assets=records.filter(item=>item.kind==='equipment'||item.kind==='terminal'||item.kind==='node');
  const mappings=records.filter(item=>item.kind==='mapping');
  const changes=records.filter(item=>item.kind==='change');
  const mappingList=mappings.length ? <KeyValues items={mappings.map(record=>[record.name,record.binding||'Unbound'])}/> : <p className="ref-empty">No external IDs mapped to this station.</p>;
  return <ReferencePage title="Asset Model / Hierarchy" sub={`${model.scope} / ${model.name}`} actions={<DetailLinks/>}>
    <div className="ref-hierarchy-grid"><StationList tree/><Surface title={<><Settings2/>{station.id} {station.name}<Badge>Working draft</Badge></>}
      sub={`${lineId} · ${model.name}`} actions={<div className="ref-actions">
        <Button variant="outline" size="sm" onClick={()=>setDialog('draft')}><FileText size={14}/>Save draft</Button>
        <Button size="sm" onClick={()=>setDialog('review')}><Check size={14}/>Submit for review</Button>
      </div>}>
      <RefTabs items={['Containment','Material flow','External IDs','Revision history']} value={tab} onChange={setTab}/>
      {tab==='Containment'?<>
        <div className="ref-containment-grid"><div className="ref-containment-bands">
          <div className="ref-containment-band"><Network size={26}/><div><small>Logical station</small><b>{station.id}</b></div><div><small>Control mode</small>{station.mode}</div><div><small>Operation</small>{station.operation||'Unbound'}</div></div>
          {assets.map(asset=><div className="ref-containment-band" key={asset.kind+asset.id}>
            {asset.kind==='equipment'?<Box size={24}/>:asset.kind==='node'?<Server size={24}/>:<Monitor size={24}/>}
            <div><small>{asset.kind}</small><b>{asset.name}</b></div><div><small>Asset ID</small>{asset.id}</div><div><small>Revision</small>{asset.version||'Unspecified'}</div>
          </div>)}
          {!assets.length && <p className="ref-empty px-3">No asset records assigned. <Link to="/workstations" className="ref-issue-link">Configure station</Link></p>}
        </div><div className="ref-stack">
          <Surface title="External identity map">{mappingList}</Surface>
          <Surface title="Revision summary"><KeyValues items={[['Last loaded revision',revision?`r${revision}`:'No saved revision loaded'],['Change reason',model.reason||'No reason entered']]}/></Surface>
        </div></div>
        <Surface title="Draft proposals">
          {changes.length?<RefTable headers={['Change','Description','Revision']} rows={changes.map(change=>[change.name,change.description,change.version])}/>:<p className="ref-empty">No draft proposals recorded for this station.</p>}
        </Surface>
      </>:tab==='External IDs'?<Surface title="External identity map">{mappingList}<Button variant="outline" asChild><Link to="/mes-integration">Review mappings</Link></Button></Surface>
      :tab==='Material flow'?<Surface title="Material flow"><div className="ref-mini-flow">{model.stations.map((item,index)=><span key={item.id}>{item.id}{index<model.stations.length-1 && <ArrowRight size={15}/>}</span>)}</div><Button variant="outline" asChild><Link to="/line-engineering">Open topology</Link></Button></Surface>
      :<WorkspaceHistory/>}
    </Surface></div>
    <DraftDialog open={dialog!==null} review={dialog==='review'} onClose={()=>setDialog(null)}/>
  </ReferencePage>;
}

export function StationComposition() {
  const {model,selected,revision,workspaceModel} = useEngineering();
  const station = model.stations.find(item=>item.id===selected) ?? model.stations[0];
  const [tab,setTab]=useState('Equipment');
  if (!station) return <EmptyStationPage title="Station Composition Editor"/>;
  const children=model.records.filter(record=>!record.archived && record.parent===station.id);
  const parts=children.filter(record=>record.kind==='equipment'||record.kind==='terminal');
  const commands=children.filter(record=>record.kind==='command');
  const hosts=children.filter(record=>record.kind==='node');
  const conflicts=station.equipment.filter(id=>workspaceModel.stations.some(other=>other.id!==station.id&&other.equipment.includes(id)));
  return <ReferencePage title="Station Composition Editor" sub={`${station.id} · ${station.name}`} actions={<ScopeSelectors/>}>
    <DetailLinks/><div className="ref-composition-grid"><StationList/><div className="ref-stack">
      <RefTabs items={['Equipment','Process','Apps','Signals','History']} value={tab} onChange={setTab}/>
      {tab==='Equipment'?<Surface title={`Logical station · ${station.name}`} actions={<AddRecord kind="equipment"/>}>
        <div className="ref-composition-diagram"><div className="ref-logical-node"><Server size={21}/><b>{station.id}</b><strong>{station.name}</strong><small>Logical station</small></div>
          <div className="ref-composition-branches">{parts.map(asset=><Link to={asset.kind==='terminal'?'/terminals':'/machines'} key={asset.kind+asset.id}>
            {asset.kind==='terminal'?<Monitor size={21}/>:<Box size={21}/>}<span>{asset.name}</span><Badge>{asset.id}</Badge>
          </Link>)}</div></div>
        <h3 className="ref-section-label">Asset assignments</h3>
        {parts.length?<RefTable headers={['Asset ID','Role','Binding','Revision','Actions']} rows={parts.map(asset=>[asset.id,asset.name,asset.binding||'Unbound',asset.version,<RecordActions record={asset}/>])}/>
          :<p className="ref-empty">Add an equipment record to configure this station’s assets.</p>}
        {!!station.equipment.filter(id=>!parts.some(part=>part.id===id)).length && <KeyValues items={[['Other assigned IDs',station.equipment.filter(id=>!parts.some(part=>part.id===id)).join(', ')]]}/>}
      </Surface>:tab==='History'?<WorkspaceHistory/>:<Surface title={`${tab} · ${station.id}`}>
        {tab==='Process'?<><KeyValues items={[['Operation',station.operation||'Unbound'],['Tracking',station.tracking],['Challenge workflow',station.challengeBound?'Assigned in draft':'Unassigned']]}/>
          <Button variant="outline" asChild><Link to="/asset-steps">Configure production steps</Link></Button></>
          :tab==='Apps'?<><KeyValues items={[['Application',station.app||'Unbound']]}/><Button variant="outline" asChild><Link to="/edge-app-studio">Edit workflow</Link></Button></>
          :<Button variant="outline" asChild><Link to="/station-connectivity">Inspect signal bindings</Link></Button>}
      </Surface>}
    </div><aside className="ref-stack">
      <Surface title="Station capabilities"><KeyValues items={[['Configured commands',commands.length],['Equipment records',parts.filter(part=>part.kind==='equipment').length],['Terminal records',parts.filter(part=>part.kind==='terminal').length]]}/></Surface>
      <Surface title="Edge runtime">{hosts.length?<KeyValues items={hosts.map(host=>[host.name,host.version])}/>:<p className="ref-empty">No edge node assigned directly to this station.</p>}<Link to="/edge-fleet" className="ref-issue-link">Inspect fleet<ArrowRight size={14}/></Link></Surface>
      <Surface title="Change & deployment"><KeyValues items={[['Engineering revision',revision?`r${revision}`:'No saved revision loaded']]}/><Link to="/deployments" className="ref-issue-link">View deployments<ArrowRight size={14}/></Link></Surface>
      <Surface title="Assignment rules"><Notice tone={conflicts.length?'warn':'good'}>{conflicts.length?`Equipment also assigned to other stations: ${conflicts.join(', ')}`:'No duplicate equipment assignments found for this station.'}</Notice></Surface>
    </aside></div></ReferencePage>;
}
export function EquipmentComponents(){
 const {model,selected,select}=useEngineering();const {rows:equipment,put}=useRecords('equipment');const station=model.stations.find(s=>s.id===selected)??model.stations[0];
 const [part,setPart]=useState(''),[tab,setTab]=useState('Details'),[dialog,setDialog]=useState(false);
 const parts=equipment.filter(r=>r.parent===station?.id||station?.equipment.includes(r.id));const asset=parts.find(r=>r.id===part)??parts[0];
 const machine=asset?.machine;const updateMachine=(key:string,value:string)=>{if(!asset)return;const base=machine??{model:asset.name,vendor:'',ipAddress:'',port:4840,protocol:'OPC-UA' as const,receivedDataTypes:'',sentDataTypes:''};put({...asset,machine:{...base,[key]:key==='port'?Number(value):value}});};
 return <ReferencePage title="Equipment Components" sub={`${model.scope} / ${model.name} / ${station?.id??'No station'} · Shared engineering draft`} actions={<><ScopeSelectors/><Badge tone="cyan">Draft</Badge></>}><DetailLinks/>
 <div className="ref-equipment-grid"><Surface title="Asset composition" sub={`${parts.length} physical components`} actions={<AddRecord kind="equipment"/>} className="ref-asset-list"><label className="ref-form-line">Station<select aria-label="Equipment station" value={station?.id??''} onChange={e=>{select(e.target.value);setPart('');}}>{model.stations.map(s=><option key={s.id} value={s.id}>{s.id} {s.name}</option>)}</select></label><div className="ref-tree-root"><ChevronDown size={14}/><Box size={20}/><b>{station?.name??'No station selected'}</b></div>{parts.map(r=><Button variant="ghost" key={r.id} onClick={()=>setPart(r.id)} className={`ref-component-row ${asset?.id===r.id?'is-selected':''}`}><Radio size={19}/><strong>{r.id}</strong>{r.name}</Button>)}</Surface>
 {asset?<Surface title={<><Radio className="text-primary"/>{asset.id} {asset.name}</>} sub={`Physical asset · ${asset.parent}`} actions={<><RecordActions record={asset}/><Button variant="outline" size="sm" onClick={()=>setDialog(true)}><Save size={14}/>Save draft</Button></>}>
 <RefTabs items={['Details','Assignment','Calibration','Change History']} value={tab} onChange={setTab}/>
 {tab==='Details'?<><div className="ref-two-col"><Surface title="Asset information"><label className="ref-form-line">Name<input aria-label="Asset name" value={asset.name} onChange={e=>put({...asset,name:e.target.value})}/></label><label className="ref-form-line">Description<textarea aria-label="Asset description" value={asset.description} onChange={e=>put({...asset,description:e.target.value})}/></label><label className="ref-form-line">Serial / configured value<input value={asset.value} onChange={e=>put({...asset,value:e.target.value})}/></label><label className="ref-form-line">Version<input value={asset.version} onChange={e=>put({...asset,version:e.target.value})}/></label></Surface><Surface title={<><Lock size={14}/>Production configuration</>}><KeyValues items={[["Station",asset.parent],["Logical signal",asset.binding||'Unassigned'],["Production acknowledgement","Not verified"]]}/><Notice>Approved revisions are immutable. This editor changes the engineering draft only.</Notice></Surface></div>
 <Surface title="Machine configuration"><div className="ref-form-grid">{(['model','vendor','ipAddress','port','firmware','receivedDataTypes','sentDataTypes','outputLabel','acceptCommand','rejectCommand'] as const).map(key=><label key={key}>{({model:'Model',vendor:'Vendor',ipAddress:'IP address',port:'Port',firmware:'Firmware',receivedDataTypes:'Received data types',sentDataTypes:'Sent data types',outputLabel:'Output label',acceptCommand:'Accept command',rejectCommand:'Reject command'})[key]}<input aria-label={`Machine ${key}`} value={machine?.[key]??''} type={key==='port'?'number':'text'} onChange={e=>updateMachine(key,e.target.value)}/></label>)}<label>Protocol<select aria-label="Machine protocol" value={machine?.protocol??'OPC-UA'} onChange={e=>updateMachine('protocol',e.target.value)}>{['OPC-UA','MQTT','Modbus-TCP','EtherNet/IP','Profinet','REST'].map(p=><option key={p}>{p}</option>)}</select></label><label>Output kind<select value={machine?.outputKind??'none'} onChange={e=>updateMachine('outputKind',e.target.value)}>{['none','text','file'].map(p=><option key={p}>{p}</option>)}</select></label></div></Surface></>:tab==='Assignment'?<Surface title="Station assignment"><label>Station<select aria-label="Asset station assignment" value={asset.parent} onChange={e=>put({...asset,parent:e.target.value})}>{model.stations.map(s=><option key={s.id} value={s.id}>{s.id} {s.name}</option>)}</select></label><label>Logical signal<input aria-label="Asset signal binding" value={asset.binding} onChange={e=>put({...asset,binding:e.target.value})}/></label></Surface>:tab==='Calibration'?<Surface title="Calibration evidence"><Notice>Calibration is not verified. Evidence and commissioning remain separate from draft configuration.</Notice><Button variant="outline" asChild><Link to="/commissioning">Open commissioning evidence</Link></Button></Surface>:<Surface title="Change history"><KeyValues items={[["Draft version",asset.version],["Identity",asset.id]]}/><Button variant="outline" asChild><Link to="/changes">Open immutable revision history</Link></Button></Surface>}
 </Surface>:<Notice>No equipment assigned to this station.</Notice>}</div><DraftDialog open={dialog} onClose={()=>setDialog(false)}/></ReferencePage>;
}

export function TerminalsPeripherals() {
  const {model,selected,select,setModel,revision} = useEngineering();
  const station = model.stations.find(item=>item.id===selected) ?? model.stations[0];
  const [tab,setTab]=useState('Station Configuration');
  const [deviceId,setDeviceId]=useState('');
  const [dialog,setDialog]=useState(false);
  const {rows,put}=useRecords('terminal');
  if (!station) return <EmptyStationPage title="Terminals & Peripherals"/>;
  const devices=rows.filter(device=>device.parent===station.id);
  const device=devices.find(item=>item.id===deviceId) ?? devices[0];
  return <ReferencePage title="Terminals & Peripherals" sub={`${model.name} · ${station.id} ${station.name}`} actions={<ScopeSelectors/>}>
    <DetailLinks/>
    <label className="ref-terminal-station">Station<select value={station.id} onChange={event=>select(event.target.value)}>
      {model.stations.map(item=><option key={item.id} value={item.id}>{item.id} {item.name}</option>)}
    </select></label>
    <RefTabs items={['Station Configuration','Connectivity','App Binding','Tests & Verification','Change History']} value={tab} onChange={setTab}/>
    {tab==='Change History'?<WorkspaceHistory/>:<div className="ref-terminal-grid">
      <Surface title="Terminals & peripherals" sub={station.name} actions={<AddRecord kind="terminal"/>}>
        <div className="ref-device-tiles">{devices.map(item=><Button variant="outline" key={item.id} onClick={()=>setDeviceId(item.id)}
          aria-pressed={device?.id===item.id} className={device?.id===item.id?'is-selected':''}><Monitor size={24}/><strong>{item.id}</strong><small>{item.name}</small></Button>)}</div>
        {!devices.length && <p className="ref-empty">No terminals assigned to this station.</p>}
      </Surface>
      {tab==='Station Configuration'?<Surface title="Station configuration">
        <KeyValues items={[['Mode',station.mode],['Operation',station.operation||'Unbound'],['Application',station.app||'Unbound'],['Assigned devices',devices.length],['Saved workspace revision',revision?`r${revision}`:'No revision loaded']]}/>
      </Surface>:tab==='App Binding'?<Surface title="Application binding">
        <label>Station application<input value={station.app} onChange={e=>setModel({...model,stations:model.stations.map(item=>item.id===station.id?{...item,app:e.target.value}:item)})}/></label>
        <Button variant="outline" className="mt-3" asChild><Link to="/edge-app-studio">Open workflow editor<ArrowRight size={14}/></Link></Button>
      </Surface>:tab==='Connectivity'?<Surface title="Device connectivity" sub={device?.name}>
        {device?<><label>Signal binding<input value={device.binding} onChange={e=>put({...device,binding:e.target.value})}/></label>
          <KeyValues items={[['Device revision',device.version],['Unit',device.unit||'Unspecified'],['Live connection','Unverified']]}/></>
          :<p>Select a station with a configured device.</p>}
      </Surface>:device?<DeviceReadTest key={device.parent+device.id} device={device}/>:<Surface title="Local read test"><p>Select a station with a configured device.</p></Surface>}
      <Surface title={device?.name??'Device details'} actions={device?<RecordActions record={device}/>:undefined}>
        {device?<KeyValues items={[['Device ID',device.id],['Configured version',device.version],['Configured value',device.value||'Unspecified'],['Unit',device.unit||'Unspecified']]}/>:<p>No device selected.</p>}
        <div className="ref-actions ref-terminal-actions"><Button onClick={()=>setDialog(true)}><Save size={15}/>Save draft</Button></div>
      </Surface>
    </div>}
    <DraftDialog open={dialog} onClose={()=>setDialog(false)}/>
  </ReferencePage>;
}

function DeviceReadTest({device}:{device:{name:string;value:string;unit:string;id:string}}) {
  const [value,setValue]=useState(device.value);
  const [reads,setReads]=useState<{value:string;time:string}[]>([]);
  return <Surface title="Local read test" sub={`Simulate an input for ${device.name}.`}>
    <form onSubmit={event=>{event.preventDefault(); if(value.trim())setReads([{value:value.trim(),time:new Date().toLocaleTimeString()},...reads].slice(0,8));}}>
      <label>Simulated value{device.unit ? ` (${device.unit})` : ''}<input required value={value} onChange={event=>setValue(event.target.value)}/></label>
      <Button variant="outline" type="submit" className="ref-full-button" disabled={!value.trim()}><Activity size={16}/>Run simulated read</Button>
    </form>
    <p role="status" className="ref-empty">{reads.length ? `Simulated input recorded for ${device.id}.` : 'No simulated reads for this device.'}</p>
    {!!reads.length && <RefTable headers={['Time','Simulated value','Unit']} rows={reads.map(read=>[read.time,read.value,device.unit||'—'])}/>}
    <Link to="/commissioning" className="ref-issue-link">Review commissioning evidence<ArrowRight size={14}/></Link>
  </Surface>;
}
