import {test,expect} from './author-fixture';
import {existingBook} from './book-fixture';
import {persistedBook,privateStorageRoot} from './storage-probe';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const reference=process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference';
test('[NEO-188-A] Leafloom: closed cover word goal shows cached progress and blank removes goal durably',async({page})=>{
 const c=await existingBook(page);await c.driver.shelf();const file=path.join(privateStorageRoot(page),c.id,reference?'book.json':'manuscript.json'),data=JSON.parse(await readFile(file,'utf8'));(reference?data:data.metadata).wordCount=20000;await writeFile(file,JSON.stringify(data));await page.reload();const tile=page.locator('.book[data-book-id="'+c.id+'"]');
 async function goal(value:string){await tile.click({button:'right'});if(reference)await page.locator('.modal-backdrop:visible .fr-choice').filter({hasText:'Set word goal…'}).click();else await page.getByRole('menuitem',{name:'Set word goal…',exact:true}).click();const input=page.locator('.modal-backdrop:visible input');await input.fill(value);await input.press('Enter');await expect(input).toHaveCount(0);}
 await goal('80000');await expect.poll(async()=>(await persistedBook(page,c.title,c.id)).metadata.wordGoal).toBe(80000);await expect(tile.locator('.b-progress')).toBeVisible();expect(await tile.locator('.b-progress > div').evaluate(el=>(el as HTMLElement).style.width)).toBe('25%');await expect(tile).toHaveAttribute('title',c.title+' — 20,000 / 80,000 words');await page.reload();await expect(tile.locator('.b-progress')).toBeVisible();expect(await tile.locator('.b-progress > div').evaluate(el=>(el as HTMLElement).style.width)).toBe('25%');await goal('');await expect.poll(async()=>(await persistedBook(page,c.title,c.id)).metadata.wordGoal).toBe(0);await expect(tile.locator('.b-progress')).toBeHidden();await page.reload();await expect(tile.locator('.b-progress')).toBeHidden();expect((await persistedBook(page,c.title,c.id)).chapters[0].html).toContain('Alpha beta.');
});
