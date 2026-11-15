import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import {SYSTEMS,canonical,sha256Hex,type ConnectionState} from './adapters';
export const systemStatus=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async()=>{
  return Promise.all(SYSTEMS.map(async s=>{const url=process.env[`${s.env}_URL`];const key=process.env[`${s.env}_API_KEY`];let state:ConnectionState='Unknown';let detail='Not configured — readiness blocked';
    if(url&&key){try{const r=await fetch(new URL('/api/public/health',url),{headers:{'x-api-key':key},signal:AbortSignal.timeout(4000)});state=r.ok?'Connected':'Unavailable';detail=r.ok?'Health check passed':`Health check returned ${r.status}`;}catch{state='Unavailable';detail='Unreachable';}}
    else if(url){detail='Endpoint set, API key missing';}
    return {...s,state,detail};}));});
export const listOutbox=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{const {data,error}=await context.supabase.from('integration_outbox').select('id,event_id,consumer,event_type,revision,content_hash,technical_status,business_status,business_reason,attempts,last_error,created_at').order('created_at',{ascending:false}).limit(100);if(error)throw new Error('Outbox unavailable');return data??[];});
export const queueRelease=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(i=>z.object({consumers:z.array(z.enum(['PLMS','MES'])).min(1)}).parse(i)).handler(async({data,context})=>{
  const {data:w}=await context.supabase.from('engineering_workspaces').select('id').eq('owner_id',context.userId).eq('scope','riyadh-pilot').maybeSingle();if(!w)throw new Error('Save an engineering revision first');
  const {data:r}=await context.supabase.from('engineering_revisions').select('revision,lifecycle,payload').eq('workspace_id',w.id).order('revision',{ascending:false}).limit(1).maybeSingle();if(!r)throw new Error('No revision to publish');
  if(r.lifecycle!=='In Review')throw new Error('Only a revision submitted for review can be queued (sandbox; not production release)');
  const hash=await sha256Hex(canonical(r.payload));const correlation=crypto.randomUUID();
  const rows=data.consumers.map(c=>({owner_id:context.userId,workspace_id:w.id,consumer:c,event_type:'EngineeringRevisionReleased',revision:r.revision,content_hash:hash,correlation_id:correlation,payload:{source_module:'EMS',organization_id:'manuqube',site:'riyadh-pilot',object_id:w.id,revision_id:r.revision,content_hash:hash,environment:'sandbox'}}));
  const {error}=await context.supabase.from('integration_outbox').insert(rows);if(error)throw new Error(error.code==='23505'?'This revision is already queued for that system':'Could not queue messages');return {hash};});
export const dispatchOutbox=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data:rows}=await context.supabase.from('integration_outbox').select('id,event_id,consumer,event_type,schema_version,correlation_id,payload,attempts').in('technical_status',['Pending','Failed','Unavailable']).limit(50);
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');let sent=0;
  for(const m of rows??[]){const s=SYSTEMS.find(x=>x.id===m.consumer)!;const url=process.env[`${s.env}_URL`];const key=process.env[`${s.env}_API_KEY`];let status='Unavailable',err:string|null='Receiving system not configured';
    if(url&&key){try{const res=await fetch(new URL('/api/public/v1/events',url),{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'idempotency-key':m.event_id},body:JSON.stringify({event_id:m.event_id,event_type:m.event_type,schema_version:m.schema_version,correlation_id:m.correlation_id,...(m.payload as object)}),signal:AbortSignal.timeout(8000)});status=res.ok?'Sent':'Failed';err=res.ok?null:`HTTP ${res.status}`;}catch{status='Failed';err='Network error';}}
    await supabaseAdmin.from('integration_outbox').update({technical_status:status,last_error:err,attempts:m.attempts+1,updated_at:new Date().toISOString()}).eq('id',m.id);if(status==='Sent')sent++;}
  return {attempted:rows?.length??0,sent};});
