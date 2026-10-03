// Source-only startup oracle. Intended location: tests/neo-compat/reference/backup-startup.spec.ts.
import { test, expect, type ElectronApplication } from '@playwright/test';
import { readFile, writeFile, mkdir, readdir, rm, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';
import { createReferenceDirectory, launchReference } from './harness';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const late = '2099-04-03T23:59:00.000Z',
  next = '2099-04-04T00:01:00.000Z';
for (const mode of ['retention', 'rollover', 'partial'] as const) {
  test(
    mode === 'retention'
      ? '[NEO-233-A] actual startup ZIP retains fourteen UTC dates and exact readable author files with exclusions'
      : mode === 'rollover'
        ? '[NEO-233-B] actual startup keeps same-day ZIP bytes and captures changed author files after UTC rollover'
        : '[NEO-234-A] actual startup ZIP retains readable author files and reports a real permission-denied input',
    async () => {
      const fixture = await createReferenceDirectory(),
        root = path.join(fixture, 'Documents', 'NEO Library'),
        id = 'book-backup-fixture',
        folder = path.join(root, id);
      let app: ElectronApplication | undefined;
      const files: Record<string, string> = {
        'library.json': JSON.stringify({
          firstRunDone: true,
          authorName: 'Backup writer',
          authors: [{ id: 'writer', name: 'Backup writer' }],
          currentAuthorId: 'writer',
          shelves: [{ id: 'shelf', name: 'Backup shelf', authorId: 'writer', bookIds: [id] }],
          coverArt: { auto: false },
        }),
        [id + '/book.json']: JSON.stringify({
          id,
          title: 'Backup fixture',
          author: 'Backup writer',
          chapterOrder: ['rich', 'other'],
          chapterTitles: { rich: 'Opening' },
          chapterNotes: { other: 'Retained chapter note' },
        }),
        [id + '/chapters/rich.html']:
          '<p><b>First day Καλημέρα.</b><span class="ph-mark" data-sid="retained">⚑</span></p>',
        [id + '/chapters/other.html']: '<p><i>Other rich chapter.</i></p>',
        [id + '/notes.html']: '<p><b>Retained research.</b></p>',
        [id + '/outline.html']: '<p><i>Retained plan.</i></p>',
        [id + '/darlings.json']: JSON.stringify([
          {
            id: 'saved-darling',
            html: '<p><b>Cut words.</b></p>',
            text: 'Cut words.',
            chapterId: 'rich',
            date: '2026-10-03T00:00:00Z',
          },
        ]),
        [id + '/stickies.json']: JSON.stringify([
          { id: 'retained', chapterId: 'rich', text: 'Retained note', resolved: false },
        ]),
      };
      const backups = path.join(root, 'Backups'),
        first = path.join(backups, 'neo-backup-2099-04-03.zip');
      const launch = async (date: string) => {
        await writeFile(
          path.join(fixture, '.neo-parity-host.json'),
          JSON.stringify({ clockNowIso: date }),
        );
        app = await launchReference(fixture);
        const page = await app.firstWindow();
        await expect(page.locator('#bookshelf-view')).toBeVisible();
      };
      const close = async () => {
        await app?.close();
        app = undefined;
      };
      const verify = async (file: string, expected: Record<string, string>) => {
        await expect
          .poll(() =>
            readFile(file)
              .then(() => true)
              .catch(() => false),
          )
          .toBe(true);
        const bytes = await readFile(file),
          zip = await JSZip.loadAsync(bytes);
        for (const [name, text] of Object.entries(expected))
          expect(await zip.file(name)!.async('string')).toBe(text);
        expect(
          Object.keys(zip.files).some(
            (n) =>
              n.startsWith('Backups/') ||
              n.startsWith('Exports/') ||
              n.endsWith('.DS_Store') ||
              /^\..+\.icloud$/.test(path.basename(n)),
          ),
        ).toBe(false);
        return { bytes, zip };
      };
      try {
        for (const [name, text] of Object.entries(files)) {
          await mkdir(path.dirname(path.join(root, name)), { recursive: true });
          await writeFile(path.join(root, name), text);
        }
        await mkdir(backups, { recursive: true });
        await mkdir(path.join(root, 'Exports'));
        await writeFile(path.join(root, 'Exports', 'excluded.txt'), 'Export exclusion');
        await writeFile(path.join(root, '.DS_Store'), 'Finder exclusion');
        await writeFile(path.join(folder, '.draft.icloud'), 'Cloud exclusion');
        if (mode === 'retention')
          for (let day = 1; day <= 16; day++)
            await writeFile(
              path.join(backups, `neo-backup-2000-01-${String(day).padStart(2, '0')}.zip`),
              await new JSZip()
                .file('old.txt', 'Old snapshot ' + day)
                .generateAsync({ type: 'nodebuffer' }),
            );
        const denied = path.join(root, 'permission-denied.txt');
        if (mode === 'partial') {
          await writeFile(denied, 'Denied supplemental input');
          await chmod(denied, 0);
          await expect(readFile(denied)).rejects.toMatchObject({ code: 'EACCES' });
        }
        await launch(late);
        const initial = await verify(first, files);
        await close();
        if (mode === 'partial') {
          expect(initial.zip.file('permission-denied.txt')).toBeNull();
          expect(await initial.zip.file('_left-out-of-this-backup.txt')!.async('string')).toContain(
            'permission-denied.txt (EACCES)',
          );
          expect(await readFile(path.join(root, 'neo-errors.log'), 'utf8')).toContain(
            'permission-denied.txt',
          );
        }
        if (mode === 'retention') {
          expect((await readdir(backups)).sort()).toEqual([
            ...Array.from(
              { length: 13 },
              (_, i) => `neo-backup-2000-01-${String(i + 4).padStart(2, '0')}.zip`,
            ),
            'neo-backup-2099-04-03.zip',
          ]);
          await launch(late);
          await close();
          expect(sha(await readFile(first))).toBe(sha(initial.bytes));
        }
        if (mode === 'rollover') {
          files[id + '/chapters/rich.html'] =
            '<p><b>Second day 東京.</b><span class="ph-mark" data-sid="retained">⚑</span></p>';
          await writeFile(
            path.join(root, id, 'chapters', 'rich.html'),
            files[id + '/chapters/rich.html'],
          );
          await launch(late);
          await close();
          expect(await readFile(first)).toEqual(initial.bytes);
          await launch(next);
          await verify(path.join(backups, 'neo-backup-2099-04-04.zip'), files);
          await close();
          expect((await readdir(backups)).sort()).toEqual([
            'neo-backup-2099-04-03.zip',
            'neo-backup-2099-04-04.zip',
          ]);
          expect(await readFile(first)).toEqual(initial.bytes);
          await launch(next);
          await close();
          expect((await readdir(backups)).sort()).toEqual([
            'neo-backup-2099-04-03.zip',
            'neo-backup-2099-04-04.zip',
          ]);
        }
      } finally {
        await close();
        await chmod(path.join(root, 'permission-denied.txt'), 0o600).catch(() => {});
        await rm(fixture, { recursive: true, force: true });
      }
    },
  );
}
