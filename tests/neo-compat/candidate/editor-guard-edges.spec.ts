import {test,expect} from './author-fixture';
import {existingBook} from './book-fixture';
import {persistedBook} from './storage-probe';
const latest = process.env.LEAFLOOM_PARITY_DRIVER !== 'neo-reference' || process.env.LEAFLOOM_REFERENCE_VERSION === '1.3.5';
for(const [key,id,paragraph,offset] of [['Backspace','NEO-074-A',2,0],['Delete','NEO-075-A',0,6]] as const)test(`[${id}] Leafloom: native ${key} removes imported scene class tokens only and author Undo restores the scene`,async({page})=>{
 const c=await existingBook(page,{chapters:['<p>Above.</p><p class="scene-break imported">***</p><p>Below.</p>']});await c.driver.select(0,paragraph,offset);await page.keyboard.press(key);await c.driver.expectParagraphs([['Above.','Below.']]);await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await c.driver.expectParagraphs([['Above.','***','Below.']]);await expect(page.locator('.chapter-body .scene-break')).toHaveCount(1);await c.driver.shelf();expect((await persistedBook(page,c.title)).chapters[0].html).toContain('***');
});
for(const modifier of ['Control','Alt','Meta'] as const)test(`[NEO-084-A] Leafloom: trusted ${modifier} Shift Enter bypasses poetry conversion and retains native author text`,async({page})=>{
 const c=await existingBook(page,{chapters:['<p>Verse words.</p>']});await c.driver.select(0,0,6);await page.keyboard.press(modifier+'+Shift+Enter');
 // 1.3.5 makes both command modifiers create poetry; Alt remains excluded.
 const createsPoetry=latest&&modifier!=='Alt';
 await expect(page.locator('.chapter-body .poetry')).toHaveCount(createsPoetry?1:0);
 if(createsPoetry){await expect(page.locator('.chapter-body .poetry i,.chapter-body .poetry em')).toHaveText('words.');expect(await c.driver.caret()).toMatchObject({paragraph:1,offset:0});}
 expect(await page.locator('.chapter-body').first().textContent()).toBe('Verse words.');await test.info().attach('native-modified-enter',{body:JSON.stringify(await page.locator('.chapter-body').first().evaluate(el=>({html:el.innerHTML,selection:window.getSelection()?.toString(),text:el.textContent}))),contentType:'application/json'});await c.driver.shelf();const saved=await persistedBook(page,c.title);
 if(createsPoetry)expect(saved.chapters[0].html).toMatch(/class="poetry"[^>]*><(?:i|em)>words\.<\/(?:i|em)>/);else expect(saved.chapters[0].html).not.toContain('poetry');
 expect(saved.chapters[0].html.replace(/<[^>]+>/g,'')).toBe('Verse words.');
});
