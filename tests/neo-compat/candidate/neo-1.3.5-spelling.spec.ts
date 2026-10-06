import {test,expect} from './author-fixture';
import {existingBook} from './book-fixture';
import {persistedBook,persistedLibrary} from './storage-probe';
import {clickReferenceMenu} from '../reference/harness';
const source=process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference';
test('[NEO135-002-A] Capital slips offer one capital without Learn, preserve rich writing through Undo and respect sentence exclusions',async({page})=>{
 const c=await existingBook(page,{chapters:['<p><b>hello.</b> after Dr. smith. i speak.</p><p class="poetry">lower poetry</p><p>Wait… lower.</p>'],notes:'<p>lower notes.</p>'});
 await c.driver.select(0,0,0);
 if(source)await clickReferenceMenu(page,['Edit','Spellcheck Pass']);
 else{await page.locator('#format-menu').click();await page.getByRole('menuitem',{name:'Spellcheck on',exact:true}).click();}
 const capitals=async()=> source ? page.evaluate(()=>Array.from(CSS.highlights.get('neo-spell')||[]).map(r=>r.toString()).filter(text=>text.length===1).sort()) : (await page.locator('[data-annotation-kind="spelling"]').allTextContents()).filter(text=>text.length===1).sort();
 await expect.poll(capitals).toEqual(['a','h','i']);
 const dictionary=(await persistedLibrary(page)).customWords;
 if(source){const point=await page.evaluate(()=>{const range=Array.from(CSS.highlights.get('neo-spell')||[]).find(r=>r.toString()==='h') as Range;const b=range.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};});await page.mouse.click(point.x,point.y,{button:'right'});await expect(page.locator('.spell-menu button')).toHaveText(['H']);await page.locator('.spell-menu button').click();}
 else{await page.locator('[data-annotation-kind="spelling"]').filter({hasText:/^h$/}).click({button:'right'});await expect(page.getByRole('menuitem')).toHaveText(['H']);await page.getByRole('menuitem',{name:'H',exact:true}).click();}
 await expect(page.locator('.chapter-body').first().locator('p').first().locator('b,strong')).toHaveText('Hello.');await c.driver.undo();await c.driver.expectParagraphs([['hello. after Dr. smith. i speak.','lower poetry','Wait… lower.']]);
 expect((await persistedLibrary(page)).customWords).toEqual(dictionary);await c.driver.reopen();expect((await persistedBook(page,c.title)).chapters[0].html).toMatch(/<(b|strong)>hello\.<\/(b|strong)>/);
});
