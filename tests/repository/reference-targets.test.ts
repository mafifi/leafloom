import {it,expect} from 'vitest';
import {referenceTarget} from '../neo-compat/evidence.mjs';
import {verifyProvenance} from '../../scripts/check-repository.mjs';
import {passingReference} from '../../scripts/check-neo-parity.mjs';
it('retains the exact 1.2.4 oracle while selecting the independent 1.3.5 source',()=>{
 expect(referenceTarget('1.2.4')).toMatchObject({directory:'neo',commit:'ed090e9988d446daf1ebbde91bcebc13b599909b'});
 expect(referenceTarget('1.3.5')).toMatchObject({directory:'neo-1.3.5',commit:'b742c5f92a5465fe8473e8d10aa05b3f0ea8a5a0'});
 expect(()=>referenceTarget('latest')).toThrow('Unpinned NEO reference');
});
it('checks original bytes for both pinned source versions',async()=>expect(await verifyProvenance()).toEqual([]));
it('rejects a historical passing reference as evidence for the newer target',()=>{
 const expected={evidenceSchema:'leafloom/reference-v1',appImplementation:'neo-pinned-original',referenceCommit:referenceTarget('1.3.5').commit,referenceSourceSha256:'new-source',referenceHarnessSha256:'current-harness'};
 const entry={title:'actual new author behavior'};
 const report={config:{metadata:{...expected,driver:'electron-reference-hidden',nativeWindowPolicy:'hidden'}},suites:[{title:'new target',specs:[{title:entry.title,tests:[{expectedStatus:'passed',results:[{status:'passed'}]}]}]}]};
 expect(passingReference(report,entry,expected)).toBe(true);
 expect(passingReference({...report,config:{metadata:{...report.config.metadata,referenceCommit:referenceTarget('1.2.4').commit}}},entry,expected)).toBe(false);
});
