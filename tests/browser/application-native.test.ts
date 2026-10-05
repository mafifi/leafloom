// @vitest-environment jsdom
import JSZip from 'jszip';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'svelte/store';
import { expect,it,vi } from 'vitest';
import { BookFiles } from '../../packages/documents/filesystem-documents/src/index';
import { fixture,fixturePlatform } from './application-fixture';
it('flushes a still-focused margin note on close and undoes resolving both note and flag together', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('Hello');
    const sticky = core.createSticky('');
    f.vm.updateSticky(sticky, 'Finish this thought');
    const id = core.metadata.id;
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(f.vm.editor!.stickies.find((note) => note.id === sticky)?.text).toBe(
      'Finish this thought',
    );
    f.vm.resolveSticky(sticky, true);
    expect(f.vm.editor!.stickies).toHaveLength(0);
    expect(f.vm.editor!.checkpoint().book.chapters[0].html).not.toContain('data-sid');
    f.vm.undo();
    expect(f.vm.editor!.stickies[0].text).toBe('Finish this thought');
    expect(f.vm.editor!.checkpoint().book.chapters[0].html).toContain(sticky);
  } finally {
    await f.close();
  }
});

it('native font picker previews, restores and commits a safely quoted installed family without moving author history', async () => {
  const f = await fixture(fixturePlatform());
  try {
    await f.vm.nativeCommand('body-font-pick');
    expect(get(f.vm.state).fontPicker?.rows).toEqual(['Georgia', 'Installed Face']);
    f.vm.previewFont('Installed Face');
    expect(document.documentElement.style.getPropertyValue('--body-font')).toBe(
      '"Installed Face", Georgia, serif',
    );
    f.vm.closeFontPicker();
    expect(document.documentElement.style.getPropertyValue('--body-font')).toContain('Georgia');
    await f.vm.openFontPicker();
    await f.vm.chooseFont('Installed Face');
    expect(get(f.vm.state).library.fonts.body).toBe('Installed Face');
    expect(document.documentElement.style.getPropertyValue('--body-font')).toBe(
      '"Installed Face", Georgia, serif',
    );
    const resize = f.vm.textSize(1);
    expect(document.documentElement.style.getPropertyValue('--body-font')).toBe(
      '"Installed Face", Georgia, serif',
    );
    await resize;
    expect(f.vm.bodyFontStyle('Odd "Family"\\Name')).toBe('"Odd FamilyName", Georgia, serif');
  } finally {
    await f.close();
  }
});

it('email settings and draft route a saved real manuscript fingerprint through fixture OS without launching mail', async () => {
  const platform = fixturePlatform();
  const request = platform.os!.request.bind(platform.os);
  let envelope: unknown;
  platform.os!.request = async (method, payload) => {
    if (method === 'emailDraft') {
      envelope = payload;
      return true;
    }
    return request(method, payload);
  };
  const f = await fixture(platform);
  try {
    const settings = f.vm.openEmailSettings();
    expect(get(f.vm.state).modal?.title).toBe('Email drafts to');
    f.vm.answer('writer@example.com');
    await settings;
    expect(get(f.vm.state).library.emailMethod).toBe('gmail');
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Email story');
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('A saved email sentence.');
    await f.vm.nativeCommand('email-draft');
    expect(envelope).toMatchObject({ to: 'writer@example.com', method: 'gmail' });
    expect(JSON.stringify(envelope)).toMatch(/[a-f0-9]{64}/);
  } finally {
    await f.close();
  }
});

it('chapter context guards prose and exports the selected saved chapter through its format choices', async () => {
  const exportsRoot = await mkdtemp(join(tmpdir(), 'leafloom-chapter-output-'));
  const platform = fixturePlatform();
  platform.selectExportFile = async (name) => join(exportsRoot, name);
  const f = await fixture(platform);
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Output book');
    f.vm.createChapter();
    const core = f.vm.editor!,
      first = core.chapters[0];
    core.select(first.id, 1);
    core.insert('Only the first chapter.');
    f.vm.createChapter();
    const second = core.chapters[1];
    core.select(second.id, 1);
    core.insert('Second chapter must stay out.');
    const menu = f.vm.chapterContext(first.id, 0);
    expect(menu.find((item) => item.label === 'Contents')?.disabled).toBe(true);
    expect(menu.find((item) => item.label === 'Chapter')?.checked).toBe(true);
    expect(menu.find((item) => item.label === 'Move up')?.disabled).toBe(true);
    const output = f.vm.exportChapter(first.id);
    expect(get(f.vm.state).modal?.choices?.map((choice) => choice.value)).toEqual([
      'txt',
      'md',
      'html',
      'pdf',
      'docx',
      'epub',
    ]);
    f.vm.answer('txt');
    await output;
    const text = await readFile(join(exportsRoot, (first.title || first.label) + '.txt'), 'utf8');
    expect(text).toContain('Only the first chapter.');
    expect(text).not.toContain('Second chapter must stay out.');
    await f.vm.closeBook();
    expect(get(f.vm.state).books[0].title).toBe('Output book');
  } finally {
    await f.close();
    await rm(exportsRoot, { recursive: true, force: true });
  }
});

it('later writing style changes future books without moving the currently open author workspace', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelf, 'novel', 'Current');
    expect(get(f.vm.state).panel).toBe('manuscript');
    await f.vm.nativeCommand('writing-style:plotter');
    expect(get(f.vm.state).panel).toBe('manuscript');
    await f.vm.closeBook();
    expect(await f.provider.request('readLibrary', {})).toMatchObject({ writingStyle: 'plotter' });
    await f.vm.newBook(shelf, 'novel', 'Future outline');
    expect(get(f.vm.state).panel).toBe('outline');
    await f.vm.nativeCommand('writing-style:pantser');
    expect(get(f.vm.state).panel).toBe('outline');
    await f.vm.closeBook();
    await f.vm.newBook(shelf, 'novel', 'Future manuscript');
    expect(get(f.vm.state).panel).toBe('manuscript');
  } finally {
    await f.close();
  }
});

it('persists a pending margin note without dismissing an author menu', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('A note belongs here.');
    const sticky = core.createSticky('');
    await f.vm.save();
    await f.vm.save();
    f.vm.updateSticky(sticky, 'Keep this thought');
    f.vm.menu(new MouseEvent('click', { clientX: 20, clientY: 20 }), [
      { label: 'Keep reading', run: () => {} },
    ]);
    const menu = get(f.vm.state).menu;
    expect(menu).not.toBeNull();
    await vi.waitFor(
      () => {
        expect(core.stickies.find((note) => note.id === sticky)?.text).toBe('Keep this thought');
        expect(get(f.vm.state).dirty).toBe(false);
      },
      { timeout: 3000 },
    );
    expect(get(f.vm.state).menu).toBe(menu);
    await f.vm.closeBook();
    await f.vm.openBook(core.metadata.id);
    expect(f.vm.editor!.stickies.find((note) => note.id === sticky)?.text).toBe(
      'Keep this thought',
    );
  } finally {
    await f.close();
  }
});

it('native Undo and Redo consume empty draft-field history without reversing saved manuscript writing', async () => {
  const f = await fixture();
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  field.tabIndex = 0;
  document.body.append(field);
  const previous = Object.getOwnPropertyDescriptor(document, 'execCommand');
  const native = vi.fn(() => false);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: native });
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('Keep this writing.');
    await f.vm.save();
    const revision = core.revision;
    field.focus();
    await f.vm.nativeCommand('undo');
    await f.vm.nativeCommand('redo');
    expect(native.mock.calls).toEqual([['undo'], ['redo']]);
    expect(document.activeElement).toBe(field);
    expect(core.revision).toBe(revision);
    expect(core.passageRows(core.chapters[0].id)[0].text).toBe('Keep this writing.');
    await f.vm.closeBook();
    await f.vm.openBook(core.metadata.id);
    expect(f.vm.editor!.passageRows(core.chapters[0].id)[0].text).toBe('Keep this writing.');
  } finally {
    field.remove();
    if (previous) Object.defineProperty(document, 'execCommand', previous);
    else Reflect.deleteProperty(document, 'execCommand');
    await f.close();
  }
});

it('imports a later valid manuscript after an earlier file fails without changing either input', async () => {
  const paths: string[] = [];
  const f = await fixture({ selectImportFiles: async () => paths });
  try {
    await f.vm.onboard('Writer', 'pantser');
    const broken = join(f.provider.root, 'broken.docx');
    const valid = join(f.provider.root, 'after-good.txt');
    const original = 'Chapter One\n\nStill here.\n';
    await writeFile(broken, 'not a ZIP archive');
    await writeFile(valid, original);
    paths.push(broken, valid);
    await f.vm.importBooks();
    const books = get(f.vm.state).books;
    expect(books).toHaveLength(1);
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([books[0].id]);
    expect(get(f.vm.state).hint).toMatch(/1.*(?:failed|error)/i);
    expect(await readFile(broken, 'utf8')).toBe('not a ZIP archive');
    expect(await readFile(valid, 'utf8')).toBe(original);
    await f.vm.openBook(books[0].id);
    expect(f.vm.editor!.passageRows(f.vm.editor!.chapters[0].id).map((row) => row.text)).toContain(
      'Still here.',
    );
    await f.vm.closeBook();
    await f.vm.initialize();
    expect(get(f.vm.state).books.map((book) => book.id)).toEqual([books[0].id]);
  } finally {
    await f.close();
  }
});

it('keeps one durable publication UUID across EPUB exports, reopen and author Undo', async () => {
  let destination = '';
  const f = await fixture({ selectExportFile: async () => destination });
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('Keep this publication identity.');
    core.setMetadata({ subtitle: 'First edition' });
    core.insert(' More.');
    destination = join(f.provider.root, 'first.epub');
    await f.vm.exportBook('epub');
    const publicationId = core.metadata.uuid;
    expect(publicationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    const checkEpub = async () => {
      const archive = await JSZip.loadAsync(await readFile(destination));
      const opf = Object.values(archive.files).find((file) => file.name.endsWith('.opf'));
      expect(opf).toBeDefined();
      expect(await opf!.async('string')).toContain(`urn:uuid:${publicationId}`);
    };
    await checkEpub();
    core.undo();
    expect(core.metadata.uuid).toBe(publicationId);
    expect(core.passageRows(core.chapters[0].id)[0].text).toBe('Keep this publication identity.');
    core.redo();
    await f.vm.closeBook();
    await f.vm.openBook(core.metadata.id);
    expect(f.vm.editor!.metadata.uuid).toBe(publicationId);
    destination = join(f.provider.root, 'second.epub');
    await f.vm.exportBook('epub');
    await checkEpub();
    const durable = JSON.parse(
      await readFile(join(f.provider.root, core.metadata.id, 'manuscript.json'), 'utf8'),
    );
    expect(durable.metadata.uuid).toBe(publicationId);
  } finally {
    await f.close();
  }
});

it('imports a later valid dropped manuscript after malformed DOCX without altering either input', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const broken = join(f.provider.root, 'dropped-broken.docx');
    const valid = join(f.provider.root, 'dropped-good.txt');
    const invalidBytes = Buffer.from('not a ZIP archive');
    const original = Buffer.from('Chapter One\n\nDropped prose stays intact.\n');
    await writeFile(broken, invalidBytes);
    await writeFile(valid, original);
    await f.vm.filesDropped({ paths: [broken, valid] });
    const books = get(f.vm.state).books;
    expect(books).toHaveLength(1);
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([books[0].id]);
    expect(get(f.vm.state).hint).toMatch(/Imported 1 book; 1 failed/);
    expect(await readFile(broken)).toEqual(invalidBytes);
    expect(await readFile(valid)).toEqual(original);
    const durable = await new BookFiles(join(f.provider.root, books[0].id)).load(false);
    expect(durable.book.chapters.map((chapter) => chapter.html)).toEqual([
      '<p>Dropped prose stays intact.</p>',
    ]);
    await f.vm.openBook(books[0].id);
    expect(f.vm.editor!.passageRows(f.vm.editor!.chapters[0].id).map((row) => row.text)).toEqual([
      'Dropped prose stays intact.',
    ]);
    await f.vm.closeBook();
    await f.vm.initialize();
    expect(get(f.vm.state).books.map((book) => book.id)).toEqual([books[0].id]);
    expect(await readFile(broken)).toEqual(invalidBytes);
    expect(await readFile(valid)).toEqual(original);
  } finally {
    await f.close();
  }
});
