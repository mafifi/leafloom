import {test,expect} from './author-fixture';
import {existingBook} from './book-fixture';
import {persistedBook,persistedLibrary} from './storage-probe';

test('[NEO135-026-C] Measured screenplay pages keep a heading with its next action and show printed page positions without saving layout marks',async({page})=>{
 const paragraphs=['<p class="sp-heading">INT. ROOM - DAY</p>',...Array.from({length:26},(_,i)=>`<p class="sp-action">Action ${i+1}.</p>`),'<p class="sp-heading">EXT. STREET - NIGHT</p>','<p class="sp-action">Last action.</p>'];
 const c=await existingBook(page,{metadata:{format:'screenplay'},chapters:[paragraphs.join('')]});
 const heading=page.locator('.chapter-body p.sp-heading').last();
 await expect(heading).toHaveAttribute('data-pg','2');await expect(heading).toHaveAttribute('data-fill','1');
 await expect.poll(()=>heading.evaluate(node=>getComputedStyle(node).fontWeight)).toBe('700');
 await c.driver.select(0,27,0);await expect(page.locator('#pos-counter')).toHaveText('page 2 of 2');
 await page.locator('#pos-counter').click();await expect(page.locator('#pos-counter')).toHaveText('scene 2 of 2');
 await expect(page.locator('#word-counter')).toHaveText('1 pages · ~1 min');
 await c.driver.reopen();const html=(await persistedBook(page,c.title)).chapters[0].html;
 expect(html).not.toMatch(/data-(?:pg|fill|contd|ghost)/);await expect(page.locator('.chapter-body p.sp-heading').last()).toHaveAttribute('data-pg','2');
});

test('[NEO135-027-C] Narrow screenplay reflows for reading while printed measurements and page navigation stay stable',async({page})=>{
 const text=Array.from({length:90},()=> 'words').join(' ');
 const c=await existingBook(page,{metadata:{format:'screenplay'},chapters:[`<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-action">${text}</p>`]});
 await c.driver.select(0,1,10);await expect(page.locator('#pos-counter')).toHaveText('page 1 of 1');
 const length=await page.locator('#word-counter').textContent();
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.locator('.chapter-body').first().evaluate(node=>getComputedStyle(node).fontSize)).toBe('15px');
 await expect.poll(()=>page.locator('#paper').evaluate(node=>node.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
 await expect(page.locator('#word-counter')).toHaveText(length!);await expect(page.locator('#pos-counter')).toHaveText('page 1 of 1');
 await c.driver.type('x');await c.driver.reopen();expect((await persistedBook(page,c.title)).chapters[0].html).toContain('x');
});

test('[NEO135-026-D] Script credit draft and contact are real editable title fields with book and shared-library ownership',async({page})=>{
 const mod=process.platform==='darwin'?'Meta':'Control';
 const c=await existingBook(page,{metadata:{format:'screenplay'},chapters:['<p class="sp-action">Author words.</p>']});
 await expect(page.locator('#tp-credit')).toHaveText('Written by');
 for(const [id,value]of [['tp-credit','A script by'],['tp-draft','Second draft'],['tp-contact','Ada Writer']] as const){await page.locator('#'+id).click();await page.keyboard.press(mod+'+a');await page.keyboard.type(value);if(id==='tp-draft'){await page.keyboard.press('Enter');await page.keyboard.type('October 2026');}if(id==='tp-contact'){await page.keyboard.press('Enter');await page.keyboard.type('London');}}
 await c.driver.select(0,0,0);await c.driver.reopen();
 await expect(page.locator('#tp-credit')).toHaveText('A script by');await expect(page.locator('#tp-draft')).toHaveText('Second draft\nOctober 2026');await expect(page.locator('#tp-contact')).toHaveText('Ada Writer\nLondon');
 const book=await persistedBook(page,c.title);expect(book.metadata.credit).toBe('A script by');expect(book.metadata.draft).toBe('Second draft\nOctober 2026');expect((await persistedLibrary(page)).scriptContact).toBe('Ada Writer\nLondon');
 expect(book.chapters[0].html).toContain('Author words.');
});
