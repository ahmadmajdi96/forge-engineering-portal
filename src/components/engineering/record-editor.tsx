import {useEffect, useRef, useState, type ReactNode} from 'react';
import {Plus,Pencil,Copy,Archive,Save,X,Search,ArrowUp,ArrowDown,Download,Database} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useEngineering} from '@/lib/engineering/context';
import {activeRecords,archiveDesignRecord,upsertDesignRecord,recordKinds,type DesignRecord,type RecordKind} from '@/lib/engineering/design-records';
import {toast} from 'sonner';
import {useRouterState} from '@tanstack/react-router';
import {workspaceForPath} from '@/lib/engineering/navigation';
import {duplicateDesignRecord} from '@/lib/engineering/design-records';
import {placedHardware,updateHardware,archiveHardware} from '@/lib/engineering/hardware-lifecycle';
import {removeStation} from '@/lib/engineering/asset-registry';

function RecordDialog({label, onClose, wide=false, children}: {
  label: string; onClose: () => void; wide?:boolean; children: ReactNode;
}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;
    dialog?.showModal();
    return ()=>dialog?.close();
  },[]);
  return <dialog ref={ref} aria-label={label} className={wide ? 'dyn-data-drawer ref-native-dialog' : 'ref-modal ref-native-dialog'}
    onCancel={event=>{event.preventDefault();onClose();}}>{children}</dialog>;
}

export function useRecords(kind:RecordKind) {
  const {model,workspaceModel,setWorkspaceModel}=useEngineering();
  const rows=activeRecords(model.records,kind);
  function put(record:DesignRecord) {
    try{
      const next=placedHardware(record) ? updateHardware(workspaceModel,record)
        : {...workspaceModel,records:upsertDesignRecord(workspaceModel.records,record)};
      setWorkspaceModel(next);
      return true;
    }catch(error){toast.error(error instanceof Error?error.message:'Edit refused');return false;}
  }
  function remove(id:string){
    const record=workspaceModel.records.find(r=>r.id===id&&r.kind===kind);
    if(!record)return false;
    try{setWorkspaceModel(archiveHardware(workspaceModel,record));return true;}
    catch(error){toast.error(error instanceof Error?error.message:'Archive refused');return false;}
  }
  return {rows,put,remove};
}
export function RecordEditor({kind,record,onClose}:{kind:RecordKind;record?:DesignRecord|undefined;onClose:()=>void}){
  const {put}=useRecords(kind);
  const {selected,lineId,workspaceModel:model}=useEngineering();
  const [draft,setDraft]=useState<DesignRecord>(record??{id:kind.toUpperCase()+'-'+crypto.randomUUID().slice(0,8),kind,name:'',parent:['equipment','terminal','command'].includes(kind)?selected:lineId,version:'r1',description:'',binding:'',unit:'',value:'',required:false,archived:false});
  const [error,setError]=useState('');
  const hardware=placedHardware(draft);
  const setField=(key:keyof DesignRecord,value:string)=>setDraft({...draft,[key]:value});
  function submit(){
    if(!draft.name.trim()||!draft.id.trim()){setError('Enter a name and identifier.');return;}
    if(!record && model.records.some(r=>r.id===draft.id&&r.kind===kind)){setError('This identifier already exists for this type.');return;}
    if(put({...draft,name:draft.name.trim()}))onClose();
    else setError('The draft could not be applied. Review the field values and dependencies.');
  }
  return <RecordDialog label={record?'Edit record':'Create record'} onClose={onClose}><header><h2>{record?'Edit':'Create'} {kind}</h2><Button variant="ghost" size="icon" aria-label="Close editor" onClick={onClose}><X size={16}/></Button></header>
    <form onSubmit={e=>{e.preventDefault();submit();}}><div className="ref-form-grid">
      {(['id','name','version','binding','unit','value'] as const).map(key=><label key={key}>{({id:'Record ID',name:'Name',version:'Revision label',binding:'Signal or source reference',unit:'Unit',value:kind==='equipment'?'Serial identifier':'Configured value'})[key]}
        <input required={key==='id'||key==='name'} disabled={key==='id'&&!!record} aria-label={key==='name'?'Record name':key} value={draft[key]} onChange={e=>setField(key,e.target.value)}/></label>)}
      {hardware?<label>Station<select value={draft.parent} disabled={!!record} onChange={e=>setField('parent',e.target.value)}><option value="">Unassigned</option>{model.stations.map(st=><option key={st.id} value={st.id}>{st.id} · {st.name}</option>)}</select>{record && <small>Use Station assignment to review a move.</small>}</label>:<label>Parent record<input value={draft.parent} onChange={e=>setField('parent',e.target.value)}/></label>}
      <label className="span-two">Description<textarea aria-label="Record description" value={draft.description} onChange={e=>setField('description',e.target.value)}/></label>
      {hardware && <><label>Hardware category<input list="hardware-categories" value={draft.hardware?.category??''} onChange={e=>setDraft({...draft,hardware:{...draft.hardware,category:e.target.value}})}/></label><datalist id="hardware-categories">{['Machine','Robot','Conveyor','Fixture','Sensor','Camera','Scanner','Scale','Printer','PLC','I/O','Gateway','Terminal','Industrial PC','HMI panel'].map(c=><option key={c}>{c}</option>)}</datalist>
        {(['manufacturer','modelNumber','capabilities','interfaces','document'] as const).map(key=><label key={key}>{({manufacturer:'Manufacturer',modelNumber:'Model number',capabilities:'Capabilities',interfaces:'Interfaces / ports',document:'Document reference'})[key]}<input value={draft.hardware?.[key]??''} onChange={e=>setDraft({...draft,hardware:{...draft.hardware,[key]:e.target.value}})}/></label>)}
        {(['widthM','depthM','heightM'] as const).map(key=><label key={key}>{({widthM:'Width',depthM:'Depth',heightM:'Height'})[key]} (m)<input min="0.000001" step="any" type="number" value={draft.hardware?.[key]??''} onChange={e=>setDraft({...draft,hardware:{...draft.hardware,[key]:e.target.value===''?undefined:e.target.valueAsNumber}})}/></label>)}</>}
    </div><label className="dyn-checkbox"><input type="checkbox" checked={draft.required} onChange={e=>setDraft({...draft,required:e.target.checked})}/>Required dependency</label>
    {error&&<p role="alert" className="text-destructive">{error}</p>}<footer><span>Save the workspace to retain this draft.</span><Button type="submit"><Save size={15}/>Apply to draft</Button></footer></form></RecordDialog>;
}
export function RecordActions({record}:{record:DesignRecord}){
  const [edit,setEdit]=useState(false),[confirm,setConfirm]=useState(false);
  const {put,remove}=useRecords(record.kind);
  return <div className="dyn-record-actions">
    <Button variant="ghost" size="icon" title="Edit record" aria-label={`Edit ${record.name}`} onClick={()=>setEdit(true)}><Pencil size={15}/></Button>
    {!['release','node'].includes(record.kind)&&<Button variant="ghost" size="icon" title="Duplicate record" aria-label={`Duplicate ${record.name}`} onClick={()=>{
      const newRecord=duplicateDesignRecord(record,record.kind.toUpperCase()+'-'+crypto.randomUUID().slice(0,8));
      if(put(newRecord))toast.success(placedHardware(record)?'Created an unassigned hardware draft. Find it in the registry.':'Created a draft copy.');
    }}><Copy size={15}/></Button>}
    <Button variant="ghost" size="icon" title="Archive record" aria-label={`Archive ${record.name}`} onClick={()=>setConfirm(true)}><Archive size={15}/></Button>
    {edit&&<RecordEditor kind={record.kind} record={record} onClose={()=>setEdit(false)}/>}
    {confirm&&<RecordDialog label="Archive record" onClose={()=>setConfirm(false)}><h2>Archive {record.name}?</h2><p className="ref-sub">{record.id} will leave active lists{record.parent?' and the composition of '+record.parent:''}. Active dependencies must be reassigned first. Saved revision history keeps this identity.</p><div className="ref-actions"><Button variant="outline" onClick={()=>setConfirm(false)}>Cancel</Button><Button variant="destructive" onClick={()=>{if(remove(record.id))setConfirm(false);}}>Archive</Button></div></RecordDialog>}
  </div>;
}
export function AddRecord({kind,label}:{kind:RecordKind;label?:string}){const [open,setOpen]=useState(false);return <><Button variant="outline" size="sm" aria-label={label??`Add ${kind}`} onClick={()=>setOpen(true)}><Plus size={14}/>{label??`Add ${kind}`}</Button>{open&&<RecordEditor kind={kind} onClose={()=>setOpen(false)}/>}</>;}

export function EngineeringDataDrawer({initialKind='station',label='Manage engineering records'}:{initialKind?:RecordKind|'station'|'signal'|'step';label?:string}){const {model,setModel,save,authenticated,canSave,busy,native,site,lineId}=useEngineering();const [open,setOpen]=useState(false),[kind,setKind]=useState<RecordKind|'station'|'signal'|'step'>(initialKind),[q,setQ]=useState(''),[edit,setEdit]=useState<Record<string,string>|null>(null),[index,setIndex]=useState(-1),[confirm,setConfirm]=useState<number|null>(null);
 const pathname=useRouterState({select:state=>state.location.pathname});
 const section=workspaceForPath(pathname)?.group;
 const studio=section==='Application Studio';
 const excluded=section==='Factory Engineering'?['app','screen','widget','release','review','change','evidence','test']:['app','screen','widget'];
 const kinds=studio?['step','app','screen','widget']:['station','signal',...recordKinds.filter(k=>!excluded.includes(k))];
 const fieldNames: Record<string,string> = {id:"ID",name:"Name",mode:"Control mode",equipment:"Equipment IDs (comma-separated)",app:"Application",operation:"Operation",key:"Signal key",address:"Source address",type:"Data type",unit:"Unit",maxAge:"Maximum age (seconds)",label:"Step label",kind:"Step type",signal:"Signal key",timeout:"Timeout (seconds)"};
 const list=kind==='station'?model.stations.map(r=>({id:r.id,name:r.name,details:r.mode})):kind==='signal'?model.signals.map(r=>({id:r.key,name:r.key,details:r.type+' · '+r.unit})):kind==='step'?model.steps.map(r=>({id:r.id,name:r.label,details:r.kind})):activeRecords(model.records,kind).map(r=>({id:r.id,name:r.name,details:r.version}));
 function start(i:number){setIndex(i);if(kind==='station'){const r=model.stations[i];setEdit(r?{id:r.id,name:r.name,mode:r.mode}:{id:'ST-'+Date.now().toString().slice(-5),name:'',mode:'manual'});}else if(kind==='signal'){const r=model.signals[i];setEdit(r?{key:r.key,address:r.address,type:r.type,unit:r.unit,maxAge:String(r.maxAge)}:{key:'',address:'',type:'Number',unit:'kg',maxAge:'60'});}else if(kind==='step'){const r=model.steps[i];setEdit(r?{id:r.id,label:r.label,kind:r.kind,signal:r.signal,timeout:String(r.timeout)}:{id:'step-'+crypto.randomUUID().slice(0,5),label:'',kind:'Work instruction',signal:'',timeout:'60'});}}
 function apply(){if(!edit)return;try{if(kind==='station'){if(!edit['name']?.trim()||!edit['id']?.trim())throw Error('ID and name are required.');if(model.archivedStations?.some(r=>r.id===edit['id'])||model.stations.some((r,i)=>i!==index&&r.id===edit['id']))throw Error('Station ID already exists.');const next={lineId:model.stations[index]?.lineId??lineId,id:edit['id'],name:edit['name'],mode:edit['mode']==='semi_auto'?'semi_auto' as const:edit['mode']==='automatic'?'automatic' as const:'manual' as const,equipment:model.stations[index]?.equipment??[],app:model.stations[index]?.app??'',operation:model.stations[index]?.operation??'',tracking:model.stations[index]?.tracking??'lot' as const,scaleBound:model.stations[index]?.scaleBound??false,challengeBound:model.stations[index]?.challengeBound??false};setModel({...model,stations:index<0?[...model.stations,next]:model.stations.map((r,i)=>i===index?{...r,...next}:r)});}else if(kind==='signal'){if(!edit['key']?.trim())throw Error('Semantic signal is required.');if(model.signals.some((r,i)=>i!==index&&r.key===edit['key']))throw Error('Signal already exists.');const next={...model.signals[index],key:edit['key'],address:edit['address']??'',type:(['Boolean','Uint32','Enum','Number'].includes(edit['type']??'')?edit['type']:'Number') as 'Boolean'|'Uint32'|'Enum'|'Number',unit:edit['unit']??'',expectedUnit:edit['unit']??'',maxAge:Math.max(1,Number(edit['maxAge'])||60),access:'Read' as const,quality:'Unavailable' as const,value:'—',age:0,required:false};setModel({...model,signals:index<0?[...model.signals,next]:model.signals.map((r,i)=>i===index?{...r,...next,quality:r.quality,value:r.value,age:r.age,required:r.required,access:r.access,expectedUnit:r.expectedUnit}:r)});}else if(kind==='step'){if(!edit['label']?.trim() || !edit['id']?.trim())throw Error('Step ID and label are required.');if(model.steps.some((step,i)=>i!==index&&step.id===edit['id']))throw Error('Step ID already exists.');const next={id:edit['id']??crypto.randomUUID(),label:edit['label'],kind:edit['kind']??'Work instruction',signal:edit['signal']??'',timeout:Math.max(1,Number(edit['timeout'])||60),evidence:true,failure:true};setModel({...model,steps:index<0?[...model.steps,next]:model.steps.map((r,i)=>i===index?{...r,...next,evidence:r.evidence,failure:r.failure}:r)});}setEdit(null);}catch(e){toast.error(e instanceof Error?e.message:'Edit failed');}}
 function remove(i:number){if(kind==='station'){const s=model.stations[i];if(s&&model.records.some(r=>!r.archived&&r.parent===s.id)){toast.error('Reassign or archive station dependencies first.');return;}if(s){try{setModel(removeStation(model,s.id));}catch(e){toast.error(e instanceof Error?e.message:'Remove refused');return;}}}else if(kind==='signal'){const s=model.signals[i];if(s&&model.steps.some(r=>r.signal===s.key)){toast.error('Rebind workflow steps before removing this signal.');return;}setModel({...model,signals:model.signals.filter((_,j)=>i!==j)});}else if(kind==='step')setModel({...model,steps:model.steps.filter((_,j)=>i!==j)});setConfirm(null);}
 function move(i:number,d:number){if(kind!=='step')return;const steps=[...model.steps],a=steps[i],b=steps[i+d];if(!a||!b)return;steps[i]=b;steps[i+d]=a;setModel({...model,steps});}
  return <><Button variant="outline" size="sm" className="dyn-manage-button" onClick={()=>{setKind(kinds.includes(initialKind)?initialKind:kinds[0] as typeof kind);setOpen(true);}}><Database size={14}/>{label}</Button>{open&&<RecordDialog wide label="Engineering records" onClose={()=>setOpen(false)}><header><h2>Engineering draft records</h2><Button variant="ghost" size="icon" aria-label="Close records" onClick={()=>setOpen(false)}><X size={18}/></Button></header><div className="dyn-data-toolbar"><select aria-label="Record type" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setQ('');}}>{kinds.map(k=><option key={k}>{k}</option>)}</select><label className="ref-search"><Search size={15}/><input aria-label="Search records" placeholder="Search records…" value={q} onChange={e=>setQ(e.target.value)}/></label>{['station','signal','step'].includes(kind)?<Button size="sm" onClick={()=>start(-1)}><Plus size={14}/>Create {kind}</Button>:<AddRecord kind={kind as RecordKind}/>}</div><div className="dyn-record-list">{list.map((r,i)=>(r.id+r.name).toLowerCase().includes(q.toLowerCase())&&<div className="dyn-record-row" key={r.id}><div><strong>{r.name}</strong><small>{r.id} · {r.details}</small></div>{['station','signal','step'].includes(kind)?<div className="dyn-record-actions"><Button variant="ghost" size="icon" aria-label={`Edit ${r.name}`} title="Edit" onClick={()=>start(i)}><Pencil size={14}/></Button>{kind==='step'&&<><Button variant="ghost" size="icon" title="Move up" disabled={i===0} aria-label={`Move ${r.name} up`} onClick={()=>move(i,-1)}><ArrowUp size={14}/></Button><Button variant="ghost" size="icon" title="Move down" disabled={i===list.length-1} aria-label={`Move ${r.name} down`} onClick={()=>move(i,1)}><ArrowDown size={14}/></Button></>}<Button variant="ghost" size="icon" title="Remove" aria-label={`Remove ${r.name}`} onClick={()=>setConfirm(i)}><Archive size={14}/></Button></div>:model.records.find(x=>x.id===r.id&&x.kind===kind)&&<RecordActions record={model.records.find(x=>x.id===r.id&&x.kind===kind) as DesignRecord}/>}</div>)}{!list.length ? <p className="ref-sub">No records. Create the first draft record.</p> : !list.some(r=>(r.id+r.name).toLowerCase().includes(q.toLowerCase())) && <p role="status" className="ref-empty">No matching records. <Button variant="outline" size="sm" onClick={()=>setQ('')}>Clear search</Button></p>}</div><footer><input aria-label="Workspace change reason" placeholder="Change reason (at least 3 characters)" value={model.reason} onChange={e=>setModel({...model,reason:e.target.value})}/><Button disabled={busy || !canSave || model.reason.trim().length<3} onClick={()=>void save()}><Save size={15}/>{busy?'Saving…':'Save workspace'}</Button><small>{native ? (authenticated ? `Factory workspace · ${site}` : 'Shared workspace access required') : (authenticated ? 'Verified sandbox account' : 'Verified sign-in required for shared saving')}</small></footer></RecordDialog>}{edit&&<RecordDialog label="Edit engineering item" onClose={()=>setEdit(null)}><header><h2>{index<0?'Create':'Edit'} {kind}</h2><Button variant="ghost" size="icon" aria-label="Cancel edit" onClick={()=>setEdit(null)}><X size={16}/></Button></header><form onSubmit={e=>{e.preventDefault();apply();}}>{Object.entries(edit).map(([key,value])=><label key={key}>{fieldNames[key] ?? key}{key==='mode' || key==='type' ?
  <select value={value} onChange={event=>setEdit({...edit,[key]:event.target.value})}>{(key==='mode'?['manual','automatic','semi_auto']:['Boolean','Uint32','Enum','Number']).map(option=><option value={option} key={option}>{option}</option>)}</select> :
  <input aria-label={fieldNames[key] ?? key} disabled={index>=0&&(key==='id'||key==='key')}
    type={key==='timeout'||key==='maxAge'?'number':'text'} min={1}
    required={['id','key','name','label','maxAge','timeout'].includes(key)} value={value} onChange={e=>setEdit({...edit,[key]:e.target.value})}/>}</label>)}<Button type="submit"><Save size={15}/>Apply item</Button></form></RecordDialog>}{confirm!==null&&<RecordDialog label="Remove engineering item" onClose={()=>setConfirm(null)}><h2>Remove draft item?</h2><p className="ref-sub">Saved revisions remain unchanged. Referenced dependencies must be reassigned first.</p><div className="ref-actions"><Button variant="outline" onClick={()=>setConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={()=>remove(confirm)}>Remove</Button></div></RecordDialog>}</>;
}