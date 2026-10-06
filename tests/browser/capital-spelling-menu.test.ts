// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {get} from 'svelte/store';
import {fixture} from './application-fixture';
import {spellingMenu,type ApplicationSpellingContext} from '../../apps/desktop/src/lib/application-spelling';
import {SpellingViewModel} from '../../apps/desktop/src/lib/spelling-view-model';
it('NEO135 capital context menu offers only the capital, preserves marks and Undo, and never learns it',async()=>{
 const f=await fixture();
 try {
  await f.vm.onboard('Writer','pantser');await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
  f.vm.createChapter();const editor=f.vm.editor!;editor.select(editor.chapters[0].id,1);editor.paste({text:'hello.',html:'<b>hello.</b>'});
  const row=editor.capitalizationRanges(editor.chapters[0].id,'en-US')[0];
  const annotation={...row,id:'capital-first',kind:'spelling' as const};editor.setAnnotations([annotation]);
  const before=editor.checkpoint();const request=vi.fn(async()=>null);
  let value={...get(f.vm.state),spellOn:true};
  const context:ApplicationSpellingContext={editor,value,spellingMenuGeneration:0,effectiveSpellLanguage:'en-US',spellLanguageGeneration:0,request,
   patch:patch=>{value={...value,...patch};context.value=value;},writable:()=>true,updateLibrary:vi.fn(async()=>{}),
   spellingViewModel:new SpellingViewModel({editor:()=>editor,request:async()=>({}),activeSection:()=>editor.chapters[0].id,enabled:()=>true,language:()=> 'en-US'})};
  await spellingMenu(context,{...annotation,text:'h',x:10,y:20});
  expect(value.menu!.items.map(item=>item.label)).toEqual(['H']);expect(request).not.toHaveBeenCalled();
  await value.menu!.items[0].run();expect(editor.html(editor.chapters[0].id)).toContain('<b>Hello.</b>');
  editor.undo();expect(editor.checkpoint().book.chapters).toEqual(before.book.chapters);
  expect(context.updateLibrary).not.toHaveBeenCalled();context.spellingViewModel.destroy();
 }finally{await f.close();}
});
