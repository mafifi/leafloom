import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, persistedLibrary } from './storage-probe';
import { clickReferenceMenu } from '../reference/harness';
test.use({ timezoneId: 'Europe/London' });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const target135 =
  process.env.LEAFLOOM_PARITY_DRIVER !== 'neo-reference' ||
  process.env.LEAFLOOM_REFERENCE_VERSION === '1.3.5';
async function open(page: import('@playwright/test').Page, noBook = false) {
  if (noBook && process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference')
    await clickReferenceMenu(page, ['File', 'Goals…']);
  else if (noBook) await page.keyboard.press(mod + '+,');
  else await page.locator('#goal-counter').click();
  await expect(page.locator('#st-daily')).toBeVisible();
}
async function done(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('#st-daily')).toHaveCount(0);
}
for (const close of ['Done', 'Escape', 'backdrop'])
  test(`[NEO-188-A] Leafloom: progress ${close} saves and removes book goal with clamped percentage and retained prose`, async ({
    page,
  }) => {
    const c = await existingBook(page, { chapters: ['<p>One two three four.</p>'] });
    await open(page);
    await page.locator('#st-book').fill('2');
    if (close === 'Done') await done(page);
    else if (close === 'Escape') await page.locator('#st-book').press('Escape');
    else await page.locator('.modal-backdrop:visible').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#st-book')).toHaveCount(0);
    await open(page);
    await expect(page.locator('#st-book')).toHaveValue('2');
    await expect(page.locator('.stats-nums .big').nth(2)).toHaveText('100%');
    await page.locator('#st-book').fill('');
    await done(page);
    await c.driver.shelf();
    expect((await persistedBook(page, c.title)).metadata.wordGoal || 0).toBe(0);
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([['One two three four.']]);
  });
test('[NEO-189-A] Leafloom: Goals without a book saves daily target and subsequent native writing tracks only net new words', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>One two.</p>'] });
  await c.driver.shelf();
  await open(page, true);
  await expect(page.locator('#st-book')).toHaveCount(0);
  await expect(page.locator('#stats-chart')).toHaveCount(0);
  await page.locator('#st-daily').fill('2');
  await done(page);
  expect((await persistedLibrary(page)).dailyGoal).toBe(2);
  await c.driver.selectBook(c.title);
  await expect(page.locator('#goal-counter')).toHaveText('0 / 2 today');
  await c.driver.select(0, 0, 8);
  await c.driver.type(' three four.');
  await expect(page.locator('#goal-counter')).toHaveText('2 / 2 today');
  await expect(page.locator('#goal-counter')).toHaveClass(/goal-met/);
  await c.driver.reopen();
  await expect(page.locator('#goal-counter')).toHaveText('2 / 2 today');
  await c.driver.shelf();
  const daily = (await persistedBook(page, c.title)).metadata.dailyCounts;
  expect(Object.values(daily)).toEqual([{ start: 2, end: 4 }]);
});
test('[NEO-190-A] Leafloom: chosen writing-day cutoff attributes native edits across midnight and cutoff to the correct saved day', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-03T00:30:00+01:00'));
  const c = await existingBook(page, { chapters: ['<p>One.</p>'], library: { dayEndsAt: 3 } });
  await open(page);
  await page.locator('#st-dayends').selectOption('3');
  await done(page);
  await c.driver.select(0, 0, 4);
  await c.driver.type(' two.');
  await page.clock.setFixedTime(new Date('2026-10-03T03:05:00+01:00'));
  await page.locator('#word-counter').click();
  await page.locator('#word-counter').click();
  await c.driver.select(0, 0, 9);
  await c.driver.type(' three.');
  await c.driver.shelf();
  const daily = (await persistedBook(page, c.title)).metadata.dailyCounts;
  expect(daily['2026-10-02']).toEqual({ start: 1, end: 2 });
  expect(daily['2026-10-03']).toEqual({ start: 2, end: 3 });
  expect((await persistedLibrary(page)).dayEndsAt).toBe(3);
});
test('[NEO-191-A] Leafloom: thirty-day chart shows source daily bars, cumulative totals and goal without modifying seeded counts', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+01:00'));
  const dailyCounts = {
      '2026-09-03': { start: 10, end: 20 },
      '2026-10-01': { start: 20, end: 25 },
      '2026-10-02': { start: 25, end: 26 },
    },
    words = Array.from({ length: 26 }, (_, i) => 'word' + i).join(' ');
  const c = await existingBook(page, {
    chapters: [`<p>${words}</p>`],
    metadata: { dailyCounts, wordGoal: 50 },
    library: { dailyGoal: 10 },
  });
  await open(page);
  const svg = page.locator('#stats-chart');
  await expect(svg).toHaveAttribute('role', 'img');
  await expect(svg).toHaveAttribute('aria-label', 'Words written over the last 30 days');
  await expect(svg.locator('rect')).toHaveCount(30);
  expect(
    await svg
      .locator('rect')
      .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('height')))),
  ).toEqual([90, ...Array(27).fill(0), 45, 9]);
  await expect(svg.locator('path')).toHaveCount(1);
  expect((await svg.locator('path').getAttribute('d'))?.split(/\s+/)).toHaveLength(30);
  await expect(svg.locator('line')).toHaveCount(1);
  await done(page);
  await c.driver.shelf();
  expect((await persistedBook(page, c.title)).metadata.dailyCounts).toEqual(dailyCounts);
});
test('[NEO-191-A] Leafloom: empty progress chart is thirty zero-height bars with no book-goal line', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+01:00'));
  await existingBook(page, { chapters: ['<p></p>'] });
  await open(page);
  const svg = page.locator('#stats-chart');
  await expect(svg.locator('rect')).toHaveCount(30);
  expect(
    await svg
      .locator('rect')
      .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('height')))),
  ).toEqual(Array(30).fill(0));
  await expect(svg.locator('line')).toHaveCount(0);
  await done(page);
});
test('[NEO-192-A] [NEO-193-A] Leafloom: sprint uses native new-word delta, completes once and then returns to daily counter', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>One.</p>'], library: { dailyGoal: 10 } });
  await open(page);
  await page.locator('#st-sprint').fill('3');
  await page.locator('#st-sprint-btn').click();
  await expect(page.locator('#st-sprint')).toHaveCount(0);
  await expect(page.locator('#goal-counter')).toContainText('0 / 3');
  await c.driver.select(0, 0, 4);
  await c.driver.type(' two three.');
  await expect(page.locator('#goal-counter')).toContainText('2 / 3');
  await c.driver.type(' four.');
  await expect(page.locator('#hint,#toast')).toContainText('Sprint complete');
  await c.driver.type(' five.');
  await expect(page.locator('#goal-counter')).toHaveText('4 / 10 today');
  await c.driver.select(0, 0, 0, 'One. two three. four. five.'.length);
  await c.driver.key('Backspace');
  await c.driver.type('One two three four five.');
  await expect(page.locator('#goal-counter')).toHaveText(
    target135 ? '5 / 10 today' : '4 / 10 today',
  );
  if (target135)
    test
      .info()
      .annotations.push({
        type: 'source-characterization',
        description:
          'NEO1.3.5 app.js9185 rebases the daily start to zero after deleting all words; rewriting five counts all five, while initial sprint delta remains four.',
      });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title);
  expect(saved.chapters[0].html.replace(/<[^>]+>/g, '')).toBe('One two three four five.');
  expect(Object.values(saved.metadata.dailyCounts)).toEqual([{ start: target135 ? 0 : 1, end: 5 }]);
});
test('[NEO-194-A] Leafloom: ending a sprint reports actual net words and rounded elapsed minutes and a new sprint resets baseline', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+01:00'));
  const c = await existingBook(page, { chapters: ['<p>One.</p>'] });
  await open(page);
  await page.locator('#st-sprint').fill('50');
  await page.locator('#st-sprint-btn').click();
  await c.driver.select(0, 0, 4);
  await c.driver.type(' two three.');
  await page.clock.setFixedTime(new Date('2026-10-02T12:01:40+01:00'));
  await open(page);
  await expect(page.locator('#st-sprint-btn')).toHaveText('End sprint');
  await page.locator('#st-sprint-btn').click();
  await expect(page.locator('#hint,#toast')).toContainText('2 words');
  await expect(page.locator('#hint,#toast')).toContainText(/2 min/);
  await open(page);
  await page.locator('#st-sprint').fill('5');
  await page.locator('#st-sprint-btn').click();
  await expect(page.locator('#goal-counter')).toContainText('0 / 5');
  await c.driver.select(0, 0, 15);
  await c.driver.type(' four.');
  await expect(page.locator('#goal-counter')).toContainText('1 / 5');
});
