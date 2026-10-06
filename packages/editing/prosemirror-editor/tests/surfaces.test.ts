// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { BookCore } from '../src/core';
import { ProseMirrorSurfaces } from '../src/surfaces';
const open = (html = '<p>Alpha beta.</p>') =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [
        { id: 'a', html },
        { id: 'b', html: '<p>Later.</p>' },
      ],
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '<p>Outline.</p>',
  );
it('multiple native chapter surfaces share one master history with auxiliary prose', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
      undo: () => core.undo(),
      redo: () => core.redo(),
      save: () => {},
      format: (mark) => core.format(mark),
      archive: () => core.archive(),
    });
  surfaces.renderBook(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'notes',
    true,
  );
  expect(document.querySelectorAll('.ProseMirror')).toHaveLength(3);
  expect(document.querySelector('[data-chid="b"]')!.textContent).toBe('Later.');
  core.selectPassage(core.passageRows('a')[0].id, 6);
  const editor = document.querySelector('[data-chid="a"] .ProseMirror')!;
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(document.querySelector('[data-chid="a"]')!.textContent).toBe('Alpha ***beta.');
  expect(document.querySelector('[data-chid="b"]')!.textContent).toBe('Later.');
  core.select('notes', 1);
  core.insert('Research ');
  expect(document.querySelector('aside')!.textContent).toBe('Research Notes.');
  core.undo();
  expect(document.querySelector('aside')!.textContent).toBe('Notes.');
  core.undo();
  expect(document.querySelector('[data-chid="a"]')!.textContent).toBe('Alpha beta.');
  surfaces.destroy();
  expect(document.querySelectorAll('.ProseMirror')).toHaveLength(0);
});
it('auxiliary surface switches target without a stale captured chapter closure', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
      undo: () => core.undo(),
      redo: () => core.redo(),
      save: () => {},
      format: (mark) => core.format(mark),
      archive: () => core.archive(),
    });
  surfaces.render(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'a',
    'notes',
    true,
  );
  surfaces.update('b', 'outline', true);
  core.select('b', 1);
  const editor = document.querySelector('main .ProseMirror')!;
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(core.passageRows('b').map((p) => p.text)).toEqual(['', 'Later.']);
  expect(core.passageRows('a').map((p) => p.text)).toEqual(['Alpha beta.']);
  surfaces.destroy();
});
it('explicit search handoff focuses the selected match end without adopting a stale author range', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside><input id="search">';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
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
  core.selectPassage(core.passageRows('a')[0].id, 11);
  surfaces.focus();
  document.querySelector<HTMLInputElement>('#search')!.focus();
  const match = core.search('beta')[0];
  core.selectPassage(match.passageId, match.to);
  core.setAnnotations([]);
  surfaces.focus();
  const selection = document.getSelection()!;
  expect(selection.anchorOffset).toBe(10);
  expect(core.state.selection.$from.parentOffset).toBe(10);
  surfaces.destroy();
});
it('native ghost click selects the planned beat and typing consumes it without losing its section ID', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open();
  core.updateMetadata({ sectionNotes: { a: [{ id: 'beat', text: 'First beat' }] } });
  core.editOutlineRow({ chapterId: 'a', sectionId: 'beat' }, 'First beat');
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
  surfaces.focus();
  document.querySelector('p.ghost')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(document.getSelection()?.toString()).toBe('First beat');
  core.insert('Written prose.');
  expect(document.querySelector('p[data-sec-id="beat"]')!.textContent).toBe('Written prose.');
  expect(document.querySelector('p[data-sec-id="beat"]')!.classList.contains('ghost')).toBe(false);
  surfaces.destroy();
});
it('native composition lifecycle leaves Enter and undo confirmation keys to the input method', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open();
  core.select('a', 2);
  core.insert('X');
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
  surfaces.focus();
  const editor = document.querySelector('[data-chid="a"] .ProseMirror')!;
  editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  const revision = core.revision;
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
  expect(core.revision).toBe(revision);
  expect(core.passageRows('a')).toHaveLength(1);
  expect(core.passageRows('a')[0].text).toBe('AXlpha beta.');
  editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '文' }));
  surfaces.destroy();
});
it('Darlings drop restores the native drag-start range after the live caret collapses', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
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
  core.selectPassage(core.passageRows('a')[0].id, 6, 10);
  surfaces.focus();
  const editor = document.querySelector('[data-chid="a"] .ProseMirror')!;
  editor.dispatchEvent(new Event('dragstart', { bubbles: true }));
  core.select('a', 1);
  expect(surfaces.archiveDraggedSelection()).toBe(true);
  expect(core.darlings[0].text).toBe('beta');
  expect(core.passageRows('a')[0].text).toBe('Alpha .');
  expect(surfaces.archiveDraggedSelection()).toBe(false);
  core.undo();
  expect(core.passageRows('a')[0].text).toBe('Alpha beta.');
  surfaces.destroy();
});
it('master refresh keeps an active native composition alive when explicit marks are empty', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open();
  core.select('a', 7);
  core.dispatch(core.state.tr.setStoredMarks([]), 'selection');
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
  surfaces.focus();
  const editor = document.querySelector('[data-chid="a"] .ProseMirror')!;
  editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  core.setBookkeeping({ wordCount: 3 });
  const revision = core.revision;
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(core.revision).toBe(revision);
  expect(core.passageRows('a')).toHaveLength(1);
  editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  surfaces.destroy();
});

it('offscreen reader scroll is preserved through bookkeeping and metadata refresh while typing requests reveal', () => {
  document.body.innerHTML =
    '<div id="paper-scroll"><main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main></div><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
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
  surfaces.focus();
  const frame = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', frame);
  try {
    core.setBookkeeping({ wordCount: 3 });
    core.setMetadata({ title: 'Revised' });
    core.setAnnotations([]);
    surfaces.update('a', 'manuscript', true);
    expect(frame).not.toHaveBeenCalled();
    core.insert('X');
    expect(frame).toHaveBeenCalledOnce();
    frame.mockClear();
    surfaces.setVim(true);
    const editor = document.querySelector('[data-chid="a"] .ProseMirror')!;
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', bubbles: true }));
    expect(frame).toHaveBeenCalledOnce();
    frame.mockClear();
    core.setBookkeeping({ wordCount: core.words });
    expect(frame).not.toHaveBeenCalled();
  } finally {
    surfaces.destroy();
    vi.unstubAllGlobals();
  }
});
it('prevent-scroll tab focus restores the model caret without an extra native range reset', () => {
  document.body.innerHTML =
    '<div id="paper-scroll"><main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside></div>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
      undo: () => core.undo(),
      redo: () => core.redo(),
      save: () => {},
      format: (mark) => core.format(mark),
      archive: () => core.archive(),
    });
  surfaces.renderBook(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'notes',
    true,
  );
  core.select('notes', 1);
  const scroll = document.querySelector<HTMLElement>('#paper-scroll')!;
  scroll.scrollTop = 1547;
  const setRange = vi.spyOn(document.getSelection()!, 'setBaseAndExtent');
  try {
    surfaces.focus({ preventScroll: true });
    expect(setRange).not.toHaveBeenCalled();
    expect(scroll.scrollTop).toBe(1547);
    expect(document.getSelection()?.anchorOffset).toBe(0);
  } finally {
    setRange.mockRestore();
    surfaces.destroy();
  }
});
it('native match-style paste shortcut follows caret emphasis rather than clipboard bold', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  const core = open();
  core.select('a', 1, 6);
  core.format('italic');
  core.select('a', 6);
  const surfaces = new ProseMirrorSurfaces(core, {
    undo: () => core.undo(),
    redo: () => core.redo(),
    save: () => {},
    format: (mark) => core.format(mark),
    archive: () => core.archive(),
  });
  surfaces.render(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'a',
    'manuscript',
    true,
  );
  surfaces.focus();
  const editor = document.querySelector('main .ProseMirror')!;
  editor.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true }),
  );
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/html' ? '<b>X</b>' : 'X') },
  });
  editor.dispatchEvent(paste);
  expect(core.html('a')).toBe('<p><i>AlphaX</i> beta.</p>');
  surfaces.destroy();
});
it('independent chapter composition sessions with equal native IDs keep separate author Undo groups', async () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
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
  const compose = async (id: string, text: string) => {
    const passage = core.passageRows(id)[0];
    core.selectPassage(passage.id, passage.size);
    surfaces.focus();
    const editor = document.querySelector(`[data-chid="${id}"] .ProseMirror`)!;
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const node = editor.querySelector('p')!.firstChild!;
    node.textContent += text;
    document.getSelection()!.collapse(node, node.textContent!.length);
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        data: text,
        isComposing: true,
      }),
    );
    await vi.waitFor(() => expect(core.passageRows(id)[0].text).toBe(passage.text + text));
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
  };
  try {
    await compose('a', '日本');
    await compose('b', '語');
    core.undo();
    expect(core.passageRows('a')[0].text).toBe('Alpha beta.日本');
    expect(core.passageRows('b')[0].text).toBe('Later.');
    core.undo();
    expect(core.passageRows('a')[0].text).toBe('Alpha beta.');
  } finally {
    surfaces.destroy();
  }
});

it('native start caret immediately after focus survives PM recent-focus recovery and passive refresh', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
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
  core.selectPassage(core.passageRows('a')[0].id, 11);
  surfaces.focus();
  const editor = document.querySelector('[data-chid="a"] .ProseMirror')!,
    text = editor.querySelector('p')!.firstChild!;
  document.getSelection()!.setBaseAndExtent(text, 0, text, 0);
  expect(core.selection?.from).toBe(11);
  document.dispatchEvent(new Event('selectionchange'));
  core.setBookkeeping({ wordCount: 3 });
  editor.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
  );
  expect(core.passageRows('a').map((passage) => passage.text)).toEqual(['Alpha beta.']);
  // NEO1.3.5 assigns bare Shift Enter to flush; poetry requires Mod Shift.
  expect(core.html('a')).toBe('<p class="flush">Alpha beta.</p>');
  surfaces.destroy();
});
it('a book refresh projects annotations once for all native chapter views', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
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
  const projection = vi.spyOn(core, 'annotations', 'get');
  core.setAnnotations([
    { id: 'spell-a', kind: 'spelling', passageId: core.passageRows('a')[0].id, from: 0, to: 5 },
    { id: 'spell-b', kind: 'spelling', passageId: core.passageRows('b')[0].id, from: 0, to: 5 },
  ]);
  expect(projection).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('.annotation-spelling')).toHaveLength(2);
  projection.mockClear();
  core.setBookkeeping({ wordCount: core.words });
  expect(projection).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('.annotation-spelling')).toHaveLength(2);
  projection.mockRestore();
  surfaces.destroy();
});
it('native cut and paste retain sticky note payload across mounted chapter surfaces', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open();
  core.selectPassage(core.passageRows('a')[0].id, 5);
  const id = core.createSticky('Travel with prose');
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
  core.selectAll('a');
  surfaces.focus();
  const data = new Map<string, string>();
  const clipboard = {
    clearData: () => data.clear(),
    setData: (kind: string, value: string) => data.set(kind, value),
    getData: (kind: string) => data.get(kind) ?? '',
  };
  const cut = new Event('cut', { bubbles: true, cancelable: true });
  Object.defineProperty(cut, 'clipboardData', { value: clipboard });
  document.querySelector('[data-chid="a"] .ProseMirror')!.dispatchEvent(cut);
  expect(core.stickies).toEqual([]);
  expect(data.get('text/html')).toContain(id);
  core.select('b', 1);
  surfaces.update('b', 'manuscript', true);
  surfaces.focus();
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: clipboard });
  document.querySelector('[data-chid="b"] .ProseMirror')!.dispatchEvent(paste);
  expect(core.stickies).toEqual([
    { id, chapterId: 'b', text: 'Travel with prose', resolved: false },
  ]);
  surfaces.destroy();
});
it('native root-level full-content ranges resolve to inline master endpoints', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
      undo: () => core.undo(),
      redo: () => core.redo(),
      save: () => {},
      format: (mark) => core.format(mark),
      archive: () => core.archive(),
    });
  surfaces.render(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'a',
    'notes',
    true,
  );
  core.select('notes', 1);
  surfaces.focus();
  const editor = document.querySelector('aside .ProseMirror')!,
    range = document.createRange();
  range.selectNodeContents(editor);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  expect(core.state.selection.$anchor.parent.inlineContent).toBe(true);
  expect(core.state.selection.$head.parent.inlineContent).toBe(true);
  surfaces.destroy();
});
it('explicit reveal targets the selected paragraph rather than its offscreen chapter container', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
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
  core.selectPassage(core.passageRows('b')[0].id, 3);
  const paragraph = document.querySelector<HTMLElement>('[data-chid="b"] p')!,
    reveal = vi.fn();
  paragraph.scrollIntoView = reveal;
  const revision = core.revision;
  core.selectPassage(core.passageRows('a')[0].id, 2);
  const originalSelection = core.selection;
  surfaces.revealSelection({ block: 'center', passageId: core.passageRows('b')[0].id });
  expect(core.selection).toEqual(originalSelection);
  expect(reveal).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
  expect(core.selection).toEqual(originalSelection);
  expect(core.revision).toBe(revision);
  surfaces.destroy();
});
it('opening verse skips the drop-cap candidate and speech presentation stays out of saved markup and history', () => {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div></main><aside></aside>';
  const html =
    '<p class="poetry"><i>Verse.</i></p><p>— Alpha.</p><p class="scene-break">***</p><p>— Beta.</p><p>Gamma.</p>';
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'a', html }],
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
  const host = document.querySelector('[data-chid="a"]')!;
  expect(host.classList.contains('opens-dialogue')).toBe(true);
  expect(host.querySelector('p[data-speech]')?.textContent).toBe('— Beta.');
  expect(core.html('a')).toBe(html);
  expect(core.canUndo).toBe(false);
  const opening = core.passageRows('a')[1];
  core.replacePassageText(opening.id, 0, opening.text.length, 'Plain opening.');
  expect(host.classList.contains('opens-dialogue')).toBe(false);
  expect(core.html('a')).not.toContain('data-speech');
  core.undo();
  expect(host.classList.contains('opens-dialogue')).toBe(true);
  expect(core.html('a')).toBe(html);
  surfaces.destroy();
});

it('passage identifiers decorate native blocks in chapters and notes without changing durable markup or history', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  const core = new BookCore(
      document,
      {
        formatVersion: 'neo-lifecycle/v1',
        revision: 0,
        metadata: { id: 'book', title: 'Title', author: 'Writer' },
        chapters: [{ id: 'a', html: '<p>Alpha beta.</p><h2>Heading.</h2><pre>Code.</pre>' }],
        darlings: [],
      },
      null,
      '<p>Notes.</p><h3>Note heading.</h3><pre>Note code.</pre>',
      '',
    ),
    surfaces = new ProseMirrorSurfaces(core, {
      undo: () => core.undo(),
      redo: () => core.redo(),
      save: () => {},
      format: (mark) => core.format(mark),
      archive: () => core.archive(),
    });
  const before = core.checkpoint();
  surfaces.render(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'a',
    'notes',
    true,
  );
  for (const id of ['a', 'notes']) {
    const host = document.querySelector(id === 'a' ? 'main' : 'aside')!;
    for (const passage of core.passageRows(id))
      expect(host.querySelector('[data-pid="' + passage.id + '"]')?.textContent).toBe(passage.text);
  }
  expect(core.checkpoint()).toEqual(before);
  expect(core.canUndo).toBe(false);
  const passage = core.passageRows('a')[0];
  core.replacePassageText(passage.id, 0, 5, 'Changed');
  expect(document.querySelector('[data-pid="' + passage.id + '"]')?.textContent).toBe(
    'Changed beta.',
  );
  expect(core.html('a')).not.toContain('data-pid');
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
  surfaces.destroy();
});
it('publication sheets expose the native textbox, ephemeral attribution and plain paragraph history', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
      undo: () => core.undo(),
      redo: () => core.redo(),
      save: () => {},
      format: (mark) => core.format(mark),
      archive: () => core.archive(),
    });
  surfaces.configurePresentation({
    publicationPage: { kind: 'epigraph', label: 'Epigraph', placeholder: 'Quote here…' },
  });
  core.select('a', 1);
  core.insert('— Writer ');
  const html = core.checkpoint().book.chapters[0].html;
  surfaces.render(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'a',
    'manuscript',
    true,
  );
  expect(document.querySelectorAll('.ps-body')).toHaveLength(1);
  expect(document.querySelector('aside .ProseMirror')?.getAttribute('aria-label')).toBe(
    'Book notes',
  );
  expect(document.querySelector('aside [data-ph]')).toBe(null);
  const textbox = document.querySelector<HTMLElement>('.ps-body')!;
  expect(textbox.getAttribute('contenteditable')).toBe('true');
  expect(textbox.getAttribute('aria-label')).toBe('Epigraph');
  expect(textbox.getAttribute('data-ph')).toBe('Quote here…');
  expect(textbox.querySelector('p')?.hasAttribute('data-attr')).toBe(true);
  expect(core.checkpoint().book.chapters[0].html).toBe(html);
  core.select('a', 1);
  surfaces.focus();
  for (let i = 0; i < 3; i++)
    textbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(core.chapters).toHaveLength(2);
  expect(core.checkpoint().book.chapters[0].html).not.toContain('scene-break');
  expect(textbox.querySelectorAll('p')).toHaveLength(4);
  core.undo();
  expect(textbox.querySelectorAll('p')).toHaveLength(3);
  expect(core.checkpoint().book.chapters[0].html).not.toContain('data-attr');
  surfaces.destroy();
});
it('empty publication textbox state follows author content without adding presentation to saved HTML', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Part', author: '' },
      chapters: [{ id: 'a', html: '<p></p>' }],
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
  surfaces.configurePresentation({
    publicationPage: { kind: 'part', label: 'Part I', placeholder: 'Title (optional)' },
  });
  surfaces.render(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'a',
    'manuscript',
    true,
  );
  expect(document.querySelectorAll('.ps-body')).toHaveLength(1);
  expect(document.querySelector('aside .ProseMirror')?.getAttribute('aria-label')).toBe(
    'Book notes',
  );
  expect(document.querySelector('aside [data-ph]')).toBe(null);
  const textbox = document.querySelector<HTMLElement>('.ps-body')!;
  expect(textbox.classList.contains('empty')).toBe(true);
  core.select('a', 1);
  core.insert('Journey');
  expect(textbox.classList.contains('empty')).toBe(false);
  core.undo();
  expect(textbox.classList.contains('empty')).toBe(true);
  expect(core.checkpoint().book.chapters[0].html).not.toMatch(/data-ph|data-attr|ps-body/);
  surfaces.destroy();
});
it('native passage views retain rich editable DOM through typing and rebuild changed markup with the same passage identity', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [
        {
          id: 'a',
          html: '<p class="poetry" style="text-align:right"><b>Rich</b> verse<br>line</p><h2 class="note-heading">Heading</h2><pre><code> x\n  y</code></pre>',
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
    format: (mark) => core.format(mark),
    archive: () => core.archive(),
  });
  surfaces.render(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'a',
    'manuscript',
    true,
  );
  const rows = core.passageRows('a'),
    first = document.querySelector<HTMLElement>('main p')!,
    heading = document.querySelector<HTMLElement>('main h2')!,
    code = document.querySelector<HTMLElement>('main pre')!,
    original = core.checkpoint().book.chapters[0].html;
  expect(first.dataset.pid).toBe(rows[0].id);
  expect(heading.dataset.pid).toBe(rows[1].id);
  expect(code.dataset.pid).toBe(rows[2].id);
  expect(first.style.textAlign).toBe('right');
  expect(first.querySelector('b')?.textContent).toBe('Rich');
  expect(first.querySelector('br')).not.toBe(null);
  expect(code.querySelector('code')?.textContent).toBe(' x\n  y');
  core.selectPassage(rows[1].id, 7);
  core.insert(' extended');
  expect(document.querySelector('main h2')).toBe(heading);
  expect(heading.textContent).toBe('Heading extended');
  expect(document.querySelector('main p')).toBe(first);
  core.selectPassage(rows[2].id, 6);
  core.insert('!');
  expect(document.querySelector('main pre')).toBe(code);
  expect(code.querySelector('code')?.textContent).toBe(' x\n  y!');
  core.selectPassage(rows[0].id, 0);
  core.alignParagraph('center');
  const aligned = document.querySelector<HTMLElement>('main p')!;
  expect(aligned).not.toBe(first);
  expect(aligned.dataset.pid).toBe(rows[0].id);
  expect(aligned.style.textAlign).toBe('center');
  expect(aligned.querySelector('b')?.textContent).toBe('Rich');
  core.undo();
  expect(document.querySelector<HTMLElement>('main p')!.style.textAlign).toBe('right');
  core.undo();
  core.undo();
  expect(core.checkpoint().book.chapters[0].html).toBe(original);
  expect(core.checkpoint().book.chapters[0].html).not.toContain('data-pid');
  surfaces.destroy();
});
it('publication pages without a source placeholder omit data-ph while retaining their native empty state', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
      undo: () => core.undo(),
      redo: () => core.redo(),
      save: () => {},
      format: (mark) => core.format(mark),
      archive: () => core.archive(),
    });
  surfaces.configurePresentation({ publicationPage: { kind: 'copyright', label: 'Copyright' } });
  surfaces.render(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'a',
    'manuscript',
    true,
  );
  expect(document.querySelector('.ps-body')?.hasAttribute('data-ph')).toBe(false);
  expect(document.querySelectorAll('.ps-body')).toHaveLength(1);
  surfaces.destroy();
});
it.each(['ctrlKey', 'altKey', 'metaKey'] as const)(
  'Shift Enter with %s follows 1.3.5 poetry modifiers while Tab and fullscreen retain ownership',
  (modifier) => {
    document.body.innerHTML = '<main></main><aside></aside>';
    const core = open('<p>Alpha beta.</p><pre>Code</pre>'),
      surfaces = new ProseMirrorSurfaces(core, {
        undo: () => core.undo(),
        redo: () => core.redo(),
        save: () => {},
        format: (mark) => core.format(mark),
        archive: () => core.archive(),
      });
    surfaces.render(
      document.querySelector('main')!,
      document.querySelector('aside')!,
      'a',
      'manuscript',
      true,
    );
    core.select('a', 1);
    surfaces.focus();
    const before = core.html('a'),
      key = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      });
    document.querySelector('main .ProseMirror')!.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(modifier !== 'altKey');
    if (modifier !== 'altKey') {
      expect(core.html('a')).toBe('<p class="poetry"><i>Alpha beta.</i></p><pre>Code</pre>');
      expect(core.canUndo).toBe(true);
      core.undo();
    }
    expect(core.html('a')).toBe(before);
    expect(core.canUndo).toBe(false);
    for (const shiftKey of [false, true]) {
      const tab = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      });
      document.querySelector('main .ProseMirror')!.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(false);
      expect(core.html('a')).toBe(before);
      expect(core.canUndo).toBe(false);
    }
    if (modifier !== 'altKey') {
      // The fallback ProseMirror Mod-Enter binding must not exit a code block
      // before the application's fullscreen shortcut receives the event.
      core.selectPassage(core.passageRows('a')[1].id, 2);
      surfaces.focus();
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      });
      document.querySelector('main .ProseMirror')!.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(false);
      expect(core.html('a')).toBe(before);
      expect(core.canUndo).toBe(false);
      core.select('a', 1);
      surfaces.focus();
    }
    const normal = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('main .ProseMirror')!.dispatchEvent(normal);
    expect(normal.defaultPrevented).toBe(true);
    expect(core.html('a')).toContain('class="flush"');
    surfaces.destroy();
  },
);

it('blank Notes workspace pointer focus uses the native editor and its one book history, then detaches with the surface', () => {
  document.body.innerHTML = '<main></main><aside id="aux-editor"></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
      undo: () => core.undo(),
      redo: () => core.redo(),
      save: () => {},
      format: (mark) => core.format(mark),
      archive: () => core.archive(),
    });
  const main = document.querySelector<HTMLElement>('main')!,
    host = document.querySelector<HTMLElement>('aside')!;
  surfaces.render(main, host, 'a', 'notes', true);
  main.querySelector<HTMLElement>('.ProseMirror')!.focus();
  const pointer = new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
  host.dispatchEvent(pointer);
  const native = host.querySelector<HTMLElement>('.ProseMirror')!;
  expect(document.activeElement).toBe(native);
  expect(core.selection?.chapterId).toBe('notes');
  for (const character of 'A--B') {
    if (character === '-')
      native.dispatchEvent(
        new KeyboardEvent('keydown', { key: character, bubbles: true, cancelable: true }),
      );
    core.insert(character);
  }
  expect(core.html('notes')).toContain('Notes.A—B');
  core.undo();
  expect(core.html('notes')).toContain('Notes.');
  expect(core.html('notes')).not.toContain('A—B');
  surfaces.destroy();
  host.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }));
  expect(host.querySelector('.ProseMirror')).toBeNull();
});
it('saved-caret reveal places the exact letter a third down the scroller without moving selection or creating history', async () => {
  const { EditorView } = await import('prosemirror-view');
  document.body.innerHTML =
    '<div id="paper-scroll"><main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main></div><aside></aside>';
  const core = open(),
    surfaces = new ProseMirrorSurfaces(core, {
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
  core.selectPassage(core.passageRows('b')[0].id, 3);
  const scroller = document.querySelector<HTMLElement>('#paper-scroll')!;
  Object.defineProperty(scroller, 'clientHeight', { value: 720 });
  scroller.scrollTop = 300;
  const box = vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 20,
    top: 20,
    left: 0,
    right: 800,
    bottom: 740,
    width: 800,
    height: 720,
    toJSON: () => ({}),
  });
  const coords = vi
    .spyOn(EditorView.prototype, 'coordsAtPos')
    .mockReturnValue({ top: 560, bottom: 580, left: 100, right: 100 });
  const selection = core.selection,
    revision = core.revision;
  surfaces.revealSelection({ viewportFraction: 1 / 3 });
  expect(coords).toHaveBeenCalledWith(4);
  expect(scroller.scrollTop).toBe(600);
  expect(core.selection).toEqual(selection);
  expect(core.revision).toBe(revision);
  expect(core.canUndo).toBe(false);
  coords.mockRestore();
  box.mockRestore();
  surfaces.destroy();
});
