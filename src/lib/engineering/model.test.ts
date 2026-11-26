import {describe,it,expect} from 'vitest';
import {makeModel,validateModel,activationBlockers,assignmentOverlap,graphHasCycle,acceptSequence,pinSession} from './model';
describe('Engineering report rules',()=>{
it('pilot retains six stations, four automatic and two manual',()=>{const m=makeModel();expect(m.stations).toHaveLength(6);expect(m.stations.filter(s=>s.mode==='automatic')).toHaveLength(4);expect(m.stations.filter(s=>s.mode==='manual')).toHaveLength(2);});
it('missing scale and CCP workflow block release',()=>{expect(validateModel(makeModel()).map(i=>i.message)).toContain('Scale binding missing');expect(validateModel(makeModel()).map(i=>i.message)).toContain('CCP challenge workflow unassigned');});
it('required stale input blocks completion after 60 seconds',()=>{const m=makeModel();const s=m.signals.find(s=>s.key==='challenge_result');if(!s)throw Error('missing');s.quality='Good';s.age=61;expect(validateModel(m).some(i=>i.object==='challenge_result')).toBe(true);});
it('unit mismatch blocks validation',()=>{const m=makeModel();const s=m.signals[0];if(!s)throw Error('missing');s.unit='kg';s.expectedUnit='g';expect(validateModel(m).some(i=>i.message==='Engineering unit mismatch')).toBe(true);});
it('mandatory CCP evidence cannot be skipped',()=>{expect(validateModel(makeModel()).some(i=>i.message==='CCP evidence policy incomplete')).toBe(true);});
it('approval without MES and edge evidence cannot activate',()=>{expect(activationBlockers(makeModel())).toContain('MES business acknowledgement missing');expect(activationBlockers(makeModel())).toContain('Edge actual manifest unconfirmed');});
it('actual mismatch remains blocked even with acknowledgements',()=>{const m=makeModel();m.edgeAck=true;m.actual='r3';expect(activationBlockers(m)).toContain('Edge actual manifest unconfirmed');});
it('overlapping exclusive asset assignments are rejected',()=>{expect(assignmentOverlap({asset:'MD-104',from:0,to:10,exclusive:true},{asset:'MD-104',from:5,to:20,exclusive:false})).toBe(true);});
it('component cycles are detected',()=>{expect(graphHasCycle([['a','b'],['b','a']])).toBe(true);expect(graphHasCycle([['a','b'],['b','c']])).toBe(false);});
it('duplicate events cannot apply twice',()=>{expect(acceptSequence(['event1'],1,{id:'event1',sequence:1})).toBe('duplicate');});
it('out of order events are diagnosed',()=>{expect(acceptSequence([],1,{id:'event3',sequence:3})).toBe('gap');});
it('sessions retain original release',()=>{const s=pinSession('r3');expect(Object.isFrozen(s)).toBe(true);expect(s.release).toBe('r3');});
it('unbounded waits fail validation',()=>{const m=makeModel();const s=m.steps[0];if(!s)throw Error('missing');s.timeout=0;expect(validateModel(m).some(i=>i.message==='Unbounded wait')).toBe(true);});
});

import {appWorkflow,setAppWorkflow,modelSchema} from './model';

it('keeps authored steps and weight settings on the selected application across revision parsing',()=>{
 const original=makeModel();
 const legacy=appWorkflow(original,'APP-INTAKE');
 const second={...appWorkflow(original,'second'),steps:[{id:'weigh',label:'Weigh',kind:'Weigh',signal:'',timeout:30,failure:true,evidence:true,weightTarget:2.5,weightTolerance:0.1}]};
 const saved=modelSchema.parse(setAppWorkflow(original,'second',second));
 expect(appWorkflow(saved,'APP-INTAKE')).toEqual(legacy);
 expect(appWorkflow(saved,'second')).toEqual(second);
 expect(appWorkflow(saved,'third').steps).toEqual([]);
});
it('validates scale and challenge requirements by station capability when station IDs change',()=>{
 const model=makeModel();model.stations=model.stations.map(s=>({...s,id:'new-'+s.id}));
 const issues=validateModel(model);
 expect(issues.find(i=>i.message==='Scale binding missing')?.object).toBe('new-ST-101');
 expect(issues.find(i=>i.message==='CCP challenge workflow unassigned')?.object).toBe('new-ST-104');
});
