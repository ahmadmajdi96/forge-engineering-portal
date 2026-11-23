import {useEngineering} from "@/lib/engineering/context";
import {deliveryHistory} from "@/lib/production/release.functions";
import {Button} from "@/components/ui/button";
import {createFileRoute,Link} from '@tanstack/react-router';
import {useServerFn} from '@tanstack/react-start';
import {useQuery} from '@tanstack/react-query';
import {Badge} from '@/components/ui/badge';
import {systemStatus,listOutbox} from '@/lib/integrations/integrations.functions';
const t='System integrations · Engineering Portal',d='Connection state, release outbox and business acknowledgements with PLMS, MES, RMS, QMS and access hub.';
export const Route=createFileRoute('/integrations')({head:()=>({meta:[{title:t},{name:'description',content:d},{property:'og:title',content:t},{property:'og:description',content:d},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:Integrations});
const tone=(s:string)=>s==='Connected'||s==='Accepted'||s==='Sent'?'default':s==='Rejected'||s==='Failed'?'destructive':'secondary';
function Page(){
  const st=useServerFn(systemStatus),lo=useServerFn(listOutbox);
  const sys=useQuery({queryKey:['int-sys'],queryFn:()=>st(),retry:false});const out=useQuery({queryKey:['int-out'],queryFn:()=>lo(),retry:false});
  return <div className="space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">System integrations</h1><p className="text-sm text-muted-foreground">Acceptance is recorded only from signed messages sent by the receiving system. Unconfigured systems stay Unknown and block readiness.</p></header>
    <section aria-labelledby="sys"><h2 id="sys" className="mb-2 font-medium">Connected systems</h2>
      {sys.isPending && <p role="status">Loading connected systems…</p>}
      {sys.error?<div role="alert" className="text-sm">Connection state unavailable. <Button variant="outline" onClick={()=>void sys.refetch()}>Retry</Button></div>:<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{(sys.data??[]).map(s=><div key={s.id} className="rounded-md border border-border bg-card p-3"><div className="flex items-center justify-between"><strong>{s.id}</strong><Badge variant={tone(s.state)}>{s.state}</Badge></div><p className="text-xs text-muted-foreground">{s.name}</p><p className="mt-1 text-xs">{s.role}</p><p className="mt-1 text-xs text-muted-foreground">{s.detail}</p></div>)}</div>}
    </section>
    <section aria-labelledby="ob">
      <h2 id="ob" className="mb-2 font-medium">Historical sandbox events</h2>
      <p className="mb-3 text-sm text-muted-foreground">Review and publication use the factory release workspace.</p>
      {out.isPending && <p role="status">Loading historical events…</p>}
      {out.error && <div role="alert">Delivery history unavailable. <Button variant="outline" onClick={()=>void out.refetch()}>Retry</Button></div>}
      <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-sm"><thead className="bg-muted text-left"><tr>{['Consumer','Event','Rev','Hash','Delivery','Business','Attempts','Note'].map(h=><th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead><tbody>
        {out.data?.length===0&&<tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">No messages queued yet.</td></tr>}
        {(out.data??[]).map(m=><tr key={m.id} className="border-t border-border"><td className="px-3 py-2">{m.consumer}</td><td className="px-3 py-2">{m.event_type}</td><td className="px-3 py-2">r{m.revision}</td><td className="px-3 py-2 font-mono text-xs">{m.content_hash.slice(0,12)}…</td><td className="px-3 py-2"><Badge variant={tone(m.technical_status)}>{m.technical_status}</Badge></td><td className="px-3 py-2"><Badge variant={tone(m.business_status)}>{m.business_status}</Badge></td><td className="px-3 py-2">{m.attempts}</td><td className="px-3 py-2 text-xs text-muted-foreground">{m.business_reason??m.last_error??''}</td></tr>)}
      </tbody></table></div>
    </section></div>;}

function Integrations(){
  const {native,site}=useEngineering();
  return native ? <Deliveries site={site}/> : <Page/>;
}
function Deliveries({site}:{site:string|undefined}){
  const query=useQuery({queryKey:["factory-deliveries",site],enabled:!!site,retry:false,queryFn:()=>deliveryHistory({data:{site:site!}}),refetchInterval:15000});
  return <section className="space-y-4"><header><h1 className="font-display text-2xl font-semibold">System integrations</h1>
    <p className="text-sm text-muted-foreground">Track package delivery and the receiving system’s acknowledgement.</p></header>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Release outbox</h2>
      {site && <Button asChild variant="outline"><Link to="/factory-releases" search={{site}}>Open factory releases</Link></Button>}</div>
    {!site && <p role="status">Choose a factory to view its deliveries.</p>}
    {site && query.isPending && <p role="status">Loading deliveries…</p>}
    {query.error && <div role="alert">{query.error.message} <Button variant="outline" onClick={()=>void query.refetch()}>Retry</Button></div>}
    {query.data?.length===0 && <p className="rounded-lg border border-dashed p-4 text-sm">No release deliveries queued for this factory.</p>}
    {!!query.data?.length && <div className="max-w-full overflow-auto rounded-lg border" role="region" aria-label="Release delivery records" tabIndex={0}>
      <table className="w-full min-w-[36rem] text-left text-sm"><thead className="bg-muted"><tr>{["Consumer","Release","Delivery","Business acknowledgement","Attempts"].map(h=><th className="px-3 py-2" scope="col" key={h}>{h}</th>)}</tr></thead>
      <tbody>{query.data.map(r=><tr key={r.event_id} className="border-t"><th scope="row" className="px-3 py-3 font-medium">{r.consumer}</th>
        <td className="max-w-52 break-all px-3 py-3 font-mono text-xs">{r.release_id}</td><td className="px-3 py-3"><Badge variant={r.send_state==="dead"?"destructive":"outline"}>{r.send_state}</Badge></td>
        <td className="px-3 py-3"><Badge variant={r.business_state==="rejected"?"destructive":"secondary"}>{r.business_state}</Badge></td><td className="px-3 py-3">{r.attempts}</td></tr>)}</tbody></table></div>}
  </section>;
}
