// @vitest-environment jsdom
import {it, expect, vi} from 'vitest';
import {EditorView} from 'prosemirror-view';
import {BookCore, ProseMirrorSurfaces} from '../src/index';
function open() {
  document.body.innerHTML = '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = new BookCore(document, {
    formatVersion: 'neo-lifecycle/v1', revision: 0,
    metadata: {id:'book',title:'Title',author:'Writer',sectionNotes:{b:[{id:'plan',text:'Plan'}]}},
    chapters:[{id:'a',html:'<p><b>Alpha.</b></p>'},{id:'b',html:'<p data-sec-id="plan">Later.</p>'}],darlings:[],
  },null,'<p>Notes.</p>','<p>Outline.</p>');
  const surfaces = new ProseMirrorSurfaces(core, {
    undo:()=>core.undo(),redo:()=>core.redo(),save:()=>{},format:mark=>core.format(mark),archive:()=>core.archive(),
  });
  const update = vi.spyOn(EditorView.prototype,'updateState');
  surfaces.renderBook(document.querySelector('main')!,document.querySelector('aside')!,'manuscript',true);
  surfaces.update('b','manuscript',true);
  core.selectPassage(core.passageRows('b')[0].id, 1);
  const view = (id:string) => update.mock.contexts.find((view): view is EditorView => view instanceof EditorView && view.dom.closest('.chapter-body')?.getAttribute('data-chid')===id)!;
  return {core,surfaces,update,view,close:()=>{surfaces.destroy();update.mockRestore();}};
}
it('unaffected prose reuses its immutable local state while view update still refreshes editability and author history stays shared',()=>{
  const f=open();
  try {
    const a=f.view('a'), state=a.state, before=f.core.html('b');
    f.update.mockClear();
    f.core.insert('X');
    expect(a.state).toBe(state);
    expect(f.update.mock.contexts).toContain(a);
    expect(f.core.html('b')).toContain('LXater.');
    f.core.undo();expect(f.core.html('b')).toBe(before);
    f.core.redo();expect(f.core.html('b')).toContain('LXater.');
    f.surfaces.update('b','manuscript',false);
    expect(a.state).toBe(state);
    expect(a.dom.getAttribute('contenteditable')).toBe('false');
    f.surfaces.update('b','manuscript',true);
    expect(a.dom.getAttribute('contenteditable')).toBe('true');
  }finally{f.close();}
});
it('local annotations marks walking-note selection and publication presentation invalidate the appropriate projections',()=>{
  const f=open();
  try {
    const a=f.view('a'), b=f.view('b'), initial=a.state;
    f.core.setAnnotations([{id:'spell',kind:'spelling',passageId:f.core.passageRows('a')[0].id,from:0,to:5,message:'Alpha'}]);
    expect(a.state).not.toBe(initial);
    expect(a.dom.querySelector('[data-spelling-id="spell"]')?.textContent).toBe('Alpha');
    const marked=a.state;
    f.core.format('italic');expect(a.state).not.toBe(marked);
    expect(a.state.storedMarks?.map(mark=>mark.type.name)).toContain('italic');
    expect(b.dom.querySelector('p')?.hasAttribute('data-walk')).toBe(true);
    f.core.selectPassage(f.core.passageRows('a')[0].id,0);
    expect(b.dom.querySelector('p')?.hasAttribute('data-walk')).toBe(false);
    const prose=a.state;
    f.surfaces.configurePresentation({publicationPage:{kind:'dedication',label:'Dedication'} });
    f.surfaces.update('a','manuscript',true);
    expect(a.state).not.toBe(prose);
    f.core.setAnnotations([]);
    expect(a.dom.querySelector('[data-spelling-id]')).toBeNull();
    expect(f.core.html('a')).toBe('<p><b>Alpha.</b></p>');
  }finally{f.close();}
});
it('screenplay focus and geometry projections bypass prose reuse',()=>{
  const f=open();
  try {
    f.core.setManuscriptMode('screenplay');
    const a=f.view('a'), first=a.state;
    f.surfaces.update('b','manuscript',true);
    expect(a.state).not.toBe(first);
    f.core.setManuscriptMode('prose');
    const restored=a.state;
    f.surfaces.update('b','manuscript',true);
    expect(a.state).toBe(restored);
  }finally{f.close();}
});
it('the active manuscript and auxiliary Notes keep fresh native projection states even with identical content and selection',()=>{
  const f=open();
  try {
    const b=f.view('b'), active=b.state;
    f.surfaces.update('b','manuscript',true);
    expect(b.state).not.toBe(active);
    f.surfaces.update('b','notes',true);
    f.core.selectPassage(f.core.passageRows('notes')[0].id,1);
    const auxiliary=f.update.mock.contexts.find((view): view is EditorView => view instanceof EditorView && Boolean(view.dom.closest('aside')))!;
    const notes=auxiliary.state;
    f.surfaces.update('b','notes',true);
    expect(auxiliary.state).not.toBe(notes);
    expect(f.core.html('notes')).toBe('<p>Notes.</p>');
  }finally{f.close();}
});
