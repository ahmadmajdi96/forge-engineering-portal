import {createFileRoute} from '@tanstack/react-router';
import {createHmac,timingSafeEqual} from 'crypto';
import {z} from 'zod';
import {evaluateAck} from '@/lib/integrations/adapters';
const body=z.object({event_id:z.string().uuid(),source_module:z.enum(['PLMS','MES','RMS','QMS']),decision:z.enum(['Accepted','Rejected']),content_hash:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().max(500).optional(),correlation_id:z.string().uuid().optional()});
// Inbound business acknowledgement (DefinitionAccepted/Rejected). Signed with INTEGRATION_WEBHOOK_SECRET.
export const Route=createFileRoute('/api/public/integrations/ack')({server:{handlers:{POST:async({request})=>{
  const secret=process.env['INTEGRATION_WEBHOOK_SECRET'];if(!secret)return new Response('Inbound integration not configured',{status:503});
  const raw=await request.text();const sig=request.headers.get('x-signature')??'';const exp=createHmac('sha256',secret).update(raw).digest('hex');
  if(sig.length!==exp.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(exp)))return new Response('Invalid signature',{status:401});
  let p;try{p=body.parse(JSON.parse(raw));}catch{return new Response('Invalid payload',{status:400});}
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data:row}=await supabaseAdmin.from('integration_outbox').select('id,content_hash,business_status').eq('event_id',p.event_id).eq('consumer',p.source_module).maybeSingle();
  const verdict=evaluateAck(row,{eventId:p.event_id,consumer:p.source_module,decision:p.decision,contentHash:p.content_hash,reason:p.reason});
  const {error:dup}=await supabaseAdmin.from('integration_inbox').insert({event_id:p.event_id,source_module:p.source_module,event_type:`Definition${p.decision}`,correlation_id:p.correlation_id??null,content_hash:p.content_hash,payload:p,status:verdict.ok?'Accepted':'Quarantined',quarantine_reason:verdict.ok?null:verdict.quarantine});
  if(dup?.code==='23505')return Response.json({status:'duplicate'});if(dup)return new Response('Inbox unavailable',{status:500});
  if(!verdict.ok)return Response.json({status:'quarantined',reason:verdict.quarantine},{status:409});
  await supabaseAdmin.from('integration_outbox').update({business_status:p.decision,business_reason:p.reason??null,updated_at:new Date().toISOString()}).eq('id',row!.id).eq('business_status','Pending');
  return Response.json({status:'recorded'});}}}});
