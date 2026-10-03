import {test,expect} from './author-fixture';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {BrowserAuthorDriver} from './browser-driver';
import {persistedBook,persistedLibrary} from './storage-probe';
test.beforeEach(async()=>{if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference')return;const fixture=process.env.LEAFLOOM_TEST_ROOT;if(!fixture)throw Error('Private initial library fixture required');await writeFile(path.join(fixture,'library.json'),'{}');});
for(const name of ['', 'Ada Author'])test(`[NEO-001-A] Leafloom: first-run ${name?'named':'blank'} identity reaches title page and skips onboarding after restart`,async({page})=>{
 const d=new BrowserAuthorDriver(page);await d.open();await d.onboard(name);await expect(page.locator('#author-chip')).toHaveText(name||'Anonymous');await d.newBook();await expect(page.locator('#tp-author')).toHaveText(name||'Anonymous');await d.title('First run '+test.info().testId);await d.shelf();expect((await persistedBook(page,'First run '+test.info().testId)).metadata.author).toBe(name||'Anonymous');await page.reload();await expect(page.locator('#firstrun')).toBeHidden();await expect(page.locator('#author-chip')).toHaveText(name||'Anonymous');
});
for(const [real,pen,author] of [['Ada Author','Penny Name','Ada Author'],['  ','Penny Name','Penny Name']])test(`[NEO-002-A] Leafloom: onboarding ${real.trim()?'real and pen':'pen only'} name preserves selected identity and stored pen name`,async({page})=>{
 const d=new BrowserAuthorDriver(page);await d.open();await d.onboard(real,pen);await expect(page.locator('#author-chip')).toHaveText(author);const library=await persistedLibrary(page);expect(library.penNames).toEqual([pen]);await d.newBook();await expect(page.locator('#tp-author')).toHaveText(author);await d.title('Pen identity '+test.info().testId);await d.shelf();expect((await persistedBook(page,'Pen identity '+test.info().testId)).metadata.author).toBe(author);
});
for(const style of ['pantser','plotter'])test(`[NEO-003-A] Leafloom: ${style} onboarding opens a new book in its source writing workspace`,async({page})=>{
 const d=new BrowserAuthorDriver(page);await d.open();await d.onboard('Style Writer','',style);expect((await persistedLibrary(page)).writingStyle).toBe(style);await d.newBook();if(style==='pantser'){await expect(page.locator('#paper')).toBeVisible();await expect(page.locator('#tp-title')).toBeFocused();await expect(page.locator('.chapter-body')).toHaveCount(0);}else{await expect(page.locator('#outline-list')).toBeVisible();await expect(page.locator('.ol-text')).toHaveCount(1);await expect(page.locator('#paper')).toBeHidden();}await d.shelf();
});
test('[NEO-005-A] Leafloom: one-click blank book opens title then native Enter creates the first empty story persisted on disk',async({page})=>{
 const d=new BrowserAuthorDriver(page);await d.open();await d.onboard();await d.newBook();await expect(page.locator('#tp-title')).toBeFocused();await expect(page.locator('#tp-title')).toHaveText('');await d.title('Blank book '+test.info().testId);await d.expectParagraphs([['']]);await expect(page.locator('.chapter-body [contenteditable="true"],.chapter-body[contenteditable="true"]')).toBeFocused();await d.shelf();const saved=await persistedBook(page,'Blank book '+test.info().testId);expect(saved.chapters).toHaveLength(1);expect(saved.chapters[0].html.replace(/<[^>]+>/g,'')).toBe('');
});
