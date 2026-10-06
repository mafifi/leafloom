// @vitest-environment jsdom
import {it, expect} from 'vitest';
import {BookCore, ProseMirrorSurfaces} from '../../packages/editing/prosemirror-editor/src/index';
it('overlapping dictionary and capital slips retain both real range identities and canonical author text', () => {
  document.body.innerHTML = '<main><div class="chapter-body" data-chid="a"></div></main><aside></aside>';
  const core = new BookCore(document, {
    formatVersion: 'neo-lifecycle/v1', revision: 0,
    metadata: {id: 'book', title: 'Title', author: 'Writer'},
    chapters: [{id: 'a', html: '<p><b>tekst</b></p>'}], darlings: [],
  }, null, '', '');
  const surfaces = new ProseMirrorSurfaces(core, {
    undo: () => core.undo(), redo: () => core.redo(), save: () => {},
    format: mark => core.format(mark), archive: () => core.archive(),
  });
  try {
    surfaces.renderBook(document.querySelector('main')!, document.querySelector('aside')!, 'manuscript', true);
    const passageId = core.passageRows('a')[0].id, version = core.historyVersion;
    core.setAnnotations([
      {id: 'spell-word', kind: 'spelling', passageId, from: 0, to: 5, message: 'tekst'},
      {id: 'capital-letter', kind: 'spelling', passageId, from: 0, to: 1, message: 'T'},
    ]);
    const fragments = [...document.querySelectorAll('[data-spelling-id="spell-word"]')];
    expect(fragments.map(element => element.textContent).join('')).toBe('tekst');
    expect(document.querySelector('[data-capitalization-id="capital-letter"]')?.textContent).toBe('t');
    expect(document.querySelector('[data-spelling-id="spell-word"]:not([data-capitalization-id])')?.textContent).toBe('ekst');
    expect(core.historyVersion).toBe(version);
    expect(core.html('a')).toBe('<p><b>tekst</b></p>');
  } finally {surfaces.destroy();}
});
