// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {get} from 'svelte/store';
import {fixture} from './application-fixture';
it('native format commands stay in an outline card draft without changing manuscript selection or history',async()=>{
 const f=await fixture();const field=document.createElement('div');field.setAttribute('contenteditable','true');field.textContent='Draft';document.body.append(field);
 const execute=vi.fn(()=>true);Object.defineProperty(document,'execCommand',{configurable:true,value:execute});
 try {
  await f.vm.onboard('Writer','pantser');await f.vm.newBook(get(f.vm.state).library.shelves[0].id);f.vm.createChapter();
  const editor=f.vm.editor!;editor.select(editor.chapters[0].id,1);editor.insert('Author words');editor.select(editor.chapters[0].id,1,7);
  const before=editor.checkpoint();field.focus();
  await f.vm.nativeCommand('bold');
  expect(execute).toHaveBeenCalledWith('bold');expect(editor.checkpoint()).toEqual(before);expect(document.activeElement).toBe(field);
 }finally{field.remove();await f.close();}
});

it('paragraph commands leave native draft fields and the retained manuscript selection alone', async () => {
 const f = await fixture();
 const field = document.createElement('textarea');
 field.value = 'Outline draft';
 document.body.append(field);
 try {
  await f.vm.onboard('Writer', 'pantser');
  await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
  f.vm.createChapter();
  const editor = f.vm.editor!;
  editor.select(editor.chapters[0].id, 1);
  editor.insert('Author words');
  const before = editor.checkpoint();
  field.focus();
  for (const command of ['flush', 'poetry']) {
   await f.vm.nativeCommand(command);
   expect(editor.checkpoint()).toEqual(before);
   expect(document.activeElement).toBe(field);
   expect(field.value).toBe('Outline draft');
  }
 } finally {
  field.remove();
  await f.close();
 }
});
