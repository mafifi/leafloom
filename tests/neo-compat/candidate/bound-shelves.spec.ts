import {test,expect} from './author-fixture';
import type {Page} from '@playwright/test';
import {existingBook} from './book-fixture';
import {persistedLibrary,persistedBook} from './storage-probe';
const reference=process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference';
async function choice(page:Page,action:'bind'|'unbind'|'numbering'){
 await page.locator('.shelf-label').first().click({button:'right'});
 if(reference){const label={bind:'Bind into one book',unbind:'Unbind',numbering:'Number chapters straight through'}[action];await page.locator('.fr-choice').filter({hasText:label}).click();}
 else {const label=action==='bind'?'Bind shelf':action==='unbind'?'Unbind shelf':((await persistedLibrary(page)).shelves[0].binding.numbering==='restart'?'Number chapters continuously':'Restart chapter numbers for each book');await page.getByRole('menuitem',{name:label,exact:true}).click();}
}
async function bound(page:Page){const c=await existingBook(page);await c.driver.shelf();for(const title of ['Second constituent','Third constituent']){await c.driver.newBook();await c.driver.title(title);await c.driver.type(title+' words.');await c.driver.shelf();}const storyIds=(await persistedLibrary(page)).shelves[0].bookIds;await choice(page,'bind');await expect(page.locator('.shelf').first()).toHaveClass(/bound/);await expect.poll(async()=>(await persistedLibrary(page)).shelves[0].binding?.bound).toBe(true);return {...c,storyIds};}
test('[NEO-035-A] Leafloom: binding retains the constituent story and creates one durable leading collection cover',async({page})=>{
 const c=await bound(page);const library=await persistedLibrary(page),ids=library.shelves[0].bookIds;expect(ids).toHaveLength(4);expect(ids.slice(1)).toEqual(c.storyIds);const cover=await persistedBook(page,'Fixture books',ids[0]);expect(cover.metadata.kind).toBe('cover');expect(cover.metadata.id).toBe(ids[0]);expect((await persistedBook(page,c.title)).chapters[0].html).toContain('Alpha beta.');await page.reload();await expect(page.locator('.shelf').first()).toHaveClass(/bound/);expect((await persistedLibrary(page)).shelves[0].bookIds).toEqual(ids);
});
test('[NEO-035-A] Leafloom: bound collection exposes a stationary cover, ghost front/back pages and Part insertion seams',async({page})=>{
 await bound(page);const shelf=page.locator('.shelf').first();await shelf.hover();await expect(shelf.locator('.bound-cover')).toHaveCount(1);expect(await shelf.locator('.bound-cover').evaluate(el=>el.getAttribute('draggable'))).toBe('false');for(const label of ['Copyright','Dedication','Epigraph','Prologue','Epilogue','Acknowledgments','About the Author'])await expect(shelf.locator('.ghost-page').filter({has:page.locator('.pt-label').filter({hasText:new RegExp('^'+label+'$')})})).toHaveCount(1);await expect(shelf.locator('.part-seam')).toHaveCount(3);
});
test('[NEO-036-A] Leafloom: unbinding parks its real cover and rebinding restores the same cover before the original story',async({page})=>{
 const c=await bound(page);const ids=(await persistedLibrary(page)).shelves[0].bookIds;await choice(page,'unbind');await expect(page.locator('.shelf').first()).not.toHaveClass(/bound/);await expect.poll(async()=>(await persistedLibrary(page)).shelves[0].bookIds).toEqual(c.storyIds);let shelf=(await persistedLibrary(page)).shelves[0];expect(shelf.binding.parked).toEqual([{id:ids[0],kind:'cover',before:null}]);expect((await persistedBook(page,'Fixture books',ids[0])).metadata.id).toBe(ids[0]);await page.reload();await choice(page,'bind');await expect.poll(async()=>(await persistedLibrary(page)).shelves[0].bookIds).toEqual(ids);shelf=(await persistedLibrary(page)).shelves[0];expect(shelf.binding.parked).toEqual([]);expect((await persistedBook(page,c.title)).chapters[0].html).toContain('Alpha beta.');
});
test('[NEO-044-A] Leafloom: binding numbering toggles restart and continuous policy durably across reload',async({page})=>{
 await bound(page);expect((await persistedLibrary(page)).shelves[0].binding.numbering).toBe('through');await choice(page,'numbering');await expect.poll(async()=>(await persistedLibrary(page)).shelves[0].binding.numbering).toBe('restart');await page.reload();await expect(page.locator('.shelf').first()).toHaveClass(/bound/);await choice(page,'numbering');await expect.poll(async()=>(await persistedLibrary(page)).shelves[0].binding.numbering).toBe('through');await page.reload();expect((await persistedLibrary(page)).shelves[0].binding.numbering).toBe('through');
});
