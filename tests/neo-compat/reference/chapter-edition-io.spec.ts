import { test, expect } from '../candidate/author-fixture';
import { existingBook } from '../candidate/book-fixture';
import { persistedBook, privateStorageRoot } from '../candidate/storage-probe';
import { clickReferenceMenu } from './harness';
import { chapterEditionFixture, inspectChapterEdition } from '../shared/chapter-edition-io.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';

async function menu(page: Page, id: string) {
  await page.locator(`.nav-item[data-id="${id}"] .n-row`).click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
}
async function gap(page: Page, index: number) {
  const plus = page
    .locator('#nav-list .nav-gap')
    .nth(index)
    .getByRole('button', { name: 'Add', exact: true });
  await plus.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => {
      const box = await plus.boundingBox();
      if (!box) return false;
      await page.mouse.move(box.x + box.width / 2 - 1, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      return plus.evaluate((button) => {
        const box = button.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button;
      });
    })
    .toBe(true);
  await plus.click();
}

test('[NEO-053-A][NEO-055-A][NEO-259-B] actual edited edition exports reset Contents and unique Part and unnumbered headings before and after author restructuring', async ({
  page,
}) => {
  const { title, ...metadata } = chapterEditionFixture.metadata;
  const c = await existingBook(page, { ...chapterEditionFixture, metadata });
  await c.driver.title(title);
  await c.driver.select(4, 0, 0);
  await page.keyboard.type('Edited ');
  await page.locator('#nav-hotzone').hover();
  await page.locator('#nav-pin').click();
  await menu(page, 'ch-4');
  await page
    .getByRole('menu')
    .getByText('Restart Chapter Numbers at Each Part', { exact: true })
    .click();
  await expect(page.locator('.chapter[data-id="ch-5"] .ch-num')).toHaveText('Chapter 1');
  await expect(page.locator('.chapter[data-id="ch-7"] .ch-num')).toHaveText('Chapter 1');
  const root = path.resolve(privateStorageRoot(page), '../..');
  const stage = async (name: 'before' | 'after') => {
    const live = await c.driver.paragraphs();
    for (const format of ['html', 'md'] as const) {
      const destination = path.join(root, `chapter-edition-${name}.${format}`);
      await writeFile(
        path.join(root, '.neo-parity-host.json'),
        JSON.stringify({ savePath: destination }),
      );
      await clickReferenceMenu(page, [
        'File',
        'Export',
        format === 'html' ? 'Web Page (.html)' : 'Markdown (.md)',
      ]);
      await expect
        .poll(() =>
          readFile(destination).then(
            (bytes) => bytes.length,
            () => 0,
          ),
        )
        .toBeGreaterThan(100);
      const bytes = await readFile(destination);
      await test.info().attach(`chapter-edition-${name}.${format}`, {
        body: bytes,
        contentType: format === 'html' ? 'text/html' : 'text/markdown',
      });
      const artifact = inspectChapterEdition(format, bytes, name);
      await test.info().attach(`parsed-${name}-${format}.json`, {
        body: Buffer.from(JSON.stringify(artifact)),
        contentType: 'application/json',
      });
    }
    await c.driver.expectParagraphs(live);
    await c.driver.shelf();
    const saved = await persistedBook(page, title, c.id);
    expect(saved.metadata.restartNumbering).toBe(true);
    expect(saved.chapters.find((chapter: { id: string }) => chapter.id === 'ch-5')?.html).toContain(
      'Edited Alpha <b>bold</b>',
    );
    expect(saved.chapters.find((chapter: { id: string }) => chapter.id === 'ch-9')?.html).toBe(
      '<p>Unnamed prose.</p>',
    );
    expect(saved.metadata.chapterTitles['ch-8']).toBe('Interlude');
    expect(saved.metadata.chapterTitles['ch-9']).toBe('');
    expect(saved.notes).toBe(chapterEditionFixture.notes);
    await test.info().attach(`actual-book-${name}.json`, {
      body: Buffer.from(JSON.stringify(saved)),
      contentType: 'application/json',
    });
    await page.reload();
    await c.driver.selectBook(title);
    await c.driver.expectParagraphs(live);
    return saved;
  };
  await stage('before');
  if (!(await page.locator('#nav-pane').evaluate((nav) => nav.classList.contains('open'))))
    await page.locator('#nav-hotzone').hover();
  if ((await page.locator('#nav-pin').getAttribute('aria-pressed')) !== 'true')
    await page.locator('#nav-pin').click();
  const ids = await page
    .locator('.nav-item')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-id')));
  await gap(page, 6);
  await page.getByRole('menuitem', { name: 'Part', exact: true }).click();
  const inserted = await page
    .locator('.nav-item')
    .evaluateAll(
      (rows, old) => rows.map((row) => row.getAttribute('data-id')).find((id) => !old.includes(id)),
      ids,
    );
  expect(typeof inserted).toBe('string');
  await page.locator('.nav-item[data-id="ch-6"] .n-row').scrollIntoViewIfNeeded();
  const source = await page.locator('.nav-item[data-id="ch-6"] .n-row').boundingBox();
  const target = await page.locator('.nav-item[data-id="ch-5"]').boundingBox();
  if (!source || !target) throw Error('Missing actual Part drag targets');
  await page.mouse.move(source.x + 30, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 42, source.y + source.height / 2 + 5, { steps: 3 });
  await page.mouse.move(target.x + 30, target.y + target.height * 0.2, { steps: 12 });
  await page.mouse.move(target.x + 31, target.y + target.height * 0.2);
  await expect(page.locator('.nav-drop-ind')).toBeVisible();
  await page.mouse.up();
  await menu(page, 'ch-4');
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.chapter[data-id="ch-4"]')).toHaveCount(0);
  const saved = await stage('after');
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual([
    'ch-1',
    'ch-2',
    'ch-3',
    'ch-6',
    'ch-5',
    inserted,
    'ch-7',
    'ch-8',
    'ch-9',
    'ch-10',
  ]);
  expect(saved.metadata.chapterKinds[inserted!]).toBe('part');
  expect(
    saved.darlings.some(
      (darling: { html: string }) => darling.html === chapterEditionFixture.chapters[3],
    ),
  ).toBe(true);
});
