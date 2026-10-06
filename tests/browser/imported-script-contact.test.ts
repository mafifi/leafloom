// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './application-fixture';
import { readScreenplay } from '../../apps/desktop/host/screenplay-formats';

const importedContact = 'imported@example.test\nSecond contact line';
const original = 'Title: Imported Script\nAuthor: External Writer\nContact:\n    imported@example.test\n    Second contact line\n\nINT. ROOM - DAY\n\n!**Moves.**\n';
for (const route of ['menu', 'drop'] as const) {
  for (const initial of ['empty', 'existing', 'staged-empty'] as const) {
    it(`${route} screenplay import retains contact through shelf placement and export (${initial})`, async () => {
      const paths: string[] = [];
      const f = await fixture({ selectImportFiles: async () => paths });
      try {
        await f.vm.onboard('Writer', 'pantser');
        if (initial !== 'empty') {
          await f.vm.updateLibrary({ ...get(f.vm.state).library, scriptContact: 'Existing author contact' }, false);
        }
        if (initial === 'staged-empty') {
          await f.vm.newScript(get(f.vm.state).library.shelves[0].id);
          // A still-pending author deletion is intent, even though its live
          // string is empty. Import must not replace it with external text.
          f.vm.editScriptTitle('contact', '');
        }
        const source = join(f.provider.root, 'imported.fountain');
        await writeFile(source, original);
        paths.push(source);
        if (route === 'menu') await f.vm.importBooks();
        else await f.vm.filesDropped({ paths });
        const state = get(f.vm.state), imported = state.books.find(book => book.title === 'Imported Script')!;
        expect(imported).toBeDefined();
        expect(state.library.shelves[0].bookIds).toContain(imported.id);
        const wanted = initial === 'existing' ? 'Existing author contact' : initial === 'staged-empty' ? '' : importedContact;
        expect(state.library.scriptContact).toBe(wanted);
        await f.vm.finishScriptContact();
        await f.vm.closeBook();
        expect((await f.provider.request('readLibrary', {}) as { scriptContact: string }).scriptContact).toBe(wanted);
        for (const format of ['fountain', 'fdx'] as const) {
          const destination = join(f.provider.root, route + '.' + format);
          await f.provider.request('exportBook', { bookId: imported.id, format, destination, language: 'en' });
          const script = readScreenplay(await readFile(destination, 'utf8'), format);
          expect(script.title.contact ?? '').toBe(wanted);
          expect(script.lines.map(line => line.runs.map(run => run.text).join(''))).toEqual(['INT. ROOM - DAY', 'Moves.']);
          expect(script.lines[1].runs.find(run => run.text === 'Moves.')?.marks).toContain('bold');
        }
        await f.vm.initialize();
        expect(get(f.vm.state).library.scriptContact).toBe(wanted);
        expect(await readFile(source, 'utf8')).toBe(original);
      } finally {
        await f.close();
      }
    });
  }
}
