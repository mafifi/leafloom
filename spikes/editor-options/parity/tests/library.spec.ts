import { test, expect, type Page, type ElectronApplication } from '@playwright/test';
import { readFile, access, writeFile, mkdir, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createReferenceDirectory, launchReference, removeReferenceDirectory } from '../reference/harness';
import { onboard, book, shelf, authorMenu, option, input, readLibrary, libraryPath, nativeMenu } from './library-helpers';
for (const engine of ['original', 'prosemirror'] as const) {
  test.describe(engine, () => {
    let directory: string; let app: ElectronApplication; let page: Page;
    test.beforeEach(async () => { directory = await realpath(await createReferenceDirectory()); app = await launchReference(directory, engine === 'original' ? undefined : engine); page = await app.firstWindow(); if (engine === 'prosemirror') await page.waitForFunction(() => 'neoProseMirror' in window); });
    test.afterEach(async () => { await app?.close(); await removeReferenceDirectory(directory); });
    test('[NEO-001-A] first-run name and Anonymous survive restart', async () => {
      await onboard(page, { name: '' }); await expect(page.locator('#author-chip')).toHaveText('Anonymous');
      const created = await book(page, 'Anonymous Book');
      expect(JSON.parse(await readFile(path.join(libraryPath(directory), created.bookId, 'book.json'), 'utf8')).author).toBe('Anonymous');
      await app.close(); app = await launchReference(directory, engine === 'original' ? undefined : engine); page = await app.firstWindow();
      await expect(page.locator('.new-book')).toBeVisible(); await expect(page.locator('#firstrun')).toBeHidden();
    });
    test('[NEO-002-A] onboarding pen name is stored and pen-only identity authors new books', async () => {
      await onboard(page, { name: '', pen: 'Pen Only' }); await expect(page.locator('#author-chip')).toHaveText('Pen Only');
      expect((await readLibrary(directory)).penNames).toEqual(['Pen Only']); const created = await book(page, 'Pen Book');
      expect(JSON.parse(await readFile(path.join(libraryPath(directory), created.bookId, 'book.json'), 'utf8')).author).toBe('Pen Only');
    });
    test('[NEO-003-A] plotter opens Outline and native writing-style menu changes future defaults', async () => {
      await onboard(page, { style: 'plotter' }); await page.locator('.new-book').click();
      await expect(page.locator('.tab[data-tab="outline"]')).toHaveClass(/active/);
      await page.locator('#back-to-shelf').click(); await nativeMenu(app, 'Blank Page');
      await page.locator('.new-book').click(); await expect(page.locator('.tab[data-tab="manuscript"]')).toHaveClass(/active/);
      expect((await readLibrary(directory)).writingStyle).toBe('pantser');
    });
    test('[NEO-004-A] font/dropcap preview changes and chosen values persist', async () => {
      await page.locator('.fr-choice[data-style="pantser"]').click();
      const before = await page.locator('#fr-sample-text').evaluate(el => getComputedStyle(el).fontFamily);
      const picked = await page.locator('#fr-bodyfonts button').nth(1).innerText(); await page.locator('#fr-bodyfonts button').nth(1).click();
      const after = await page.locator('#fr-sample-text').evaluate(el => getComputedStyle(el).fontFamily); expect(after).not.toBe(before);
      await page.locator('#fr-dropcaps button').nth(1).click(); await page.locator('#fr-done').click();
      expect((await readLibrary(directory)).fonts).toMatchObject({ body: picked, dropcap: 'fantasy' });
    });
    test('[NEO-005-A] shelf plus opens title page; title Enter creates first story chapter and files', async () => {
      await onboard(page); const created = await book(page, 'New Story');
      const meta = JSON.parse(await readFile(path.join(libraryPath(directory), created.bookId, 'book.json'), 'utf8'));
      expect(meta.title).toBe('New Story'); expect(meta.chapterOrder).toEqual([created.chapterId]);
      await access(path.join(libraryPath(directory), created.bookId, 'chapters', created.chapterId + '.html'));
    });
    test('[NEO-006-A] new shelf rename commits on Enter and reload retains name', async () => {
      await onboard(page); await shelf(page, 'Finished'); expect((await readLibrary(directory)).shelves.at(-1)!.name).toBe('Finished');
      await page.reload(); await expect(page.locator('.shelf-label').last()).toHaveText('Finished');
    });
    test('[NEO-007-A] real shelf drag changes visible and persisted order', async () => {
      await onboard(page); await shelf(page, 'Second'); await shelf(page, 'Third');
      const id = await page.locator('.shelf').last().getAttribute('data-shelf-id');
      await page.locator('.shelf-grip').last().dragTo(page.locator('.shelf').first(), { targetPosition: { x: 100, y: 5 } });
      await expect.poll(async () => (await readLibrary(directory)).shelves[0].id).toBe(id);
      await expect(page.locator('.shelf-label').first()).toHaveText('Third');
    });
    test('[NEO-008-A] real book drag reorders a shelf without duplicate ids', async () => {
      await onboard(page); const a = await book(page, 'First'); const b = await book(page, 'Second');
      await page.locator(`[data-book-id="${b.bookId}"]`).dragTo(page.locator(`[data-book-id="${a.bookId}"]`), { targetPosition: { x: 5, y: 70 } });
      await expect.poll(async () => (await readLibrary(directory)).shelves[0].bookIds).toEqual([b.bookId, a.bookId]);
      expect(await page.locator('.book').evaluateAll(els => els.map(el => (el as HTMLElement).dataset.bookId))).toEqual([b.bookId, a.bookId]);
    });
    test('[NEO-009-A] real book drag into empty shelf persists without duplicates', async () => {
      await onboard(page); const created = await book(page, 'Travel'); await shelf(page, 'Destination');
      await page.locator(`[data-book-id="${created.bookId}"]`).dragTo(page.locator('.shelf').last().locator('.new-book'));
      await expect.poll(async () => (await readLibrary(directory)).shelves.map(s => s.bookIds)).toEqual([[], [created.bookId]]);
      await page.reload(); await expect(page.locator('.shelf').last().locator('.book')).toHaveCount(1);
    });
    test('[NEO-010-A] dragging book near lower window edge scrolls long shelf view', async () => {
      await onboard(page); const created = await book(page, 'Scrolling Book');
      for (let n = 0; n < 12; n++) await shelf(page, 'Shelf ' + n);
      await page.locator('#bookshelf-view').evaluate(el => { el.scrollTop = 0; });
      await page.locator(`[data-book-id="${created.bookId}"]`).scrollIntoViewIfNeeded();
      const tile = await page.locator(`[data-book-id="${created.bookId}"]`).boundingBox();
      const height = await page.evaluate(() => window.innerHeight);
      await page.mouse.move(tile!.x + 40, tile!.y + 60); await page.mouse.down();
      await page.mouse.move(tile!.x + 40, height - 8, { steps: 20 });
      await expect.poll(() => page.locator('#bookshelf-view').evaluate(el => el.scrollTop)).toBeGreaterThan(50);
      await page.mouse.up();
    });
    test('[NEO-011-A] dragging book through author rack changes author and placement', async () => {
      await onboard(page); await authorMenu(page, 'Add a pen name'); await input(page, 'Other'); await authorMenu(page, 'Write as Library Writer');
      const created = await book(page, 'Travelling Author'); const tile = page.locator(`[data-book-id="${created.bookId}"]`); const bounds = await tile.boundingBox(); const chip = await page.locator('#author-chip').boundingBox();
      await page.mouse.move(bounds!.x + 40, bounds!.y + 60); await page.mouse.down(); await page.mouse.move(chip!.x + 15, chip!.y + 10, { steps: 15 });
      await expect(page.locator('.pen-slot')).toHaveText('Other'); const slot = await page.locator('.pen-slot').boundingBox(); await page.mouse.move(slot!.x + 20, slot!.y + 10, { steps: 8 }); await page.mouse.up();
      await expect.poll(async () => JSON.parse(await readFile(path.join(libraryPath(directory), created.bookId, 'book.json'), 'utf8')).author).toBe('Other');
      await expect(page.locator('.book')).toHaveCount(0); await authorMenu(page, 'Write as Other'); await expect(page.locator('.book')).toHaveCount(1);
    });
    test('[NEO-012-A] cross-author shelf move keyboard undo restores author and original index', async () => {
      await onboard(page); await authorMenu(page, 'Add a pen name'); await input(page, 'Other'); await authorMenu(page, 'Write as Library Writer');
      const created = await book(page, 'Undo Placement'); const bounds = await page.locator(`[data-book-id="${created.bookId}"]`).boundingBox(); const chip = await page.locator('#author-chip').boundingBox();
      await page.mouse.move(bounds!.x + 40, bounds!.y + 60); await page.mouse.down(); await page.mouse.move(chip!.x + 15, chip!.y + 10, { steps: 15 });
      await expect(page.locator('.pen-slot')).toHaveText('Other'); const slot = await page.locator('.pen-slot').boundingBox(); await page.mouse.move(slot!.x + 20, slot!.y + 10, { steps: 8 }); await page.mouse.up();
      await expect(page.locator('.book')).toHaveCount(0); await page.keyboard.press('Meta+z');
      await expect(page.locator('.book')).toHaveCount(1); await expect.poll(async () => (await readLibrary(directory)).shelves[0].bookIds).toEqual([created.bookId]);
      expect(JSON.parse(await readFile(path.join(libraryPath(directory), created.bookId, 'book.json'), 'utf8')).author).toBe('Library Writer');
    });
    test('[NEO-013-A] author switching isolates shelves and new-book author', async () => {
      await onboard(page); await shelf(page, 'Home Shelf'); await authorMenu(page, 'Add a pen name'); await input(page, 'Other');
      await expect(page.locator('.shelf-label')).toHaveText('Works in Progress'); const created = await book(page, 'Other Story');
      expect(JSON.parse(await readFile(path.join(libraryPath(directory), created.bookId, 'book.json'), 'utf8')).author).toBe('Other');
      await authorMenu(page, 'Write as Library Writer'); await expect(page.locator('.shelf-label')).toHaveCount(2); await expect(page.locator('.book')).toHaveCount(0);
    });
    test('[NEO-014-A] rename author persists identity while book directory remains', async () => {
      await onboard(page); const created = await book(page, 'Keep My Book'); await authorMenu(page, 'Rename Library Writer'); await input(page, 'Renamed');
      await expect(page.locator('#author-chip')).toHaveText('Renamed'); expect((await readLibrary(directory)).authors[0].name).toBe('Renamed'); await access(path.join(libraryPath(directory), created.bookId, 'book.json'));
    });
    test('[NEO-015-A] adding a pen name creates identity and initial owned shelf', async () => {
      await onboard(page); await authorMenu(page, 'Add a pen name'); await input(page, 'New Pen'); await expect(page.locator('#author-chip')).toHaveText('New Pen');
      const library = await readLibrary(directory); const author = library.authors.find(a => a.name === 'New Pen'); expect(author).toBeTruthy(); expect(library.currentAuthorId).toBe(author!.id); expect(library.shelves.some(s => s.authorId === author!.id)).toBe(true);
      const created = await book(page, 'Pen Debut'); expect(JSON.parse(await readFile(path.join(libraryPath(directory), created.bookId, 'book.json'), 'utf8')).author).toBe('New Pen');
    });
    test('[NEO-016-A] removing author reassigns shelves and retains book files', async () => {
      await onboard(page); await authorMenu(page, 'Add a pen name'); await input(page, 'Temporary'); const created = await book(page, 'Surviving Book');
      await authorMenu(page, 'Remove Temporary'); await expect(page.locator('#author-chip')).toHaveText('Library Writer');
      const library = await readLibrary(directory); expect(library.authors).toHaveLength(1); expect(library.shelves.every(s => !s.authorId || s.authorId === library.authors[0].id)).toBe(true); await access(path.join(libraryPath(directory), created.bookId, 'book.json')); await expect(page.locator('.book')).toHaveCount(1);
    });
    test('[NEO-018-A] trash cancel and failure retain book; confirmation moves only fixture book to private trash', async () => {
      await onboard(page); const created = await book(page, 'Trash Candidate'); const folder = path.join(libraryPath(directory), created.bookId);
      const host = path.join(directory, '.neo-parity-host.json');
      const trash = async () => { await page.locator('.book').click({ button: 'right' }); await option(page, 'Move to Trash'); };
      await writeFile(host, JSON.stringify({ messageResponses: [0] })); await trash(); await expect(page.locator('.book')).toHaveCount(1); await access(path.join(folder, 'book.json'));
      await writeFile(host, JSON.stringify({ messageResponses: [1], trashError: true })); await trash(); await expect(page.locator('.book')).toHaveCount(1); await access(path.join(folder, 'book.json'));
      await expect.poll(async () => JSON.parse(await readFile(path.join(directory, 'intercepted-effects.json'), 'utf8')).some((effect: { type: string }) => effect.type === 'reveal-file')).toBe(true);
      await writeFile(host, JSON.stringify({ messageResponses: [1], trashError: false })); await trash(); await expect(page.locator('.book')).toHaveCount(0);
      await expect(access(path.join(folder, 'book.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      const trashed = (await readdir(path.join(directory, 'Trash'))).find(name => name.startsWith(created.bookId)); expect(trashed).toBeTruthy();
      expect(JSON.parse(await readFile(path.join(directory, 'Trash', trashed!, 'book.json'), 'utf8')).id).toBe(created.bookId);
    });
    for (const title of ['[NEO-017-A] remove then native File Reshelve restores orphan without deleting files', '[NEO-019-A] remove then native File Reshelve restores orphan without deleting files']) test(title, async () => {
      await onboard(page); const created = await book(page, 'Recoverable'); await page.locator('.book').click({ button: 'right' }); await option(page, 'Remove from bookshelf');
      await expect(page.locator('.book')).toHaveCount(0); await access(path.join(libraryPath(directory), created.bookId, 'book.json'));
      await nativeMenu(app, 'Reshelve a Book'); await option(page, 'Recoverable'); await expect(page.locator('.book')).toHaveCount(1); expect((await readLibrary(directory)).shelves[0].bookIds).toEqual([created.bookId]);
    });
    test('[NEO-020-A] library picker cancel retains files; custom folder restart and return-to-default preserve both libraries', async () => {
      await onboard(page); const created = await book(page, 'Original Library Book');
      const host = path.join(directory, '.neo-parity-host.json'); const custom = path.join(directory, 'Alternate Library'); await mkdir(custom);
      const settings = path.join(directory, 'userData', 'settings.json'); const before = JSON.parse(await readFile(settings, 'utf8')).libraryDir;
      await writeFile(host, JSON.stringify({ messageResponses: [1], openPaths: [custom] })); await nativeMenu(app, 'Library Folder');
      expect(JSON.parse(await readFile(settings, 'utf8')).libraryDir).toBe(before); await expect(page.locator('.book')).toHaveCount(1);
      await writeFile(host, JSON.stringify({ messageResponses: [0], openPaths: [custom] }));
      let closed = app.waitForEvent('close'); await nativeMenu(app, 'Library Folder'); await closed;
      expect(JSON.parse(await readFile(settings, 'utf8')).libraryDir).toBe(custom); await access(path.join(libraryPath(directory), created.bookId, 'book.json'));
      app = await launchReference(directory, engine === 'original' ? undefined : engine); page = await app.firstWindow();
      await expect(page.locator('#firstrun')).toBeVisible(); await onboard(page, { name: 'Alternate Writer' }); const alternate = await book(page, 'Alternate Library Book');
      await access(path.join(custom, alternate.bookId, 'book.json')); await expect(page.locator('.book')).toHaveCount(1);
      await writeFile(host, JSON.stringify({ messageResponses: [1] })); closed = app.waitForEvent('close'); await nativeMenu(app, 'Library Folder'); await closed;
      expect(JSON.parse(await readFile(settings, 'utf8')).libraryDir).toBeUndefined();
      app = await launchReference(directory, engine === 'original' ? undefined : engine); page = await app.firstWindow();
      await expect(page.locator('#firstrun')).toBeHidden(); await expect(page.locator('.book')).toHaveAttribute('data-book-id', created.bookId); await access(path.join(custom, alternate.bookId, 'book.json'));
    });
    test('[NEO-021-A] library map names real title and its shelf', async () => {
      await onboard(page); await shelf(page, 'Finished Works'); const created = await book(page, 'Catalogued', 1);
      await expect.poll(async () => readFile(path.join(libraryPath(directory), '_catalog.txt'), 'utf8')).toContain(`Catalogued  —  ${created.bookId}  —  shelf: Finished Works`);
    });
    test('[NEO-022-A] empty shelf new-book and author controls are keyboard reachable', async () => {
      await onboard(page); const plus = page.locator('.new-book'); await expect(plus).toHaveAttribute('role', 'button'); await expect(plus).toHaveAttribute('tabindex', '0');
      await plus.focus(); await page.keyboard.press('Enter'); await expect(page.locator('#tp-title')).toBeVisible(); await page.locator('#back-to-shelf').click();
      await page.locator('#author-chip').focus(); await page.keyboard.press('Enter'); await expect(page.locator('.modal-backdrop:not([hidden])')).toBeVisible();
    });
  });
}
