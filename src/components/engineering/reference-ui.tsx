import { useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Building2, Network, ChevronDown, ChevronRight, Folder, Settings2, Search, Info, CheckCircle2, AlertTriangle, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEngineering } from '@/lib/engineering/context';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from './common';
import {EngineeringDataDrawer} from './record-editor';
import {AssetFlowNav} from './asset-flow-nav';
import {AssetLineMetrics,AssetStationConfiguration} from './asset-context-panel';

export { Badge };
export function Surface({title,sub,children,actions,className=''}:{title?:ReactNode;sub?:string|undefined;children:ReactNode;actions?:ReactNode;className?:string}) {
  return <section className={`ref-surface ${className}`}>{title&&<header className="ref-surface-head"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{actions}</header>}<div className="ref-surface-body">{children}</div></section>;
}
export function ReferencePage({children,title,sub,crumb,actions,sourceLabel}:{children:ReactNode;title:string;sub?:string;crumb?:string;actions?:ReactNode;sourceLabel?:string}){
  const {dirty}=useEngineering();
  const assetPage=['Line Topology Designer','Production Steps','Station Composition Editor','Asset Model / Hierarchy','Terminals & Peripherals','Command Policy Editor'].includes(title)||title.startsWith('Signal bindings')||title.startsWith('Equipment')||title.startsWith('MD-104');
  return <div className="reference-page"><div className="ref-crumb"><Network size={14}/>Engineering<ChevronRight size={12}/>{crumb??title}<span className="ref-concept">{sourceLabel ?? 'DESIGN CONCEPT · SIMULATED DATA'}</span>{dirty && <span role="status" className="text-warning">Unsaved changes</span>}<EngineeringDataDrawer/></div><header className="ref-page-head"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div><div className="ref-actions">{actions}</div></header>{assetPage&&<AssetFlowNav/>}{title==='Line Topology Designer'&&<AssetLineMetrics/>}{(title==='Station Composition Editor'||title.startsWith('Signal bindings'))&&<AssetStationConfiguration/>}{children}</div>;
}
export function ScopeSelectors() {
  const {workspaceModel, lineId, selectLine} = useEngineering();
  const lines = workspaceModel.lines.filter(line => !line.archived);
  const plant = lines.find(line => line.id === lineId)?.plant ?? '';
  const plants = Array.from(new Set(lines.map(line => line.plant)));
  const plantLines = lines.filter(line => line.plant === plant);
  return <div className="ref-scope">
    <label><Building2 size={16}/><span>Plant<select aria-label="Plant" value={plant} disabled={!plants.length} onChange={event => {
      const line = lines.find(line => line.plant === event.target.value);
      if (line) selectLine(line.id);
    }}>
      {!plants.length && <option value="">No plants</option>}
      {plants.map(name => <option key={name}>{name}</option>)}
    </select></span></label>
    <label><Network size={16}/><span>Production line<select aria-label="Production line" value={lineId} disabled={!plantLines.length} onChange={event => selectLine(event.target.value)}>
      {!plantLines.length && <option value={lineId}>No lines</option>}
      {plantLines.map(line => <option value={line.id} key={line.id}>{line.id} {line.name}</option>)}
    </select></span></label>
  </div>;
}

export function RefTabs({items,value,onChange}:{items:string[];value:string;onChange:(t:string)=>void}) {
  return <div role="group" aria-label="Workspace views" className="ref-tabs">{items.map(item =>
    <Button variant="ghost" size="sm" key={item} aria-pressed={item===value}
      className={item===value?'is-active':''} onClick={()=>onChange(item)}>{item}</Button>)}</div>;
}

export function RefTable({headers,rows,selected,onSelect}:{headers:string[];rows:ReactNode[][];selected?:number;onSelect?:(i:number)=>void}) {
  const selectorColumn = headers[0] === '#' && headers.length > 1 ? 1 : 0;
  return <div className="ref-table-scroll"><table className="ref-table">
    <thead><tr>{headers.map((header,index)=><th key={index} scope="col">{header}</th>)}</tr></thead>
    <tbody>{rows.map((row,index)=><tr key={index} className={selected===index?'is-selected':''}
      data-selectable={onSelect ? true : undefined}
      onClick={onSelect ? event => {
        if (!(event.target as Element).closest('button,a,input,select,textarea')) onSelect(index);
      } : undefined}>
      {row.map((cell,column)=><td key={column}>{onSelect && column===selectorColumn ?
        <button type="button" className="ref-row-selector" aria-pressed={selected===index} onClick={()=>onSelect(index)}>{cell}</button>
        : cell}</td>)}
    </tr>)}</tbody>
  </table></div>;
}
export function KeyValues({items}:{items:[string,ReactNode][]}){return <dl className="ref-values">{items.map(([label,val])=><div key={label}><dt>{label}</dt><dd>{val}</dd></div>)}</dl>;}
export function Notice({children,tone='info'}:{children:ReactNode;tone?:'info'|'warn'|'good'}){const Icon=tone==='warn'?AlertTriangle:tone==='good'?CheckCircle2:Info;return <div className={`ref-notice ${tone}`}><Icon size={19}/><div>{children}</div></div>;}
export function StationList({tree=false}:{tree?:boolean}){const {model,selected,select,lineId}=useEngineering();const [q,setQ]=useState('');const matching=model.stations.filter(s=>(s.id+s.name).toLowerCase().includes(q.trim().toLowerCase()));return <Surface title={tree?'Asset Model / Hierarchy':`Production Line · Stations (${model.stations.length})`} sub={tree?'Engineering asset structure and configuration':undefined} className="ref-asset-list">{tree&&<><label className="ref-search"><Search size={14}/><input placeholder="Search assets…" aria-label="Search assets" value={q} onChange={e=>setQ(e.target.value)}/></label><div className="ref-tree-root"><ChevronDown size={12}/><Building2 size={16}/>{model.scope}</div><div className="ref-tree-root indent"><ChevronDown size={12}/><Folder size={16}/>Area A</div><div className="ref-tree-root indent-more"><ChevronDown size={12}/><Folder size={16}/>{lineId} {model.name}</div></>}<div className={tree?'ref-tree-stations':''}>{matching.map(s=><Button key={s.id} variant="ghost" aria-pressed={s.id===selected} className={`ref-station-row ${s.id===selected?'is-selected':''}`} onClick={()=>select(s.id)}>{tree&&<Settings2 size={14}/>}<span>{s.id}</span><strong>{s.name.replace(' (CCP)','').replace(' & Palletize','')}</strong>{!tree&&<Badge tone={s.mode==='automatic'?'cyan':'neutral'}>{s.mode==='automatic'?'Automatic':'Manual'}</Badge>}</Button>)}{!matching.length&&<p role="status" className="ref-empty">{q ? <>No matching stations. <Button variant="outline" size="sm" onClick={()=>setQ('')}>Clear search</Button></> : 'No stations on this line.'}</p>}</div>{tree&&<div className="ref-tree-footer"><h3><Network size={20}/>{lineId} {model.name}</h3><div className="ref-inline-stats"><div><small>Stations</small><b>{model.stations.length}</b></div><div><small>Automatic</small><b>{model.stations.filter(s=>s.mode==='automatic').length}</b></div><div><small>Manual</small><b>{model.stations.filter(s=>s.mode==='manual').length}</b></div></div></div>}</Surface>;}
export function DetailLinks(){return <nav className="ref-detail-links"><Link to="/registry">Hierarchy</Link><Link to="/workstations">Station composition</Link><Link to="/machines">Equipment components</Link><Link to="/terminals">Terminals & peripherals</Link><Link to="/station-connectivity">Signal bindings</Link><Link to="/command-policy">Command policy</Link></nav>;}
export function DraftDialog({open,onClose,review=false,title=review?'Submit engineering review':'Save engineering draft'}:{open:boolean;onClose:()=>void;title?:string;review?:boolean}) {
  const {model,setModel,save,busy,native,authenticated} = useEngineering();
  const trigger = useRef<HTMLElement | null>(null);
  return <Dialog open={open} onOpenChange={value=>{if(!value && !busy) onClose();}}>
    <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl"
      onOpenAutoFocus={()=>{trigger.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;}}
      onCloseAutoFocus={event=>{if(trigger.current?.isConnected){event.preventDefault();trigger.current.focus();}}}>
      <DialogHeader><DialogTitle>{title}</DialogTitle>
        <DialogDescription>{native ? 'Save a version of this factory’s engineering design for review.' : 'Save a version of the engineering design to the shared sandbox.'}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={async event=>{event.preventDefault();if(await save(review)) onClose();}}>
        <label className="grid gap-2 text-sm font-medium">Change reason
          <Input aria-label="Change reason" required minLength={3} maxLength={500} value={model.reason} onChange={event=>setModel({...model,reason:event.target.value})}/>
        </label>
        {!authenticated && <p className="text-sm text-muted-foreground">{native?'Shared workspace access is required to save a revision.':'Sign in with a verified sandbox account to save a revision.'}</p>}
        <DialogFooter><Button type="submit" disabled={!authenticated || busy || model.reason.trim().length<3}>
          <Save size={15}/>{busy?'Saving…':review?'Submit for review':'Save draft'}
        </Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
