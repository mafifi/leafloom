// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { get } from 'svelte/store';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './application-fixture';
import { applicationActions } from '../../apps/desktop/src/lib/application-actions';
import { SourceBook } from '../../packages/documents/document-contracts/src/index';
it('a cold shelf projects authoritative v2 screenplay mode without rewriting a book lacking the legacy format alias', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newScript(get(f.vm.state).library.shelves[0].id);
    const id = get(f.vm.state).book!.id,
      editor = f.vm.editor!,
      chapter = editor.chapters[0].id;
    editor.selectPassage(editor.passageRows(chapter)[0].id, 0);
    editor.insert('INT. ROOM - DAY');
    await f.vm.closeBook();
    const path = join(f.provider.root, id, 'manuscript.json'),
      saved = JSON.parse(await readFile(path, 'utf8'));
    expect(saved.mode).toBe('screenplay');
    delete saved.metadata.format;
    const canonical = JSON.stringify(SourceBook.parse(saved), null, 2) + '\n';
    await writeFile(path, canonical);
    const books = await f.provider.request('listBooks', {}) as { id: string; format?: string }[];
    expect(books.find(book => book.id === id)?.format).toBe('screenplay');
    await f.vm.refreshLibraryFromDisk();
    expect(get(f.vm.state).books.find(book => book.id === id)?.format).toBe('screenplay');
    expect(await readFile(path, 'utf8')).toBe(canonical);
  } finally {
    await f.close();
  }
});
it('New Script initializes one empty chapter and source title defaults before open even for a plotter, preserving initial author history and shelf identity', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Script Writer', 'plotter');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.preference('tabDefaults', { notes: 'Research', outline: 'Plan' });
    await applicationActions(f.vm).newScript(shelf);
    const state = get(f.vm.state),
      id = state.book!.id,
      editor = f.vm.editor!,
      chapter = editor.chapters[0].id,
      passage = editor.passageRows(chapter)[0].id;
    expect(state.panel).toBe('manuscript');
    expect(editor.manuscriptMode).toBe('screenplay');
    expect(editor.chapters).toHaveLength(1);
    expect(editor.words).toBe(0);
    expect(state.book).toMatchObject({
      format: 'screenplay',
      credit: 'Written by',
      author: 'Script Writer',
      tabNames: { notes: 'Research', outline: 'Outline' },
    });
    expect(state.library.shelves[0].bookIds).toEqual([id]);
    editor.selectPassage(passage, 0);
    editor.insert('Opening.');
    editor.undo();
    expect(editor.passageRows(chapter)[0]).toMatchObject({ id: passage, text: '' });
    expect(editor.chapters).toHaveLength(1);
    editor.redo();
    await f.vm.closeBook();
    const saved = JSON.parse(await readFile(join(f.provider.root, id, 'manuscript.json'), 'utf8'));
    expect(saved.metadata.format).toBe('screenplay');
    expect(saved.chapters[0].id).toBe(chapter);
    expect(saved.chapters[0].passages[0].id).toBe(passage);
    await f.vm.openBook(id);
    expect(f.vm.editor!.passageRows(chapter)[0]).toMatchObject({ id: passage, text: 'Opening.' });
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([id]);
  } finally {
    await f.close();
  }
});
it('New Script cannot be placed in a bound collection', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.bindShelf(shelf, true);
    const before = structuredClone(get(f.vm.state).library),
      books = get(f.vm.state).books.map((book) => book.id);
    await f.vm.newScript(shelf);
    expect(get(f.vm.state).library).toEqual(before);
    expect(get(f.vm.state).books.map((book) => book.id)).toEqual(books);
  } finally {
    await f.close();
  }
});
it('scene navigation and keyboard menu bindings resolve the same reordered passage and preserve rich scene IDs and notes through one author history', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.newScript(shelf);
    const editor = f.vm.editor!,
      ch = editor.chapters[0].id;
    editor.selectPassage(editor.passageRows(ch)[0].id, 0);
    editor.insert('INT. ROOM - DAY');
    editor.enter();
    editor.format('italic');
    editor.insert('First action.');
    editor.format('italic');
    editor.enter();
    editor.insert('EXT. ROAD - NIGHT');
    editor.enter();
    editor.format('bold');
    editor.insert('Second action.');
    editor.format('bold');
    const scenes = editor.screenplayScenes,
      ids = editor.passageRows(ch).map((p) => p.id);
    editor.saveOutlineCard(
      { kind: 'scene', chapterId: ch, passageId: scenes[0].passageId },
      'First intention',
    );
    editor.saveOutlineCard(
      { kind: 'scene', chapterId: ch, passageId: scenes[1].passageId },
      'Second intention',
    );
    const notes = structuredClone(editor.metadata.sceneNotes);
    expect(
      f.vm.outlineBoard.drop(
        { kind: 'scene', chapterId: ch, passageId: scenes[1].passageId },
        { kind: 'scene', chapterId: ch, passageId: scenes[0].passageId },
        'before',
      ),
    ).toBe(true);
    expect(editor.passageRows(ch).map((p) => p.id)).toEqual([ids[2], ids[3], ids[0], ids[1]]);
    expect(editor.metadata.sceneNotes).toEqual(notes);
    editor.undo();
    expect(editor.passageRows(ch).map((p) => p.id)).toEqual(ids);
    editor.redo();
    const pid = scenes[0].passageId;
    f.vm.focusScreenplayScene(pid);
    expect(editor.caret).toMatchObject({ passageId: pid, offset: 15 });
    const bookId = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    await f.vm.openBook(bookId);
    expect(f.vm.editor!.passageRows(ch).map((p) => p.id)).toEqual([ids[2], ids[3], ids[0], ids[1]]);
    expect(f.vm.editor!.metadata.sceneNotes).toEqual(notes);
    expect(f.vm.editor!.html(ch)).toContain('<i>First action.</i>');
    expect(f.vm.editor!.html(ch)).toContain('<b>Second action.</b>');
  } finally {
    await f.close();
  }
});
