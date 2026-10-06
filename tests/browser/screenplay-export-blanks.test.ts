// @vitest-environment node
import {it,expect} from 'vitest';
import {get} from 'svelte/store';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import {fixture} from './application-fixture';
import {readScreenplay} from '../../apps/desktop/host/screenplay-formats';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{pretendToBeVisual:true});
for(const key of ['window','document','navigator','Node','Element','HTMLElement','DOMParser','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'CSS',{configurable:true,value:{}});
for(const trailing of [false,true])it('exports '+(trailing?'a trailing neutral Enter':'a fresh blank script')+' without changing canonical passages',async()=>{
 const f=await fixture();try{
 await f.vm.onboard('Writer','pantser');await f.vm.newScript(get(f.vm.state).library.shelves[0]!.id);
 const id=get(f.vm.state).book!.id,editor=f.vm.editor!,chapter=editor.chapters[0]!.id;
 if(trailing){editor.selectPassage(editor.passageRows(chapter)[0]!.id,0);editor.insert('Opening.');editor.enter();}
 const passages=editor.passageRows(chapter).map(p=>({id:p.id,text:p.text}));await f.vm.closeBook();const file=join(f.provider.root,id,'manuscript.json'),before=await readFile(file,'utf8');
 for(const format of ['fountain','fdx','pdf'] as const){for(const scope of ['book','chapter'] as const){const destination=join(f.provider.root,scope+'.'+format);await f.provider.request(scope==='book'?'exportBook':'exportChapter',{bookId:id,...(scope==='chapter'?{chapterId:chapter}:{}),format,destination,language:'en'});const bytes=await readFile(destination);if(format==='pdf'){const text=spawnSync('pdftotext',['-','-'],{input:bytes,encoding:'utf8'});expect(text.status).toBe(0);if(trailing)expect(text.stdout).toContain('Opening.');}else expect(readScreenplay(bytes.toString(),format).lines.map(l=>l.runs.map(r=>r.text).join(''))).toEqual(trailing?['Opening.']:[]);}}
 expect(await readFile(file,'utf8')).toBe(before);await f.vm.openBook(id);expect(f.vm.editor!.passageRows(chapter).map(p=>({id:p.id,text:p.text}))).toEqual(passages);
 }finally{await f.close();}
});
