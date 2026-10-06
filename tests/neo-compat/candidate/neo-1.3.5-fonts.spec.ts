import {test,expect} from './author-fixture';
import {BrowserAuthorDriver} from './browser-driver';
import {existingBook} from './book-fixture';
import {persistedLibrary,privateStorageRoot} from './storage-probe';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';

test('[NEO135-003-B] Quattro loads four real faces during onboarding and remains the manuscript font after restart',async({page})=>{
 await writeFile(path.join(privateStorageRoot(page),'library.json'),'{}');const driver=new BrowserAuthorDriver(page);await driver.open();
 await page.locator('#fr-name').fill('Quattro Writer');await page.locator('[data-style="pantser"]').click();await page.locator('#fr-bodyfonts').getByRole('button',{name:'iA Writer Quattro',exact:true}).click();
 const loaded=await page.evaluate(async()=>{const styles=['normal 400','italic 400','normal 700','italic 700'];return Promise.all(styles.map(async style=>(await document.fonts.load(`${style} 17px "iA Writer Quattro"`,'Writing a river')).map(face=>face.family.replaceAll('"','').replaceAll("'",''))));});
 expect(loaded).toEqual(Array.from({length:4},()=>['iA Writer Quattro']));await expect.poll(()=>page.locator('#fr-sample-text').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('iA Writer Quattro');
 await page.locator('#fr-done').click();await expect(page.locator('#firstrun')).toBeHidden();await driver.newBook();await driver.title('Quattro Manuscript');await driver.type('Words in Quattro.');
 await expect.poll(()=>page.locator('.chapter-body').first().evaluate(el=>getComputedStyle(el).fontFamily)).toContain('iA Writer Quattro');await driver.shelf();expect((await persistedLibrary(page)).fonts.body).toBe('iA Writer Quattro');await driver.restart();await driver.expectParagraphs([['Words in Quattro.']]);expect((await persistedLibrary(page)).fonts.body).toBe('iA Writer Quattro');await expect.poll(()=>page.locator('.chapter-body').first().evaluate(el=>getComputedStyle(el).fontFamily)).toContain('iA Writer Quattro');
});
for(const [locale,expected]of [['fr_CA','page 1 sur 1'],['pt_PT','página 1 de 1'],['zz-ZZ','page 1 of 1']] as const)test(`[NEO135-025-${locale}] Regional language inheritance and English fallback render the new manuscript page control`,async({page})=>{
 await writeFile(path.join(privateStorageRoot(page),'settings.json'),JSON.stringify({uiLanguage:locale}));const c=await existingBook(page,{chapters:['<p>Writing words.</p>']});await c.driver.select(0,0,0);await page.locator('#pos-counter').click();await expect(page.locator('#pos-counter')).toHaveText(expected);await c.driver.restart();await c.driver.select(0,0,0);await expect(page.locator('#pos-counter')).toHaveText(expected);expect((await persistedLibrary(page)).posMode).toBe('page');
});
