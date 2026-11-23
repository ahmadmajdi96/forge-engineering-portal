import {useEngineering} from "@/lib/engineering/context";
import {deliveryHistory} from "@/lib/production/release.functions";
import {createFileRoute} from '@tanstack/react-router';
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
      {sys.error?<p className="text-sm text-destructive">Sign in to view connection state.</p>:<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{(sys.data??[]).map(s=><div key={s.id} className="rounded-md border border-border bg-card p-3"><div className="flex items-center justify-between"><strong>{s.id}</strong><Badge variant={tone(s.state)}>{s.state}</Badge></div><p className="text-xs text-muted-foreground">{s.name}</p><p className="mt-1 text-xs">{s.role}</p><p className="mt-1 text-xs text-muted-foreground">{s.detail}</p></div>)}</div>}
    </section>
    <section aria-labelledby="ob">
      <h2 id="ob" className="mb-2 font-medium">Historical sandbox events</h2>
      <p className="mb-3 text-sm text-muted-foreground">Review and publication use the factory release workspace.</p>
      <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-sm"><thead className="bg-muted text-left"><tr>{['Consumer','Event','Rev','Hash','Delivery','Business','Attempts','Note'].map(h=><th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead><tbody>
        {(out.data??[]).length===0&&<tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">No messages queued yet.</td></tr>}
        {(out.data??[]).map(m=><tr key={m.id} className="border-t border-border"><td className="px-3 py-2">{m.consumer}</td><td className="px-3 py-2">{m.event_type}</td><td className="px-3 py-2">r{m.revision}</td><td className="px-3 py-2 font-mono text-xs">{m.content_hash.slice(0,12)}…</td><td className="px-3 py-2"><Badge variant={tone(m.technical_status)}>{m.technical_status}</Badge></td><td className="px-3 py-2"><Badge variant={tone(m.business_status)}>{m.business_status}</Badge></td><td className="px-3 py-2">{m.attempts}</td><td className="px-3 py-2 text-xs text-muted-foreground">{m.business_reason??m.last_error??''}</td></tr>)}
      </tbody></table></div>
    </section></div>;}

function Integrations(){
  const {native,site}=useEngineering();
  return native ? <Deliveries site={site}/> : <Page/>;
}
function Deliveries({site}:{site:string|undefined}){
  const query=useQuery({queryKey:["factory-deliveries",site],enabled:!!site,queryFn:()=>deliveryHistory({data:{site:site!}}),refetchInterval:15000});
  return <section className="space-y-4"><h1 className="font-display text-2xl font-semibold">System integrations</h1>
    <h2 className="font-medium">Release outbox</h2>
    {query.error && <p role="alert">{query.error.message}</p>}
    {query.data?.length===0 && <p>No release deliveries queued for this factory.</p>}
    <div className="overflow-auto"><table className="eng-table"><thead><tr>{["Consumer","Release","Delivery","Business acknowledgement","Attempts"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{query.data?.map(r=><tr key={r.event_id}><td>{r.consumer}</td><td>{r.release_id}</td><td>{r.send_state}</td><td>{r.business_state}</td><td>{r.attempts}</td></tr>)}</tbody></table></div></section>;
}
