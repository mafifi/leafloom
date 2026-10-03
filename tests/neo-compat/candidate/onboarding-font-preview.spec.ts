import { test, expect } from './author-fixture';
import { BrowserAuthorDriver } from './browser-driver';
import { persistedLibrary, privateStorageRoot } from './storage-probe';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

for (const kind of ['body', 'dropcap'] as const) {
  test(`[NEO-004-${kind === 'body' ? 'A' : 'B'}] Leafloom: onboarding ${kind} hover previews then restores the selected face without persisting the hover`, async ({
    page,
  }) => {
    if (process.env.LEAFLOOM_PARITY_DRIVER !== 'neo-reference')
      await writeFile(path.join(privateStorageRoot(page), 'library.json'), '{}');
    const driver = new BrowserAuthorDriver(page);
    await driver.open();
    await page.locator('#fr-name').fill('Font Preview Writer');
    await page.locator('[data-style="pantser"]').click();
    const choices = page.locator(
      kind === 'body' ? '#fr-bodyfonts .fr-font' : '#fr-dropcaps .fr-font',
    );
    const variable = kind === 'body' ? '--body-font' : '--dropcap-font';
    const preview = () =>
      page
        .locator('#fr-sample')
        .evaluate((el, key) => getComputedStyle(el).getPropertyValue(key).trim(), variable);
    const original = await preview();
    await choices.nth(1).hover();
    await expect.poll(preview).not.toBe(original);
    await expect(choices.first()).toHaveClass(/\bsel\b/);
    await page.locator('#fr-step2 h2').hover();
    await expect.poll(preview).toBe(original);
    const selectedName = kind === 'body' ? (await choices.nth(1).textContent())!.trim() : 'fantasy';
    await choices.nth(1).click();
    await expect(choices.nth(1)).toHaveClass(/\bsel\b/);
    const selected = await preview();
    await choices.nth(2).hover();
    await expect.poll(preview).not.toBe(selected);
    await page.locator('#fr-step2 h2').hover();
    await expect.poll(preview).toBe(selected);
    await page.locator('#fr-done').click();
    await expect(page.locator('#firstrun')).toBeHidden();
    expect((await persistedLibrary(page)).fonts[kind]).toBe(selectedName);
    await page.reload();
    await expect(page.locator('#firstrun')).toBeHidden();
    expect((await persistedLibrary(page)).fonts[kind]).toBe(selectedName);
  });
}

test('Leafloom reading families load real regular italic bold and bold-italic faces and retain the selected family after restart', async ({page}) => {
 await writeFile(path.join(privateStorageRoot(page), 'library.json'), '{}');
 const driver=new BrowserAuthorDriver(page);await driver.open();
 await page.locator('#fr-name').fill('Reading Font Writer');await page.locator('[data-style="pantser"]').click();
 for(const family of ['Newsreader','Readerly','Libron']){
  await page.locator('#fr-bodyfonts').getByRole('button',{name:family,exact:true}).click();
  const loaded=await page.evaluate(async family=>{
   const out=[];for(const style of ['normal 400','italic 400','normal 700','italic 700']){
    const faces=await document.fonts.load(`${style} 17px "${family}"`,'Reading the river');out.push(faces.map(face=>face.family.replaceAll('"','').replaceAll("'",'')));
   }return out;
  },family);
  expect(loaded).toEqual([[family],[family],[family],[family]]);
  expect(await page.locator('#fr-sample-text').evaluate(el=>getComputedStyle(el).fontFamily)).toContain(family);
 }
 await page.locator('#fr-done').click();await expect(page.locator('#firstrun')).toBeHidden();
 expect((await persistedLibrary(page)).fonts.body).toBe('Libron');await page.reload();
 await expect(page.locator('#bookshelf-view')).toBeVisible();expect((await persistedLibrary(page)).fonts.body).toBe('Libron');
});
