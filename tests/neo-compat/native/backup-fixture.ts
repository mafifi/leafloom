// Initial state only. No BackupProvider import or request method.
import { JSDOM } from 'jsdom';
import { BookCore } from '../../../packages/editing/prosemirror-editor/src/core';
import { Library } from '../../../packages/library/src/index';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function seed(root: string, text = 'First day Καλημέρα.') {
  const id = 'book-backup-fixture';
  const core = new BookCore(
    new JSDOM('').window.document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: {
        id,
        title: 'Backup fixture',
        author: 'Backup writer',
        chapterTitles: { rich: 'Opening' },
        chapterNotes: { other: 'Retained chapter note' },
        stickies: [{ id: 'retained', chapterId: 'rich', text: 'Retained note', resolved: false }],
      },
      chapters: [
        {
          id: 'rich',
          html: '<p><b>' + text + '</b><span class="ph-mark" data-sid="retained">⚑</span></p>',
        },
        { id: 'other', html: '<p><i>Other rich chapter.</i></p>' },
      ],
      darlings: [],
    },
    null,
    '<p><b>Retained research.</b></p>',
    '<p><i>Retained plan.</i></p>',
  );
  const checkpoint = core.checkpoint();
  await mkdir(join(root, id), { recursive: true });
  const files = {
    'library.json': JSON.stringify(
      Library.parse({
        firstRunDone: true,
        authorName: 'Backup writer',
        authors: [{ id: 'writer', name: 'Backup writer' }],
        currentAuthorId: 'writer',
        shelves: [{ id: 'shelf', name: 'Backup shelf', authorId: 'writer', bookIds: [id] }],
        coverArt: { auto: false },
      }),
    ),
    [id + '/manuscript.json']: JSON.stringify(checkpoint.book),
    [id + '/reviews.json']: JSON.stringify(checkpoint.reviews),
    [id + '/notes.html']: checkpoint.notes,
    [id + '/outline.html']: checkpoint.outline,
  };
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(root, name), bytes);
  return files;
}
