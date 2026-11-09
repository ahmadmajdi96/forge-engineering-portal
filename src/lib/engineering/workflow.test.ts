import {it,expect} from 'vitest';
import {simulateChallenge} from './workflow';
it('all three challenge materials are required before completion',()=>{expect(simulateChallenge(['Ferrous','Nonferrous'],'pass')).toBe('collecting');expect(simulateChallenge(['Ferrous','Nonferrous','Stainless'],'pass')).toBe('complete');});
it('a failed challenge transitions to material containment not completion',()=>{expect(simulateChallenge(['Ferrous','Nonferrous','Stainless'],'fail')).toBe('contained');});
