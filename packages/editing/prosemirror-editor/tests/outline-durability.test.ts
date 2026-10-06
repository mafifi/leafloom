import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BookCore } from '../src/core';
import { BookFiles } from '../../../documents/filesystem-documents/src/files';
const document = new JSDOM('').window.document;
for (const written of [false, true]) it(`promotion rich Undo/Redo keeps original passage identities and ${written ? 'written following ownership' : 'carried note order'}`, () => {
  const core = new BookCore(document, { formatVersion: 'neo-lifecycle/v1', revision: 0, metadata: { id: 'book', title: 'Title', author: 'Writer', sectionNotes: { owner: [{ id: 'a', text: 'First plan' }, { id: 'b', text: 'Second plan' }, { id: 'c', text: 'Third plan' }] } }, chapters: [{ id: 'owner', html: '<p data-sec-id="a"><b>Written stays.</b></p><p class="scene-break" data-sec-brk="b">***</p><p data-sec-id="b"' + (written ? '' : ' class="ghost"') + '>Second plan</p>' }], darlings: [] }, null, '', '');
  const before = core.checkpoint(), passages = core.passageRows('owner'), reference = core.capture(passages[0].id, 0, 'Written stays.'.length);
  const promoted = core.outlineIndent({ chapterId: 'owner', sectionId: 'a' }, true).target;
  const after = core.checkpoint(), notes = after.book.metadata.sectionNotes as Record<string, { id: string }[]>;
  expect(notes[written ? 'owner' : promoted.chapterId].map(n => n.id)).toEqual(['b', 'c']);
  expect(core.html('owner')).toContain('<b>Written stays.</b>'); expect(core.resolve(reference.id).status).toBe('current');
  core.undo(); expect(core.checkpoint().book.chapters).toEqual(before.book.chapters); expect(core.metadata.sectionNotes).toEqual(before.book.metadata.sectionNotes);
  expect(core.passageRows('owner').map(p => p.id)).toEqual(passages.map(p => p.id)); expect(core.resolve(reference.id).status).toBe('current');
  core.redo(); expect(core.checkpoint().book.chapters).toEqual(after.book.chapters); expect(core.metadata.sectionNotes).toEqual(after.book.metadata.sectionNotes);
  const saved = core.checkpoint(), reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.metadata.sectionNotes).toEqual(after.book.metadata.sectionNotes); expect(reopened.html('owner')).toContain('<b>Written stays.</b>');
});
it('real filesystem join replacement keeps the complete source durable until receiver and removal become one atomic manuscript', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-outline-atomic-')), folder = join(root, 'book'); await mkdir(folder);
  const source = { formatVersion: 'neo-lifecycle/v1', revision: 0, metadata: { id: 'book', title: 'Title', author: 'Writer', chapterNotes: { sender: 'Sender plan' }, sectionNotes: { sender: [{ id: 'owned', text: 'Owned note' }] } }, chapters: [{ id: 'receiver', html: '<p>Receiver words.</p>' }, { id: 'sender', html: '<p><i>Sender rich words.</i></p><p class="scene-break" data-sec-brk="owned">***</p><p data-sec-id="owned"><b>Owned rich section.</b></p>' }], darlings: [] };
  await writeFile(join(folder, 'manuscript.json'), JSON.stringify(source));
  let interrupt = true; const stages: string[] = [];
  const files = new BookFiles(folder, async stage => {
    const temporary = (await readdir(folder)).some(name => /^manuscript\.json\..*\.tmp$/.test(name));
    if (stage === 'temporary.synced' && temporary && interrupt) { interrupt = false; throw Error('INTERRUPTED_JOIN_BEFORE_ATOMIC_REPLACE'); }
    if (stage === 'current.replaced' && JSON.parse(await readFile(join(folder, 'manuscript.json'), 'utf8')).chapters.length === 1) stages.push(stage);
  });
  try {
    await files.acquire(); const opened = await files.load(), core = new BookCore(document, opened.book, opened.reviews, opened.notes, opened.outline);
    core.joinOutlineChapter('sender', 'receiver'); const joined = core.checkpoint();
    await expect(files.checkpoint(joined, opened.versions)).rejects.toThrow('INTERRUPTED_JOIN_BEFORE_ATOMIC_REPLACE');
    const interrupted = JSON.parse(await readFile(join(folder, 'manuscript.json'), 'utf8'));
    expect(interrupted.chapters).toEqual(source.chapters); expect(interrupted.metadata.sectionNotes).toEqual(source.metadata.sectionNotes);
    const receipt = await files.checkpoint(joined, opened.versions), durable = await files.load();
    expect(durable.versions).toEqual(receipt.versions); expect(durable.book.chapters).toHaveLength(1);
    expect(durable.book.chapters[0].html).toContain('<i>Sender rich words.</i>'); expect(durable.book.chapters[0].html).toContain('<b>Owned rich section.</b>');
    expect(durable.book.metadata.sectionNotes).toEqual(joined.book.metadata.sectionNotes); expect(stages).toContain('current.replaced');
    core.undo(); const restored = core.checkpoint(); await files.checkpoint(restored, receipt.versions);
    const reopened = await files.load(); expect(reopened.book.chapters.map(c => c.id)).toEqual(['receiver', 'sender']);
    expect(reopened.book.chapters[1].html).toContain('<b>Owned rich section.</b>'); expect(reopened.book.metadata.sectionNotes).toEqual(source.metadata.sectionNotes);
  } finally { await files.release(); await rm(root, { recursive: true, force: true }); }
});
