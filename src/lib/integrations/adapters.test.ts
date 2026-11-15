import {describe,it,expect} from 'vitest';
import {evaluateAck,canonical} from './adapters';
const ack={eventId:'e',consumer:'MES' as const,decision:'Accepted' as const,contentHash:'abc'};
describe('integration acknowledgements',()=>{
  it('quarantines hash mismatch',()=>expect(evaluateAck({content_hash:'zzz',business_status:'Pending'},ack)).toEqual({ok:false,quarantine:'Content hash mismatch'}));
  it('quarantines repeat acknowledgement',()=>expect(evaluateAck({content_hash:'abc',business_status:'Accepted'},ack).ok).toBe(false));
  it('rejects unknown event',()=>expect(evaluateAck(null,ack).ok).toBe(false));
  it('accepts exact hash on pending',()=>expect(evaluateAck({content_hash:'abc',business_status:'Pending'},ack)).toEqual({ok:true}));
  it('hash input is key-order independent',()=>expect(canonical({b:1,a:2})).toBe(canonical({a:2,b:1})));
});
