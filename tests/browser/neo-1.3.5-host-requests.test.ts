// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {readFile,chmod,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {get} from 'svelte/store';
import {hostErrorCode} from '../../apps/desktop/host/error-code.ts';
import {hostSpan,telemetryDiagnostics} from '../../apps/desktop/host/telemetry.ts';
import {fixture} from './application-fixture.ts';
it('[NEO135-001/011] permission categories remain distinct from disk-full and unrelated errors',()=>{
 for(const code of ['EPERM','EACCES','EROFS'])expect(hostErrorCode(Object.assign(new Error('Private path'),{code}))).toBe('WRITE_REFUSED');
 expect(hostErrorCode(Object.assign(new Error('Private path'),{code:'ENOSPC'}))).toBe('DISK_FULL');expect(hostErrorCode(Error('Private path'))).toBe('DISK_ERROR');
});
it('[NEO135-011] actual refused checkpoint retains operation, pending words, durable baseline and retry',async()=>{
 const f=await fixture();let folder='',mode=0;
 try{await f.vm.onboard('Writer','pantser');await f.vm.newBook(get(f.vm.state).library.shelves[0]!.id);await f.vm.createChapter();const editor=f.vm.editor!;editor.select(editor.chapters[0]!.id,1);editor.insert('Saved baseline.');await f.vm.save();const id=get(f.vm.state).book!.id;folder=join(f.provider.root,id);mode=(await stat(folder)).mode&0o777;
 const before=await readFile(join(folder,'manuscript.json'),'utf8');editor.insert(' Pending author words.');const pending=editor.checkpoint();
 f.host.request=async(method,payload)=>{try{return {ok:true,value:await f.provider.request(method,payload)} as never;}catch(error){return {ok:false,code:hostErrorCode(error)};}};
 await chmod(folder,0o500);let refusal:unknown;try{await f.vm.save();}catch(error){refusal=error;}
 expect(refusal).toMatchObject({message:'WRITE_REFUSED',operation:'checkpoint'});await f.vm.execute(()=>f.vm.save());
 const diagnostic=await readFile(join(f.provider.root,'leafloom-errors.log'),'utf8');expect(diagnostic.trim().split('\n').map(line=>JSON.parse(line))).toContainEqual({source:'host',code:'UNEXPECTED_RUNTIME',at:expect.any(String)});expect(diagnostic).not.toMatch(/Pending author words|Saved baseline|manuscript|EACCES/);
 expect(get(f.vm.state).hint).toContain("Leafloom can't save in your library folder");expect(get(f.vm.state).hint).toContain('Save');expect(get(f.vm.state).hint).toContain('Your words stay on the page');expect(get(f.vm.state).dirty).toBe(true);expect(editor.checkpoint().book.revision).toBeGreaterThanOrEqual(pending.book.revision);expect(editor.html(editor.chapters[0]!.id)).toContain('Pending author words.');expect(await readFile(join(folder,'manuscript.json'),'utf8')).toBe(before);
 await chmod(folder,mode);await f.vm.save();expect(get(f.vm.state).dirty).toBe(false);expect(await readFile(join(folder,'manuscript.json'),'utf8')).toContain('Pending author words.');
 }finally{if(folder)await chmod(folder,mode);await f.close();}
});
it('[NEO135-011] overlapping read, save and failed-write traces retain their own timing, identity and answer',async()=>{
 const started=(await telemetryDiagnostics()).spans.map(span=>span.spanId);let readDone!:(value:string)=>void,saveDone!:(value:string)=>void;
 const read=hostSpan('readChapter',()=>new Promise<string>(resolve=>{readDone=resolve;}));const save=hostSpan('checkpoint',()=>new Promise<string>(resolve=>{saveDone=resolve;}));const denied=hostSpan('writeLibrary',async()=>{throw Object.assign(Error('Private path'),{code:'EROFS'});});await expect(denied).rejects.toMatchObject({code:'EROFS'});saveDone('saved');expect(await save).toBe('saved');readDone('read');expect(await read).toBe('read');
 const spans=(await telemetryDiagnostics()).spans.filter(span=>!started.includes(span.spanId));expect(new Set(spans.map(span=>span.spanId)).size).toBe(3);expect(spans.map(span=>span.name).sort()).toEqual(['host.checkpoint','host.readChapter','host.writeLibrary']);expect(spans.find(span=>span.name==='host.writeLibrary')!.status).toBe(2);expect(spans.find(span=>span.name==='host.readChapter')!.durationMs).toBeGreaterThanOrEqual(spans.find(span=>span.name==='host.writeLibrary')!.durationMs);expect(JSON.stringify(spans)).not.toContain('Private path');
});
