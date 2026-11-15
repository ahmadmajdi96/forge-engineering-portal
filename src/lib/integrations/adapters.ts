// Typed adapters for external ManuQube systems. Missing configuration => honest Unknown state that blocks readiness.
export type SystemId='PLMS'|'MES'|'RMS'|'QMS'|'AMS';
export type ConnectionState='Connected'|'Unknown'|'Unavailable';
export const SYSTEMS:{id:SystemId;name:string;role:string;env:string;consumes:boolean}[]=[
  {id:'PLMS',name:'Product Lifecycle Command',role:'Routings, operations, mapping acceptance',env:'PLMS',consumes:true},
  {id:'MES',name:'MES Command Center',role:'Workflow & screen manifests for execution',env:'MES',consumes:true},
  {id:'RMS',name:'Cortanex RMS',role:'Released recipe references (read-only)',env:'RMS',consumes:false},
  {id:'QMS',name:'CORTA QC System',role:'Inspection plan references (read-only)',env:'QMS',consumes:false},
  {id:'AMS',name:'Command Access Hub',role:'Users, roles and permissions',env:'ACCESS_HUB',consumes:false},
];
export const READINESS_BLOCKING:ConnectionState[]=['Unknown','Unavailable'];
export async function sha256Hex(text:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Deterministic JSON so hashes are stable regardless of key order.
export function canonical(v:unknown):string{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;return `{${Object.keys(v as object).sort().map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(',')}}`;}
export type AckDecision={eventId:string;consumer:SystemId;decision:'Accepted'|'Rejected';contentHash:string;reason?:string};
/** Pure rule: an acknowledgement only applies if it binds to the exact hash and is not stale. */
export function evaluateAck(row:{content_hash:string;business_status:string}|null,ack:AckDecision):{ok:true}|{ok:false;quarantine:string}{
  if(!row)return {ok:false,quarantine:'Unknown event for consumer'};
  if(row.content_hash!==ack.contentHash)return {ok:false,quarantine:'Content hash mismatch'};
  if(row.business_status!=='Pending')return {ok:false,quarantine:'Duplicate or out-of-order acknowledgement'};
  return {ok:true};
}
