// @vitest-environment jsdom
import JSZip from 'jszip';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { get } from 'svelte/store';
import { expect,it,vi } from 'vitest';
import { type ApplicationPlatform } from '../../apps/desktop/src/lib/application';
import { BookCore } from '../../packages/editing/prosemirror-editor/src/index';
import { fixture,fixturePlatform } from './application-fixture';
it('binding creates a real cover, writes page prose, and parks pages without deleting their files', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelf, 'novel', 'Story');
    f.vm.createChapter();
    const story = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    await f.vm.bindShelf(shelf, true);
    const bound = get(f.vm.state).library.shelves[0];
    expect(bound.binding?.bound).toBe(true);
    expect(bound.bookIds.at(-1)).toBe(story);
    const cover = bound.bookIds[0];
    expect(get(f.vm.state).books.find((b) => b.id === cover)?.kind).toBe('cover');
    await f.vm.addBoundPage(shelf, 'copyright');
    const page = get(f.vm.state).publicationPage!.bookId;
    const body = document.createElement('div'),
      auxiliary = document.createElement('div');
    document.body.append(body, auxiliary);
    f.vm.bindPublicationPage(body, auxiliary);
    expect(body.textContent).toContain('Copyright ©');
    body.remove();
    auxiliary.remove();
    await f.vm.closeBook();
    await f.vm.bindShelf(shelf, false);
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([story]);
    expect(get(f.vm.state).books.some((b) => b.id === page)).toBe(true);
    await f.vm.bindShelf(shelf, true);
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([cover, page, story]);
    await f.vm.openBook(page);
    expect(f.vm.editor!.passageRows()[0].text).toContain('Writer');
  } finally {
    await f.close();
  }
});

it('preserves every rapid focus and text-size command in memory and in the real library file', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await Promise.all([f.vm.cycleFocus(), f.vm.cycleFocus()]);
    expect(get(f.vm.state).library.focusMode).toBe('sentence');
    let sizeWrites = 0;
    const request = f.host.request.bind(f.host);
    f.host.request = async (method, payload) => {
      if (method === 'writeLibrary') sizeWrites++;
      return request(method, payload);
    };
    await Promise.all(Array.from({ length: 12 }, () => f.vm.textSize(1)));
    expect(get(f.vm.state).library.editorFontSize).toBe(22);
    const saved = JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8'));
    expect(saved.focusMode).toBe('sentence');
    expect(saved.editorFontSize).toBe(22);
    expect(sizeWrites).toBe(1);
  } finally {
    await f.close();
  }
});

it('native cover completion persists outside prose Undo and overlay commands cannot stack', async () => {
  const f = await fixture(fixturePlatform());
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Cover story');
    f.vm.createChapter();
    const bookId = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    await f.vm.openBook(bookId);
    const core = f.vm.editor!,
      chapter = core.chapters[0];
    core.select(chapter.id, 1);
    core.insert('Author sentence.');
    await f.vm.nativeCommand('cover-art');
    await f.vm.nativeCommand('body-font-pick');
    expect(get(f.vm.state).coverArt?.kind).toBe('settings');
    expect(get(f.vm.state).fontPicker).toBeNull();
    f.vm.closeCoverArt();
    await f.vm.coverArtProgress({
      bookId: get(f.vm.state).book!.id,
      jobId: '12345678-1234-4234-8234-123456789abc',
      status: 'done',
      result: {
        file: 'art-123.png',
        brief: 'Fixture',
        textModel: 'fixture-text',
        imageModel: 'fixture-image',
      },
    });
    core.undo();
    expect(core.passageRows(chapter.id)[0].text).toBe('');
    expect(core.metadata.coverMode).toBe('painted');
    expect(core.metadata.coverArt).toMatchObject({ status: 'done', file: 'art-123.png' });
  } finally {
    await f.close();
  }
});

it('closed-book cover choices merge fresh disk metadata and browser has no OS credential fallback', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Before');
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    const fresh = await f.provider.request('readBookMeta', { bookId: id });
    await f.provider.request('writeBookMeta', {
      bookId: id,
      metadata: { ...(fresh as object), title: 'Fresh disk title' },
    });
    await f.vm.chooseCover(id, 'abstract');
    expect(get(f.vm.state).books.find((book) => book.id === id)?.title).toBe('Fresh disk title');
    await f.vm.openCoverSettings();
    expect(get(f.vm.state).coverArt).toBeNull();
    expect(get(f.vm.state).hint).toContain('desktop app');
    await f.vm.openFontPicker();
    expect(get(f.vm.state).fontPicker).toBeNull();
  } finally {
    await f.close();
  }
});

it('closed cover goal choices merge fresh metadata and persist count/progress across application reload', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Goal book');
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    const previous = await f.provider.request('readBookMeta', { bookId: id });
    await f.provider.request('writeBookMeta', {
      bookId: id,
      metadata: { ...previous, wordCount: 20000, wordGoal: 40000 },
    });
    const setting = f.vm.setCoverGoal(id);
    await vi.waitFor(() => expect(get(f.vm.state).modal?.value).toBe('40000'));
    const during = await f.provider.request('readBookMeta', { bookId: id });
    await f.provider.request('writeBookMeta', {
      bookId: id,
      metadata: { ...during, author: 'Updated while prompting' },
    });
    f.vm.answer('80000');
    await setting;
    const disk = await f.provider.request('readBookMeta', { bookId: id });
    expect(disk).toMatchObject({
      wordGoal: 80000,
      wordCount: 20000,
      author: 'Updated while prompting',
    });
    expect(get(f.vm.state).books.find((book) => book.id === id)).toMatchObject(disk);
    await f.vm.initialize();
    expect(get(f.vm.state).books.find((book) => book.id === id)?.wordGoal).toBe(80000);
    const removal = f.vm.setCoverGoal(id);
    await vi.waitFor(() => expect(get(f.vm.state).modal?.value).toBe('80000'));
    f.vm.answer('');
    await removal;
    expect((await f.provider.request('readBookMeta', { bookId: id })).wordGoal).toBe(0);
  } finally {
    await f.close();
  }
});

it('open cover goal changes share author Undo while canceled cover choices leave history untouched', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Goal book');
    const id = get(f.vm.state).book!.id;
    const previousGoal = f.vm.editor?.metadata.wordGoal;
    const setting = f.vm.setCoverGoal(id);
    await vi.waitFor(() => expect(get(f.vm.state).modal).not.toBeNull());
    f.vm.answer('80000');
    await setting;
    expect(f.vm.editor?.metadata.wordGoal).toBe(80000);
    const cancel = f.vm.setCoverGoal(id);
    await vi.waitFor(() => expect(get(f.vm.state).modal).not.toBeNull());
    f.vm.answer(null);
    await cancel;
    f.vm.editor?.undo();
    expect(f.vm.editor?.metadata.wordGoal).toBe(previousGoal);
    f.vm.editor?.redo();
    expect(f.vm.editor?.metadata.wordGoal).toBe(80000);
  } finally {
    await f.close();
  }
});

it('stores the bound-book publication identity in the real library and keeps it across rename and reload', async () => {
  let destination = '';
  const f = await fixture({ selectExportFile: async () => destination });
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelfId = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelfId, 'novel', 'First story');
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('The bound story.');
    await f.vm.closeBook();
    await f.vm.bindShelf(shelfId, true);
    destination = join(f.provider.root, 'bound-first.epub');
    await f.vm.exportShelf(shelfId, 'epub');
    const libraryPath = join(f.provider.root, 'library.json');
    const saved = JSON.parse(await readFile(libraryPath, 'utf8'));
    const uuid = saved.shelves.find((shelf: { id: string }) => shelf.id === shelfId).binding.uuid;
    expect(uuid).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    const checkEpub = async () => {
      const archive = await JSZip.loadAsync(await readFile(destination));
      const opf = Object.values(archive.files).find((file) => file.name.endsWith('.opf'))!;
      expect(await opf.async('string')).toContain(`urn:uuid:${uuid}`);
    };
    await checkEpub();
    await f.vm.renameShelf(shelfId, 'Renamed collection');
    await f.vm.initialize();
    expect(
      get(f.vm.state).library.shelves.find((shelf) => shelf.id === shelfId)?.binding?.uuid,
    ).toBe(uuid);
    destination = join(f.provider.root, 'bound-second.epub');
    await f.vm.exportShelf(shelfId, 'epub');
    await checkEpub();
  } finally {
    await f.close();
  }
});

it('removes custom cover bytes and metadata without reseeding or replacing fresh book metadata', async () => {
  let source = '';
  const f = await fixture({ selectCoverImage: async () => source });
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Original title');
    const id = f.vm.editor!.metadata.id;
    await f.vm.closeBook();
    source = join(f.provider.root, 'cover.png');
    await writeFile(
      source,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN4sAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await f.vm.setCover(id);
    const before = (await f.provider.request('readBookMeta', { bookId: id })) as Record<
      string,
      unknown
    >;
    await f.provider.request('writeBookMeta', {
      bookId: id,
      metadata: { ...before, title: 'Fresh disk title', coverSeed: 'retained-seed' },
    });
    await f.vm.removeCover(id);
    const after = (await f.provider.request('readBookMeta', { bookId: id })) as Record<
      string,
      unknown
    >;
    expect(after.coverImage).toBeNull();
    expect(after.coverSeed).toBe('retained-seed');
    expect(after.title).toBe('Fresh disk title');
    expect(await f.provider.request('readCover', { bookId: id })).toBeNull();
    expect(get(f.vm.state).books.find((book) => book.id === id)?.coverImage).toBeNull();
    await f.vm.initialize();
    expect(get(f.vm.state).books.find((book) => book.id === id)?.coverImage).toBeNull();
  } finally {
    await f.close();
  }
});

it('keeps ambiguous concurrent notes untouched and recovers the complete local book through its explicit copy command', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Notes conflict');
    f.vm.createChapter();
    const editor = f.vm.editor!,
      chapter = editor.chapters[0].id;
    editor.select(chapter, 1);
    editor.insert('Story remains.');
    editor.select('notes', 1);
    editor.insert('Original notes.');
    await f.vm.save();
    const baseline = editor.checkpoint(),
      id = editor.metadata.id;
    const remote = new BookCore(
      document,
      baseline.book,
      baseline.reviews,
      baseline.notes,
      baseline.outline,
    );
    remote.select('notes', 1, 16);
    remote.insert('Incoming notes.');
    const incoming = remote.checkpoint();
    await writeFile(join(f.provider.root, id, 'manuscript.json'), JSON.stringify(incoming.book));
    await writeFile(join(f.provider.root, id, 'reviews.json'), JSON.stringify(incoming.reviews));
    await writeFile(join(f.provider.root, id, 'notes.html'), incoming.notes);
    editor.select('notes', 16);
    editor.insert(' Local addition.');
    const local = editor.checkpoint();
    await expect(f.vm.documentChanged({ bookId: id })).rejects.toThrow('COMPANION_CONFLICT');
    expect(f.vm.editor).toBe(editor);
    expect(editor.checkpoint()).toEqual(local);
    expect(get(f.vm.state).externalChange?.bookId).toBe(id);
    await expect(f.vm.save()).rejects.toThrow('EXTERNAL_CHANGE');
    expect(await readFile(join(f.provider.root, id, 'notes.html'), 'utf8')).toBe(incoming.notes);
    await f.vm.keepExternalCopy();
    const copy = f.vm.editor!.metadata.id;
    expect(copy).not.toBe(id);
    expect(f.vm.editor!.passageRows('notes')[0].text).toBe('Original notes. Local addition.');
    await f.vm.closeBook();
    await f.vm.openBook(copy);
    expect(f.vm.editor!.passageRows('notes')[0].text).toBe('Original notes. Local addition.');
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(f.vm.editor!.passageRows('notes')[0].text).toBe('Incoming notes.');
  } finally {
    if (get(f.vm.state).externalChange) await f.vm.closeBook(false);
    await f.close();
  }
});

it('exports an unbound anthology under its chosen title through exactly three author format choices', async () => {
  let destination = '';
  const platform: ApplicationPlatform = {
    selectExportFile: async (name) => {
      expect(name).toBe('Chosen anthology.epub');
      return destination;
    },
  };
  const f = await fixture(platform);
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0];
    await f.vm.newBook(shelf.id, 'novel', 'First story');
    f.vm.createChapter();
    f.vm.editor!.select(f.vm.editor!.chapters[0].id, 1);
    f.vm.editor!.insert('Anthology prose.');
    await f.vm.closeBook();
    destination = join(f.provider.root, 'anthology.epub');
    const exporting = f.vm.exportShelfAnthology(shelf.id);
    expect(get(f.vm.state).modal).toMatchObject({ title: 'Anthology title', value: shelf.name });
    expect(get(f.vm.state).modal?.input).not.toBe(false);
    f.vm.answer('Chosen anthology');
    await vi.waitFor(() =>
      expect(get(f.vm.state).modal?.choices?.map((choice) => choice.value)).toEqual([
        'epub',
        'docx',
        'pdf',
      ]),
    );
    f.vm.answer('epub');
    await exporting;
    const epub = await JSZip.loadAsync(await readFile(destination));
    const opf = await epub.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>Chosen anthology</dc:title>');
    expect(get(f.vm.state).library.shelves[0].name).toBe(shelf.name);
    expect(get(f.vm.state).books[0].title).toBe('First story');
  } finally {
    await f.close();
  }
});

it('refreshes the closed real library while preserving shelf scroll and rejects a stale read after a local shelf edit', async () => {
  const f = await fixture();
  const shelfElement = document.createElement('div');
  shelfElement.id = 'bookshelf-view';
  document.body.append(shelfElement);
  try {
    await f.vm.onboard('Writer', 'pantser');
    const baseline = structuredClone(get(f.vm.state).library);
    shelfElement.scrollTop = 231;
    const remote = structuredClone(baseline);
    remote.shelves[0].name = 'Remote shelf';
    await f.provider.request('writeLibrary', { library: remote });
    await f.vm.refreshLibraryFromDisk();
    expect(get(f.vm.state).library.shelves[0]).toMatchObject({
      id: baseline.shelves[0].id,
      name: 'Remote shelf',
    });
    expect(shelfElement.scrollTop).toBe(231);
    const request = f.host.request.bind(f.host);
    let readArrived!: () => void, releaseRead!: () => void;
    const arrived = new Promise<void>((resolve) => {
      readArrived = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    f.host.request = async (method, payload) => {
      const value = await request(method, payload);
      if (method === 'readLibrary') {
        readArrived();
        await released;
      }
      return value;
    };
    const refresh = f.vm.refreshLibraryFromDisk();
    await arrived;
    const local = structuredClone(get(f.vm.state).library);
    local.shelves[0].name = 'Newer local shelf';
    await f.vm.updateLibrary(local);
    releaseRead();
    await refresh;
    expect(get(f.vm.state).library.shelves[0].name).toBe('Newer local shelf');
    expect((await f.provider.request('readLibrary', {})).shelves[0].name).toBe('Newer local shelf');
    expect(shelfElement.scrollTop).toBe(231);

    let writeArrived!: () => void, releaseWrite!: () => void;
    const committed = new Promise<void>((resolve) => { writeArrived = resolve; });
    const writeReply = new Promise<void>((resolve) => { releaseWrite = resolve; });
    f.host.request = async (method, payload) => {
      const value = await request(method, payload);
      if (method === 'writeLibrary') { writeArrived(); await writeReply; }
      return value;
    };
    const pendingLocal = structuredClone(get(f.vm.state).library);
    pendingLocal.shelves[0].name = 'Committed local shelf';
    const writing = f.vm.updateLibrary(pendingLocal);
    await committed;
    const laterRemote = structuredClone(pendingLocal);
    laterRemote.shelves[0].name = 'Remote after durable local write';
    await f.provider.request('writeLibrary', { library: laterRemote });
    const focused = f.vm.refreshLibraryFromDisk();
    releaseWrite();
    await Promise.all([writing, focused]);
    expect(get(f.vm.state).library.shelves[0].name).toBe('Remote after durable local write');
    expect((await f.provider.request('readLibrary', {})).shelves[0].name)
      .toBe('Remote after durable local write');
    expect(shelfElement.scrollTop).toBe(231);
  } finally {
    shelfElement.remove();
    await f.close();
  }
});

it('author Undo waits for a shelf move whose durable commit precedes its host reply', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    vi.spyOn(f.vm, 'prompt').mockResolvedValue('Penny Writer');
    await f.vm.newAuthor();
    const author = get(f.vm.state).library.authors.find((row) => row.name === 'Penny Writer')!;
    const request = f.provider.request.bind(f.provider);
    let release!: () => void, reached!: () => void;
    const committed = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const reply = new Promise<void>((resolve) => {
      release = resolve;
    });
    let delay = true;
    vi.spyOn(f.provider, 'request').mockImplementation(async (method, payload) => {
      const result = await request(method, payload);
      if (method === 'writeLibrary' && delay) {
        delay = false;
        reached();
        await reply;
      }
      return result;
    });
    const move = f.vm.moveToAuthor(id, author.id);
    await committed;
    const undo = f.vm.undoAuthorMove();
    release();
    await Promise.all([move, undo]);
    await f.vm.openBook(id);
    expect(f.vm.editor!.author).toBe('Writer');
    expect(
      get(f.vm.state).library.shelves.find((row) => row.authorId === author.id)!.bookIds,
    ).not.toContain(id);
    expect(
      get(f.vm.state).library.shelves.find((row) => row.authorId !== author.id)!.bookIds,
    ).toContain(id);
  } finally {
    await f.close();
  }
});

it('a canceled postcommit shelf reply cannot compensate a successfully moved book author', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    vi.spyOn(f.vm, 'prompt').mockResolvedValue('Penny Writer');
    await f.vm.newAuthor();
    const author = get(f.vm.state).library.authors.find((row) => row.name === 'Penny Writer')!;
    const request = f.provider.request.bind(f.provider);
    let fail = true;
    vi.spyOn(f.provider, 'request').mockImplementation(async (method, payload) => {
      const result = await request(method, payload);
      if (method === 'writeLibrary' && fail) {
        fail = false;
        throw Error('CLOSED');
      }
      return result;
    });
    await f.vm.moveToAuthor(id, author.id);
    const metadata = await request('readBookMeta', { bookId: id });
    expect(metadata).toMatchObject({ author: 'Penny Writer' });
    await f.vm.openBook(id);
    expect(f.vm.editor!.author).toBe('Penny Writer');
  } finally {
    await f.close();
  }
});

it('a confirmed precommit shelf failure restores durable placement and author in the current UI', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    vi.spyOn(f.vm, 'prompt').mockResolvedValue('Penny Writer');
    await f.vm.newAuthor();
    const author = get(f.vm.state).library.authors.find((row) => row.name === 'Penny Writer')!;
    const before = structuredClone(get(f.vm.state).library);
    const request = f.provider.request.bind(f.provider);
    let fail = true;
    vi.spyOn(f.provider, 'request').mockImplementation(async (method, payload) => {
      if (method === 'writeLibrary' && fail) {
        fail = false;
        throw Error('WRITE_FAILED');
      }
      return request(method, payload);
    });
    await expect(f.vm.moveToAuthor(id, author.id)).rejects.toThrow('WRITE_FAILED');
    expect(get(f.vm.state).library).toEqual(before);
    expect(await request('readLibrary', {})).toMatchObject({ shelves: before.shelves });
    expect(await request('readBookMeta', { bookId: id })).toMatchObject({ author: 'Writer' });
    await f.vm.openBook(id);
    expect(f.vm.editor!.author).toBe('Writer');
  } finally {
    await f.close();
  }
});

it('a positioned cover drop updates its closed target while another book stays open', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelf, 'novel', 'Cover target');
    const target = f.vm.editor!.metadata.id;
    await f.vm.closeBook();
    await f.vm.newBook(shelf, 'novel', 'Current writing');
    f.vm.createChapter();
    f.vm.editor!.select(f.vm.editor!.chapters[0].id, 1);
    f.vm.editor!.insert('Keep my writing and selection.');
    const current = f.vm.editor!.metadata.id;
    const checkpoint = f.vm.editor!.checkpoint();
    const selection = f.vm.editor!.state.selection.toJSON();
    const image = join(f.provider.root, 'drop-cover.png');
    await writeFile(
      image,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN4sAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await f.vm.filesDropped({
      paths: [image],
      position: { x: 200, y: 100 },
      target: { kind: 'book', bookId: target },
    });
    expect(await f.provider.request('readCover', { bookId: target })).not.toBeNull();
    expect(await f.provider.request('readCover', { bookId: current })).toBeNull();
    expect((await f.provider.request('readBookMeta', { bookId: target })).coverMode).toBe('image');
    expect(f.vm.editor!.checkpoint()).toEqual(checkpoint);
    expect(f.vm.editor!.state.selection.toJSON()).toEqual(selection);
    // Background, stale and shelf-only targets never acquire authority over the open book.
    for (const payload of [
      { paths: [image], position: { x: 900, y: 900 } },
      {
        paths: [image],
        position: { x: 200, y: 100 },
        target: { kind: 'book', bookId: 'missing-book' },
      },
      { paths: [image], position: { x: 200, y: 100 }, target: { kind: 'shelf', shelfId: shelf } },
    ])
      await f.vm.filesDropped(payload);
    expect(await f.provider.request('readCover', { bookId: current })).toBeNull();
    expect(f.vm.editor!.checkpoint()).toEqual(checkpoint);
  } finally {
    await f.close();
  }
});

it('a positioned manuscript drop imports into the chosen shelf rather than the first shelf', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const library = await f.provider.request('readLibrary', {});
    const shelf = { ...library.shelves[0], id: 'second-shelf', name: 'Dropped here', bookIds: [] };
    await f.provider.request('writeLibrary', {
      library: { ...library, shelves: [...library.shelves, shelf] },
    });
    await f.vm.initialize();
    const source = join(f.provider.root, 'chosen-shelf.txt');
    const original = 'Chapter One\n\nChosen shelf writing.\n';
    await writeFile(source, original);
    await f.vm.filesDropped({
      paths: [source],
      position: { x: 100, y: 400 },
      target: { kind: 'shelf', shelfId: shelf.id },
    });
    const durable = await f.provider.request('readLibrary', {});
    expect(durable.shelves[0].bookIds).toEqual([]);
    expect(durable.shelves[1].bookIds).toEqual([get(f.vm.state).books[0].id]);
    expect(await readFile(source, 'utf8')).toBe(original);
  } finally {
    await f.close();
  }
});

it('shelf drops resolve before and after placement once against current owned order and persist the exact sequence', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const library = get(f.vm.state).library;
    const shelves = ['first', 'middle', 'last'].map((id) => ({
      id,
      name: id,
      authorId: library.currentAuthorId!,
      bookIds: [],
    }));
    await f.provider.request('writeLibrary', { library: { ...library, shelves } });
    await f.vm.initialize();
    await f.vm.dropShelf('first', 'middle', false);
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(['first', 'middle', 'last']);
    await f.vm.dropShelf('last', 'first', true);
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(['first', 'last', 'middle']);
    await f.vm.dropShelf('middle', 'first', false);
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(['middle', 'first', 'last']);
    await f.vm.dropShelf('middle', 'last', true);
    const expected = ['first', 'last', 'middle'];
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(expected);
    const saved = JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8'));
    expect(saved.shelves.map((s: { id: string }) => s.id)).toEqual(expected);
    await f.vm.dropShelf('missing', 'first', false);
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(expected);
  } finally {
    await f.close();
  }
});
