import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { FileBookStore } from './storage';
import { EditorCore } from './core';
import { createFixture } from '../src/fixture';
const folder=()=>mkdtemp(join(tmpdir(),'neo-ui-contract-'));
it('ordered whole-book saves preserve runs, Darlings and separate notes/outline',async()=>{
 const root=await folder();try{const store=new FileBookStore(root);const editor=new EditorCore(createFixture());editor.select({chapterId:'chapter-one',blockId:'opening',from:26,to:36});editor.archive();const a=editor.snapshot(),b={...a,revision:2,title:'Later'};
 await Promise.all([store.save(a),store.save(b)]);expect(await store.load()).toEqual(b);await expect(store.save({...a,revision:1})).rejects.toThrow('older');
 await store.saveText('notes','A note');await store.saveText('outline','An outline');expect(await store.loadText('notes')).toBe('A note');expect(await store.loadText('outline')).toBe('An outline');
 expect((await readdir(root)).filter(f=>f.startsWith('chapter'))).toEqual([]);expect(JSON.parse(await readFile(join(root,'manuscript.json'),'utf8'))).toEqual(b);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('invalid saves do not poison the queue; corrupted current restores validated backup',async()=>{
 const root=await folder();try{const store=new FileBookStore(root),a=createFixture();await store.save(a);await store.save({...a,revision:1,title:'Second'});
 const bad=structuredClone(a);bad.chapters[1].id=bad.chapters[0].id;await expect(store.save(bad)).rejects.toThrow();
 await writeFile(join(root,'manuscript.json'),'{broken');expect(await new FileBookStore(root).load()).toEqual(a);
 await store.save({...a,revision:3});expect((await store.load())?.revision).toBe(3);
 }finally{await rm(root,{recursive:true,force:true});}
});
for(const stage of ['temporary.synced','backup.replaced','current.replaced'] as const)it(`SIGKILL at ${stage} leaves an entire validated version`,async()=>{
 const root=await folder();try{const a=createFixture();await new FileBookStore(root).save(a);
 const child=fork(join(import.meta.dirname,'crash-child.ts'),[root,stage],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
 await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('child barrier timeout'));},10000);child.once('error',reject);child.once('exit',code=>{if(code){clearTimeout(timeout);reject(new Error(`child exited ${code}`));}});child.once('message',()=>{child.once('exit',()=>{clearTimeout(timeout);resolve();});child.kill('SIGKILL');});});
 const loaded=await new FileBookStore(root).load();expect(loaded).toEqual(stage==='current.replaced'?{...a,revision:1,title:'Interrupted replacement'}:a);
 }finally{await rm(root,{recursive:true,force:true});}
});

it('save captures the submitted value before waiting behind another write',async()=>{const root=await folder();try{const store=new FileBookStore(root),a=createFixture();const pending=store.save(a);a.title='Changed after submit';a.chapters[0].blocks[0].runs[0].text='Changed after submit';await pending;expect(await store.load()).toEqual(createFixture());}finally{await rm(root,{recursive:true,force:true});}});
