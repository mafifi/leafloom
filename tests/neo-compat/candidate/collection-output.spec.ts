import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedLibrary, persistedBook } from './storage-probe';
import type { Page } from '@playwright/test';
const original=process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference';
async function shelfChoice(page:Page,label:string){await page.locator('.shelf-label').first().click({button:'right'});if(original)await page.locator('.fr-choice').filter({hasText:label}).click();else await page.getByRole('menuitem',{name:label,exact:true}).click();}
async function choices(page:Page){return page.locator('.modal:visible .fr-choice').evaluateAll(elements=>elements.map(el=>(el.querySelector('strong')?.textContent??el.textContent??'').trim()));}

test('[NEO-046-A] Leafloom: anthology title cancellation preserves the shelf and every constituent manuscript',async({page})=>{
 const c=await existingBook(page);await c.driver.shelf();const before=await persistedLibrary(page),book=await persistedBook(page,c.title,c.id);
 await shelfChoice(page,'Export shelf as anthology…');
 const input=page.locator('.modal:visible input');await expect(input).toHaveValue('Fixture books');await input.fill('A different anthology');await input.press('Escape');await expect(page.locator('.modal:visible')).toHaveCount(0);
 expect((await persistedLibrary(page)).shelves).toEqual(before.shelves);expect((await persistedBook(page,c.title,c.id)).chapters).toEqual(book.chapters);await expect(page.locator('#bookshelf-view')).toBeVisible();
});

test('[NEO-046-A] Leafloom: anthology title confirmation offers exactly EPUB Word PDF and format cancellation retains authorship',async({page})=>{
 const c=await existingBook(page);await c.driver.shelf();const before=await persistedBook(page,c.title,c.id);
 await shelfChoice(page,'Export shelf as anthology…');const input=page.locator('.modal:visible input');await input.fill('Stories é東京');await input.press('Enter');
 await expect.poll(()=>choices(page)).toEqual(['EPUB','Word (.docx)','PDF']);
 await page.keyboard.press('Escape');await expect(page.locator('.modal:visible')).toHaveCount(0);await expect(page.locator('#bookshelf-view')).toBeVisible();
 const after=await persistedBook(page,c.title,c.id);expect(after.metadata.title).toBe(c.title);expect(after.metadata.author).toBe('Fixture Writer');expect(after.chapters).toEqual(before.chapters);
});

test('[NEO-045-A] Leafloom: bound collection export offers exactly three source publication formats and cancel preserves binding',async({page})=>{
 const c=await existingBook(page);await c.driver.shelf();await shelfChoice(page,original?'Bind into one book':'Bind shelf');await expect(page.locator('.shelf').first()).toHaveClass(/bound/);
 await expect.poll(async()=>(await persistedLibrary(page)).shelves[0].binding?.bound).toBe(true);const before=(await persistedLibrary(page)).shelves[0];
 await page.locator('.bound-cover').click({button:'right'});if(original)await page.locator('.fr-choice').filter({hasText:'Export the book…'}).click();else await page.getByRole('menuitem',{name:'Export the book…',exact:true}).click();
 await expect.poll(()=>choices(page)).toEqual(['EPUB','Word (.docx)','PDF']);await page.keyboard.press('Escape');await expect(page.locator('.modal:visible')).toHaveCount(0);
 expect((await persistedLibrary(page)).shelves[0]).toEqual(before);expect((await persistedBook(page,c.title,c.id)).chapters[0].html).toContain('Alpha beta.');
});
