import {describe,it,expect} from 'vitest';
import {packageProblems,sourceProblems} from '../../scripts/check-repository.mjs';
import {passingCase,requiresNative} from '../../scripts/check-neo-parity.mjs';
const provider={name:'@leafloom/provider',leafloom:{role:'provider',runtime:'node'}};
describe('repository boundaries',()=>{
 it('keeps composition Svelte views on presentation and action contracts',()=>{const packages=new Map([['@leafloom/provider',provider]]);expect(sourceProblems("import x from '@leafloom/provider';fetch('/api');",'App.svelte',{role:'composition',runtime:'tauri'},packages)).toHaveLength(2);expect(sourceProblems("import type {State} from '@leafloom/contracts';",'App.svelte',{role:'composition',runtime:'tauri'},packages)).toHaveLength(0);});
 it('rejects contract-to-provider dependency and host imports',()=>{const packages=new Map([['@leafloom/provider',provider]]);expect(packageProblems({leafloom:{role:'contract',runtime:'portable'},dependencies:{'@leafloom/provider':'workspace:*'}},packages)).toContain('contract cannot depend on provider @leafloom/provider');expect(sourceProblems("import fs from 'node:fs';",'src/index.ts',{role:'contract',runtime:'portable'},packages)).toContain('portable source imports host API node:fs');});
 it('rejects production spike/reference imports',()=>{expect(sourceProblems("import x from '../../../spikes/old/index';",'src/index.ts',{role:'provider',runtime:'browser'},new Map())).toContain('production imports reference/private/spike ../../../spikes/old/index');});
 it('keeps portable contracts free of browser types while permitting generic hosts',()=>{expect(sourceProblems('interface Surface{render(root:HTMLElement):void}','src/index.ts',{role:'contract',runtime:'portable'},new Map())).toHaveLength(1);expect(sourceProblems('interface Surface<Host=unknown>{render(root:Host):void}','src/index.ts',{role:'contract',runtime:'portable'},new Map())).toHaveLength(0);});
});
describe('candidate evidence',()=>{
 it('requires actual native proof for source native environments',()=>{expect(requiresNative('electron-provider-native')).toBe(true);expect(requiresNative('Unlocked real macOS native foreground application')).toBe(true);expect(requiresNative('browser')).toBe(false);});
 const entry={title:'[NEO-001-A] genuine UI case',driver:'browser'};const report=(status='passed',count=1,implementation='leafloom-production')=>({config:{metadata:{evidenceSchema:'leafloom/parity-v1',appImplementation:implementation,referenceCommit:'ed090e9988d446daf1ebbde91bcebc13b599909b',buildSha256:'build'}},suites:[{title:'candidate',specs:[{title:entry.title,tests:[{expectedStatus:'passed',results:Array.from({length:count},()=>({status}))}]}]}]});
 it('accepts a single current actual candidate pass',()=>expect(passingCase(report(),entry,'build')).toBe(true));
 it('rejects skipped, retry, historical bridge and stale reports',()=>{expect(passingCase(report('skipped'),entry,'build')).toBe(false);expect(passingCase(report('passed',2),entry,'build')).toBe(false);expect(passingCase(report('passed',1,'legacy-compatibility-bridge'),entry,'build')).toBe(false);expect(passingCase(report(),entry,'other-build')).toBe(false);});
});
