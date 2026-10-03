// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {BookCore} from '../src/core';
import {ProseMirrorSurfaces} from '../src/surfaces';
for(const blank of [true,false])it(`captured Darling drag ${blank?'rejects whitespace without changing history or a collapsed caret':'archives rich text after live selection collapses'}`,()=>{
 document.body.innerHTML='<main><div class="chapter-body" data-chid="a"></div></main><aside></aside>';
 const html=blank?'<p>Alpha   Omega.</p>':'<p>Alpha <i>beta</i> Gamma.</p>';
 const core=new BookCore(document,{formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'book',title:'Title',author:'Writer'},chapters:[{id:'a',html}],darlings:[]},null,'<p>Research.</p>','');
 const surfaces=new ProseMirrorSurfaces(core,{undo:()=>core.undo(),redo:()=>core.redo(),save:()=>{},format:mark=>core.format(mark),archive:()=>core.archive()});
 try{
  surfaces.renderBook(document.querySelector('main')!,document.querySelector('aside')!,'manuscript',true);
  core.selectPassage(core.passageRows('a')[0].id,6,blank?8:10);surfaces.focus();document.querySelector('.ProseMirror')!.dispatchEvent(new Event('dragstart',{bubbles:true}));core.selectPassage(core.passageRows('a')[0].id,0);
  const before=core.checkpoint(),selection=core.selection,revision=core.revision;
  expect(surfaces.archiveDraggedSelection()).toBe(!blank);
  if(blank){expect(core.checkpoint()).toEqual(before);expect(core.selection).toEqual(selection);expect(core.revision).toBe(revision);expect(core.canUndo).toBe(false);}
  else{expect(core.darlings[0].html).toMatch(/<(?:i|em)>beta<\/(?:i|em)>/);expect(core.html('a')).toBe('<p>Alpha  Gamma.</p>');core.undo();expect(core.html('a')).toBe(html);expect(core.darlings).toEqual([]);}
  expect(surfaces.archiveDraggedSelection()).toBe(false);
 }finally{surfaces.destroy();}
});
it('captured Darling drag keeps a paired placeholder eligible as semantic content',()=>{
 document.body.innerHTML='<main><div class="chapter-body" data-chid="a"></div></main><aside></aside>';
 const core=new BookCore(document,{formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'book',title:'Title',author:'Writer',stickies:[{id:'note',chapterId:'a',text:'Keep note'}]},chapters:[{id:'a',html:'<p>Alpha <span class="ph-mark" data-sid="note" contenteditable="false">⚑</span> Omega.</p>'}],darlings:[]},null,'','');
 const surfaces=new ProseMirrorSurfaces(core,{undo:()=>core.undo(),redo:()=>core.redo(),save:()=>{},format:mark=>core.format(mark),archive:()=>core.archive()});
 try{surfaces.renderBook(document.querySelector('main')!,document.querySelector('aside')!,'manuscript',true);core.selectPassage(core.passageRows('a')[0].id,6,7);surfaces.focus();document.querySelector('.ProseMirror')!.dispatchEvent(new Event('dragstart',{bubbles:true}));core.selectPassage(core.passageRows('a')[0].id,0);expect(surfaces.archiveDraggedSelection()).toBe(true);expect(core.darlings[0].text).toBe('⚑');expect(core.darlings[0].stickies).toEqual([{id:'note',chapterId:'a',text:'Keep note',resolved:false}]);core.undo();expect(core.html('a')).toContain('data-sid="note"');}finally{surfaces.destroy();}
});
