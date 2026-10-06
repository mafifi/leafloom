// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { BookCore } from '../src/core';
import { ProseMirrorSurfaces } from '../src/surfaces';
import { screenplayKey } from '../src/screenplay-surface';
function fixture() {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="chapter"></div></main><aside></aside>';
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'script', title: 'Script', author: 'Writer', format: 'screenplay' },
      chapters: [
        {
          id: 'chapter',
          html: '<p class="sp-character">KIM</p><p class="sp-dialogue"><i>Hello.</i></p><p class="sp-action">Walk.</p><p class="sp-character">K</p>',
        },
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
    format: (m) => core.format(m),
    archive: () => core.archive(),
  });
  surfaces.renderBook(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'manuscript',
    true,
  );
  return { core, surfaces };
}
it('mounted completion consumes Escape and Right but leaves canonical content and history in the author owner', () => {
  const { core, surfaces } = fixture();
  try {
    core.selectPassage(core.passages('chapter')[3].id, 1);
    surfaces.focus();
    core.selectPassage(core.passages('chapter')[3].id, 1);
    const p = document.querySelectorAll('main p')[3];
    expect(p.getAttribute('data-ghost')).toBe('IM');
    const version = core.historyVersion;
    const editor = document.querySelector('main .ProseMirror')!;
    editor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(p.hasAttribute('data-ghost')).toBe(false);
    expect(core.historyVersion).toBe(version);
    core.insert('I');
    expect(p.getAttribute('data-ghost')).toBe('M');
    editor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(p.textContent).toBe('KIM');
    expect(p.hasAttribute('data-contd')).toBe(true);
    expect(core.html('chapter')).not.toMatch(/data-ghost|data-contd/);
  } finally {
    surfaces.destroy();
  }
});
it('physical element keys consume idempotent commands and modified Enter delegates to native input', () => {
  const { core, surfaces } = fixture();
  try {
    core.selectPassage(core.passages('chapter')[2].id, 5);
    const mac = navigator.platform.toLowerCase().includes('mac');
    const modifier = mac ? { metaKey: true } : { ctrlKey: true };
    expect(
      screenplayKey(core, new KeyboardEvent('keydown', { key: 'ж', code: 'Digit6', ...modifier })),
    ).toBe(true);
    expect(core.passages('chapter')[2].node.attrs.screenplay).toBe('transition');
    expect(
      screenplayKey(core, new KeyboardEvent('keydown', { key: 'ж', code: 'Digit6', ...modifier })),
    ).toBe(true);
    expect(
      screenplayKey(
        core,
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, ...modifier }),
      ),
    ).toBe(null);
  } finally {
    surfaces.destroy();
  }
});
it('native blur and refocus redraw the completion without changing authored content or history', async () => {
 const {core,surfaces}=fixture();try {
  core.selectPassage(core.passages('chapter')[3].id,1);surfaces.focus();await Promise.resolve();
  const paragraph=()=>document.querySelectorAll('main p')[3];expect(paragraph().getAttribute('data-ghost')).toBe('IM');
  const version=core.historyVersion,html=core.html('chapter'),input=document.createElement('input');document.body.append(input);input.focus();await Promise.resolve();expect(paragraph().hasAttribute('data-ghost')).toBe(false);expect(core.historyVersion).toBe(version);expect(core.html('chapter')).toBe(html);
  surfaces.focus();await Promise.resolve();expect(paragraph().getAttribute('data-ghost')).toBe('IM');expect(core.historyVersion).toBe(version);
 } finally {surfaces.destroy();}
});
