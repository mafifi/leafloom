// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { BookCore } from '../src/core';
import { ProseMirrorSurfaces } from '../src/surfaces';
function open(html: string) {
  document.body.innerHTML =
    '<main><div data-chid="a" class="chapter-body"></div><div data-chid="b" class="chapter-body"></div></main><aside></aside>';
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'fidelity', title: 'Fidelity', author: 'Writer' },
      chapters: [
        { id: 'a', html: '<p><b>Previous chapter.</b></p>' },
        { id: 'b', html },
      ],
      darlings: [],
    },
    null,
    '',
    '',
  );
  const surfaces = new ProseMirrorSurfaces(core, {
    undo: () => core.undo(),
    redo: () => core.redo(),
    save: () => {},
    format: (mark) => core.format(mark),
    archive: () => core.archive(),
  });
  surfaces.renderBook(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'manuscript',
    true,
  );
  const view = document.querySelector<HTMLElement>('[data-chid="b"] .ProseMirror')!;
  return { core, surfaces, view };
}
it('leading empty paragraph deletion keeps current rich paragraph identity and both chapter boundaries through Undo Redo', () => {
  const { core, surfaces } = open(
    '<p><br></p><p style="text-align:right"><i>Next chapter.</i></p>',
  );
  const passage = core.passageRows('b')[1];
  core.selectPassage(passage.id, 0);
  core.backspace();
  expect(core.passageRows('b')).toMatchObject([{ id: passage.id, text: 'Next chapter.' }]);
  expect(core.html('b')).toBe('<p style="text-align: right;"><i>Next chapter.</i></p>');
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a', 'b']);
  core.undo();
  expect(core.passageRows('b')).toHaveLength(2);
  core.redo();
  expect(core.passageRows('b')[0].id).toBe(passage.id);
  surfaces.destroy();
});
it('noncomposing Enter229 reaches flush while composing Enter stays with the input method', () => {
  const { core, surfaces, view } = open('<p><b>Alpha.</b></p>');
  core.selectPassage(core.passageRows('b')[0].id, 6);
  view.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 229,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(core.html('b')).toBe('<p><b>Alpha.</b></p><p class="flush"></p>');
  const before = core.html('b');
  view.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(core.html('b')).toBe(before);
  surfaces.destroy();
});
it('native beforeinput line-break fallback applies flush semantics at the author range', () => {
  const { core, surfaces, view } = open('<p><b>Alpha beta.</b></p>');
  core.selectPassage(core.passageRows('b')[0].id, 6);
  surfaces.focus();
  const event = new InputEvent('beforeinput', {
    inputType: 'insertLineBreak',
    bubbles: true,
    cancelable: true,
  });
  view.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(core.html('b')).toBe('<p><b>Alpha </b></p><p class="flush"><b>beta.</b></p>');
  core.undo();
  expect(core.html('b')).toBe('<p><b>Alpha beta.</b></p>');
  surfaces.destroy();
});
