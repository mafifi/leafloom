import { it,expect } from 'vitest';
import { AuthoringViewModel } from './AuthoringViewModel.svelte';
import { createFixture } from '../src/fixture';
import type { BookStore } from './storage';
import type { Manuscript } from '../src/contracts';
it('ViewModel orders complete save requests and connects snapshot/storage traces',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);const operations:string[]=[];let current:Manuscript|null=null,notes='';
 const store:BookStore={save:async doc=>{operations.push(`book:${doc.revision}`);if(doc.revision===1)await gate;current=structuredClone(doc);},load:async()=>current,saveText:async(kind,value)=>{operations.push(`${kind}:${value}`);if(kind==='notes')notes=value;},loadText:async kind=>kind==='notes'?notes:''};
 const vm=new AuthoringViewModel(createFixture(),store);try{
  vm.core.select({chapterId:'chapter-one',blockId:'opening',from:0,to:0});vm.core.insert('First ');vm.setNotes('first');const first=vm.save();vm.core.insert('Second ');vm.setNotes('second');const second=vm.save();
  await Promise.resolve();await Promise.resolve();expect(operations).toEqual(['book:1']);release();await Promise.all([first,second]);
  expect(operations).toEqual(['book:1','notes:first','outline:','book:2','notes:second','outline:']);expect(vm.status).toBe('Saved');expect(notes).toBe('second');
  const report=await vm.diagnostics.report();for(const save of report.spans.filter(s=>s.name==='save')){const children=report.spans.filter(s=>s.traceId===save.traceId&&s.parentSpanId);expect(children.map(s=>s.name).sort()).toEqual(['save.port','save.snapshot']);}
 }finally{vm.dispose();}
});
it('a failed save leaves writing intact and a later save can succeed',async()=>{
 let fail=true;const store:BookStore={save:async()=>{if(fail)throw new Error('Disk unavailable');},load:async()=>null,saveText:async()=>{},loadText:async()=>''};
 const vm=new AuthoringViewModel(createFixture(),store);try{await vm.save();expect(vm.status).toBe('Disk unavailable');expect(vm.core.snapshot()).toEqual(createFixture());fail=false;await vm.save();expect(vm.status).toBe('Saved');}finally{vm.dispose();}
});
