import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
const open = () =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [
        { id: 'a', html: '<p>Alpha.</p><p class="scene-break">***</p><p><i>Beta.</i></p>' },
        { id: 'b', html: '<p>Later.</p>' },
      ],
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '',
  );
it('active formatting projects the caret paragraph without changing history or serializing', () => {
  const core = open();
  core.selectPassage(core.passageRows('a')[2].id, 0);
  expect(core.activeFormatting).toEqual({ poetry: false, align: 'left' });
  core.alignParagraph('justify');
  core.togglePoetry();
  const revision = core.revision;
  expect(core.activeFormatting).toEqual({ poetry: true, align: 'justify' });
  expect(core.revision).toBe(revision);
  core.select('notes', 1);
  expect(core.activeFormatting).toEqual({ poetry: false, align: 'left' });
  core.undo();
  expect(core.activeFormatting).toEqual({ poetry: false, align: 'justify' });
});
it('paragraph alignment touches marked prose but skips scene breaks and shares native Undo', () => {
  const core = open();
  core.selectAll('a');
  expect(core.alignParagraph('center')).toBe(true);
  expect(core.html('a')).toBe(
    '<p style="text-align: center;">Alpha.</p><p class="scene-break">***</p><p style="text-align: center;"><i>Beta.</i></p>',
  );
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha.</p><p class="scene-break">***</p><p><i>Beta.</i></p>');
  core.select('notes', 1);
  expect(core.alignParagraph('right')).toBe(false);
});
it('left alignment removes only the selected paragraph alignment', () => {
  const core = open();
  core.selectPassage(core.passageRows('a')[2].id, 0);
  core.alignParagraph('right');
  core.alignParagraph('left');
  expect(core.html('a')).not.toContain('text-align');
  core.undo();
  expect(core.html('a')).toContain('text-align: right');
});
it('generated Contents excludes front pages, nests parts, adds body part title and resets for back pages', () => {
  const core = open();
  core.setChapterKind('a', 'part');
  core.setMetadata({ title: 'Title' });
  core.renameChapter('b', 'Return');
  const contents = core.createChapter('');
  core.setChapterKind(contents, 'contents');
  const back = core.createChapter('');
  core.setChapterKind(back, 'acknowledgments');
  expect(core.contentsRows()).toEqual([
    { chapterId: 'a', label: 'Part I: Alpha.', type: 'part', level: 0 },
    { chapterId: 'b', label: 'Chapter 1 — Return', type: 'chapter', level: 1 },
    { chapterId: back, label: 'Acknowledgments', type: 'page', level: 0 },
  ]);
  expect(core.contentsRows(true)[1].label).toBe('Return');
});
it('a solo numbered story disappears from Contents while unnumbered stories keep their title', () => {
  const core = open();
  core.setChapterKind('b', 'dedication');
  expect(core.contentsRows()).toEqual([]);
  core.setChapterKind('a', 'unnumbered');
  core.renameChapter('a', 'A Quiet Day');
  expect(core.contentsRows()).toEqual([
    { chapterId: 'a', label: 'A Quiet Day', type: 'chapter', level: 0 },
  ]);
});

it('Poetry menu returns caret to the first touched paragraph and stands down in Notes', () => {
  const core = open();
  core.selectPassage(core.passageRows('a')[0].id, 3, 5);
  core.togglePoetry();
  expect(core.selection?.from).toBe(0);
  expect(core.html('a')).toContain('class="poetry"');
  core.select('notes', 2);
  const before = core.revision;
  core.togglePoetry();
  expect(core.revision).toBe(before);
  expect(core.html('notes')).toBe('<p>Notes.</p>');
});
it('author italic override in reopened empty poetry preserves roman verse through save and subsequent typing', () => {
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'a', html: '<p class="poetry"></p>' }],
      darlings: [],
    },
    null,
    '',
    '',
  );
  core.select('a', 1);
  core.format('italic');
  core.insert('Roman verse.');
  expect(core.html('a')).toBe('<p class="poetry">Roman verse.</p>');
  const checkpoint = core.checkpoint();
  const reopened = new BookCore(
    document,
    checkpoint.book,
    checkpoint.reviews,
    checkpoint.notes,
    checkpoint.outline,
  );
  const passage = reopened.passageRows('a')[0];
  reopened.selectPassage(passage.id, passage.size);
  reopened.insert(' Next.');
  expect(reopened.html('a')).toBe('<p class="poetry">Roman verse. Next.</p>');
  expect(reopened.activeFormatting.poetry).toBe(true);
});
it('empty Copyright kind initializes translated plain paragraphs with the kind in one Undo and keeps the original author snapshot', () => {
  const core = open(),
    id = core.createChapter('');
  core.select(id, 1);
  const before = core.html(id);
  core.setChapterKind(id, 'copyright', {
    copyrightStarter: { notice: 'Copyright © 2026 A <Writer>', rights: 'Tous droits réservés.' },
  });
  expect(core.html(id)).toBe(
    '<p>Copyright © 2026 A &lt;Writer&gt;</p><p>Tous droits réservés.</p>',
  );
  expect(core.chapters.find((chapter) => chapter.id === id)?.kind).toBe('copyright');
  core.updateMetadata({ author: 'Next author' });
  core.undo();
  expect(core.metadata.author).toBe('Writer');
  expect(core.html(id)).toContain('A &lt;Writer&gt;');
  core.undo();
  expect(core.html(id)).toBe(before);
  expect(core.chapters.find((chapter) => chapter.id === id)?.kind).toBe('chapter');
  core.redo();
  expect(core.html(id)).toContain('Tous droits réservés.');
  expect(core.chapters.find((chapter) => chapter.id === id)?.kind).toBe('copyright');
  core.redo();
  expect(core.metadata.author).toBe('Next author');
});
it('Copyright starter preserves existing prose, flags, scene breaks and planned ghosts without changing their source markup', () => {
  const examples = [
    '<p><i>Written.</i></p>',
    '<p><span class="ph-mark" data-sid="kept" contenteditable="false">⚑</span></p>',
    '<p class="scene-break">***</p>',
    '<p class="ghost" data-sec-id="plan">Planned.</p>',
  ];
  for (const html of examples) {
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
    const before = core.html('a');
    core.setChapterKind('a', 'copyright', {
      copyrightStarter: { notice: 'Copyright © 2026 Writer', rights: 'All rights reserved.' },
    });
    expect(core.html('a')).toBe(before);
    core.undo();
    expect(core.html('a')).toBe(before);
    expect(core.chapters[0].kind).toBe('chapter');
  }
});
it('invalid Copyright options fail before changing chapter kind or history', () => {
  const core = open(),
    revision = core.revision;
  expect(() =>
    core.setChapterKind('b', 'copyright', {
      copyrightStarter: { notice: '', rights: 'All rights reserved.' },
    }),
  ).toThrow();
  expect(core.revision).toBe(revision);
  expect(core.canUndo).toBe(false);
});
