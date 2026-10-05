import {test,expect} from './author-fixture';
import {existingBook} from './book-fixture';
import {persistedBook,persistedLibrary} from './storage-probe';
const mod=process.platform==='darwin'?'Meta':'Control';

test('[NEO135-006-A] Shift Enter splits rich prose into a flush paragraph and retains undo and saved formatting',async({page})=>{
 const c=await existingBook(page,{chapters:['<p><strong>Alpha</strong> beta.</p>']});await c.driver.select(0,0,5);await c.driver.key('Shift+Enter');
 await c.driver.expectParagraphs([['Alpha',' beta.']]);await expect(page.locator('.chapter-body p').nth(1)).toHaveClass(/flush/);await expect(page.locator('.chapter-body p').first().locator('b,strong')).toHaveText('Alpha');
 await c.driver.undo();await c.driver.expectParagraphs([['Alpha beta.']]);await c.driver.redo();await c.driver.expectParagraphs([['Alpha',' beta.']]);await c.driver.reopen();await expect(page.locator('.chapter-body p').nth(1)).toHaveClass(/flush/);expect((await persistedBook(page,c.title)).chapters[0].html).toContain('flush');
});
test('[NEO135-006-B] Backspace at the start of a flush paragraph restores prose without losing the line',async({page})=>{
 const c=await existingBook(page,{chapters:['<p>Before.</p><p class="flush">Flush line.</p>']});await c.driver.select(0,1,0);await c.driver.key('Backspace');await c.driver.expectParagraphs([['Before.','Flush line.']]);await expect(page.locator('.chapter-body p').nth(1)).not.toHaveClass(/flush|poetry/);await c.driver.undo();await expect(page.locator('.chapter-body p').nth(1)).toHaveClass(/flush/);await c.driver.reopen();await c.driver.expectParagraphs([['Before.','Flush line.']]);
});
test('[NEO135-006-C] Modified Shift Enter creates poetry with italic author input under the new shortcut',async({page})=>{
 const c=await existingBook(page,{chapters:['<p>Opening.</p>']});await c.driver.select(0,0,8);await c.driver.key(mod+'+Shift+Enter');await expect(page.locator('.chapter-body p').nth(1)).toHaveClass(/poetry/);await c.driver.type('Verse');await expect(page.locator('.chapter-body p').nth(1).locator('i,em')).toHaveText('Verse');await c.driver.reopen();await c.driver.expectParagraphs([['Opening.','Verse']]);
});
for(const [id,key,selector]of [['018-A',mod+'+u','u'],['018-B',mod+'+Shift+s','s,strike,del']] as const)test(`[NEO135-${id}] Native ${selector==='u'?'underline':'strikethrough'} preserves selected words through undo redo and reopen`,async({page})=>{
 const c=await existingBook(page,{chapters:['<p>Alpha <em>beta</em>.</p>']});await c.driver.select(0,0,6,10);await c.driver.key(key);await expect(page.locator('.chapter-body p').locator(selector)).toHaveText('beta');await c.driver.expectParagraphs([['Alpha beta.']]);await c.driver.undo();await expect(page.locator('.chapter-body p').locator(selector)).toHaveCount(0);await c.driver.redo();await expect(page.locator('.chapter-body p').locator(selector)).toHaveText('beta');await c.driver.reopen();await expect(page.locator('.chapter-body p').locator(selector)).toHaveText('beta');await expect(page.locator('.chapter-body p').locator('em,i')).toHaveText('beta');
});
test('[NEO135-004-A] Sentence capitalization is author-undoable immediately after the first native letter',async({page})=>{
 const c=await existingBook(page,{chapters:['<p>Opening. </p>']});await c.driver.select(0,0,9);await c.driver.type('h');await c.driver.expectParagraphs([['Opening. H']]);await c.driver.undo();await c.driver.expectParagraphs([['Opening. h']]);await c.driver.type('ello');await c.driver.reopen();await c.driver.expectParagraphs([['Opening. hello']]);
});
test('[NEO135-009-A] Word counting keeps words separated by actual paragraph boundaries',async({page})=>{
 await existingBook(page,{chapters:['<p>One</p><p>Two</p><p>Three</p>']});await expect(page.locator('#word-counter')).toHaveText('3 words');
});
test('[NEO135-003-A] Position counter toggles manuscript pages and retains the preference after restart',async({page})=>{
 const words=Array.from({length:250},()=> 'word').join(' ');const c=await existingBook(page,{chapters:[`<p>${words}</p>`,'<p>Last words.</p>']});await c.driver.select(1,0,0);await expect(page.locator('#pos-counter')).toHaveText('chapter 2 of 2');await page.locator('#pos-counter').click();await expect(page.locator('#pos-counter')).toHaveText('page 2 of 2');await expect.poll(async()=>(await persistedLibrary(page)).posMode).toBe('page');await c.driver.restart();await c.driver.select(1,0,0);await expect(page.locator('#pos-counter')).toHaveText('page 2 of 2');expect((await persistedLibrary(page)).posMode).toBe('page');
});
test('[NEO135-032-A] Outline cards come from manuscript sections and disappear when Notes or Darlings opens',async({page})=>{
 const c=await existingBook(page,{chapters:['<p>Opening prose.</p><p class="scene-break">***</p><p>Second section.</p>']});await page.locator('.tab[data-tab="outline"]').click();await expect(page.locator('#outline-board')).toBeVisible();await expect(page.locator('#outline-board .ob-card')).toHaveCount(2);await expect(page.locator('#outline-board')).toContainText('Opening prose.');await expect(page.locator('#outline-board')).toContainText('Second section.');await page.locator('.tab[data-tab="notes"]').click();await expect(page.locator('#outline-board')).toBeHidden();await page.locator('.tab[data-tab="darlings"]').click();await expect(page.locator('#outline-board')).toBeHidden();await c.driver.reopen();await c.driver.expectParagraphs([['Opening prose.','***','Second section.']]);
});
test('[NEO135-026-A] Existing screenplay opens as a script with Courier typography and scene navigation',async({page})=>{
 const c=await existingBook(page,{metadata:{format:'screenplay'},chapters:['<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-action">Opening action.</p>']});await expect(page.locator('#editor-view')).toHaveClass(/script-mode/);await expect(page.locator('#paper')).toHaveClass(/script/);await expect(page.locator('.chapter-body').first()).toHaveClass(/script-body/);await expect.poll(()=>page.locator('.chapter-body').first().evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Courier Prime');await expect(page.locator('#nav-list .sp-scene .n-label')).toHaveText('INT. ROOM - DAY');await c.driver.reopen();expect((await persistedBook(page,c.title)).metadata.format).toBe('screenplay');await c.driver.expectParagraphs([['INT. ROOM - DAY','Opening action.']]);
});
