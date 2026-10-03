// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'svelte/store';
import { Application } from '../../apps/desktop/src/lib/application';
import { LibraryHost } from '../../apps/desktop/host/library';
import { BookCore, ProseMirrorSurfaces } from '../../packages/editing/prosemirror-editor/src/index';
import type {
  DesktopHost,
  HostMethod,
  HostPayload,
  HostResult,
} from '../../packages/host/desktop-host/src/index';

it('checkpoints stable heading/code bookmarks and paragraph-only legacy indexes through the real host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-reading-bookmarks-'));
  const provider = new LibraryHost(root);
  await provider.initialize();
  const host: DesktopHost = {
    async request<T>(method: HostMethod, payload: HostPayload<HostMethod>): Promise<HostResult<T>> {
      return { ok: true, value: (await provider.request(method, payload)) as T };
    },
  };
  const vm = new Application(
    host,
    (opened, actions) => {
      const editor = new BookCore(
        document,
        opened.book,
        opened.reviews,
        opened.notes,
        opened.outline,
      );
      return { editor, surfaces: new ProseMirrorSurfaces(editor, actions) };
    },
    async () => {},
  );
  try {
    await vm.initialize();
    await vm.onboard('Writer', 'pantser');
    await vm.newBook(get(vm.state).library.shelves[0].id, 'novel', 'Mixed blocks');
    vm.createChapter();
    const id = vm.editor!.metadata.id,
      chapterId = vm.editor!.chapters[0].id;
    await vm.closeBook();
    const path = join(root, id, 'manuscript.json');
    const book = JSON.parse(await readFile(path, 'utf8'));
    const rich =
      '<h2>Heading</h2><p><b>Alpha.</b></p><pre><code>Code</code></pre><p><i>Gamma.</i></p>';
    const prepared = new BookCore(
      document,
      {
        formatVersion: 'neo-lifecycle/v1',
        revision: 0,
        metadata: book.metadata,
        chapters: [{ id: chapterId, html: rich }],
        darlings: [],
      },
      null,
      '',
      '',
    ).checkpoint();
    await writeFile(path, JSON.stringify(prepared.book));
    await writeFile(join(root, id, 'reviews.json'), JSON.stringify(prepared.reviews));
    document.body.innerHTML = '<div id="paper-scroll"><div class="chapter-body"></div></div>';
    await vm.openBook(id);
    const editor = vm.editor!,
      rows = editor.passageRows(chapterId);
    const body = document.querySelector('.chapter-body')!;
    for (const row of [rows[0], rows[2], rows[3]]) {
      editor.selectPassage(row.id, 2);
      const text = document.createTextNode(row.text);
      body.replaceChildren(text);
      window.getSelection()!.setBaseAndExtent(text, 2, text, 2);
      await vm.save();
      const persisted = JSON.parse(await readFile(path, 'utf8'));
      expect(persisted.metadata.lastPosition).toMatchObject({
        chapterId,
        passageId: row.id,
        from: 2,
        to: 2,
      });
      if (row.kind === 'paragraph')
        expect(persisted.metadata.lastPosition).toMatchObject({ pIdx: 1, off: 2 });
      else {
        expect(persisted.metadata.lastPosition).not.toHaveProperty('pIdx');
        expect(persisted.metadata.lastPosition).not.toHaveProperty('off');
      }
      const reopened = new BookCore(document, persisted, editor.checkpoint().reviews);
      expect(reopened.restoreSelection(persisted.metadata.lastPosition)).toBe(true);
      expect(reopened.selection).toMatchObject({ passageId: row.id, from: 2, to: 2 });
      expect(reopened.html(chapterId)).toBe(rich);
    }
  } finally {
    await vm.closeBook();
    document.body.replaceChildren();
    await provider.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
