import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { privateStorageRoot, persistedBook } from './storage-probe';

test('[NEO-247-A] Leafloom: two unexpected renderer failures reach the real private log with one session hint and author prose remains editable', async ({
  page,
}) => {
  const c = await existingBook(page);
  const reference = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
  const log = path.join(
    privateStorageRoot(page),
    reference ? 'neo-errors.log' : 'leafloom-errors.log',
  );
  const hint = reference ? 'details were logged' : 'An unexpected error occurred';
  await page.evaluate((fragment) => {
    const records: string[] = [];
    const state = { records };
    Object.assign(window, { runtimeErrorObservations: state });
    new MutationObserver(() => {
      const text = document.querySelector('#hint')?.textContent ?? '';
      if (text.includes(fragment)) records.push(text);
    }).observe(document.querySelector('#hint') ?? document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    setTimeout(() => {
      throw Error('First unexpected private author phrase');
    }, 0);
  }, hint);
  await expect(page.locator('#hint')).toContainText(hint);
  await expect
    .poll(async () => {
      const text = await readFile(log, 'utf8').catch(() => '');
      return reference
        ? text.includes('First unexpected private author phrase')
        : text.trim().split('\n').filter(Boolean).length === 1;
    })
    .toBe(true);
  const firstCount = await page.evaluate(
    () => Reflect.get(window, 'runtimeErrorObservations').records.length as number,
  );
  expect(firstCount).toBeGreaterThan(0);
  await page.evaluate(() => {
    void Promise.reject(Error('Second unexpected private book title'));
  });
  await expect
    .poll(async () => {
      const text = await readFile(log, 'utf8').catch(() => '');
      return reference
        ? text.includes('Second unexpected private book title')
        : text.trim().split('\n').filter(Boolean).length === 2;
    })
    .toBe(true);
  expect(
    await page.evaluate(
      () => Reflect.get(window, 'runtimeErrorObservations').records.length as number,
    ),
  ).toBe(firstCount);
  if (!reference) {
    const bytes = await readFile(log, 'utf8');
    expect(bytes).not.toMatch(/private author|private book|stack|message/);
    expect(
      bytes
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).source),
    ).toEqual(['renderer', 'promise']);
  }
  await c.driver.expectParagraphs([['Alpha beta.', 'Gamma delta.']]);
  await c.driver.select(0, 0, 11);
  await c.driver.type(' Still writing.');
  await c.driver.expectParagraphs([['Alpha beta. Still writing.', 'Gamma delta.']]);
  await c.driver.shelf();
  expect(
    (await persistedBook(page, c.title, c.id)).chapters
      .map((chapter: { html: string }) => chapter.html)
      .join(''),
  ).toContain('Alpha beta. Still writing.');
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha beta. Still writing.', 'Gamma delta.']]);
});
