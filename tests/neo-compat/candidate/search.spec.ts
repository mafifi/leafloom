import {test,expect} from './author-fixture';
import {writing} from './editing-helpers';
import {clickReferenceMenu} from '../reference/harness';
const mod=process.platform==='darwin'?'Meta':'Control';
const find=async(d:Awaited<ReturnType<typeof writing>>,query:string)=>{if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference')await clickReferenceMenu(d.page,['Edit','Find & Replace']);else await d.key(mod+'+f');await expect(d.page.locator('#search-input')).toBeFocused();await d.page.locator('#search-input').fill(query);};
test('[NEO-160-A] Leafloom: Find treats metacharacters literally, folds case and counts nonoverlapping matches',async({page})=>{
 const d=await writing(page);await d.type('A.* a.* AA.*');await find(d,'a.*');await expect(page.locator('#search-count')).toHaveText('3 found');
 await page.locator('#search-input').fill('aa');await expect(page.locator('#search-count')).toHaveText('1 found');
 await page.locator('#search-input').fill('[');await expect(page.locator('#search-count')).toHaveText('none');await d.expectParagraphs([['A.* a.* AA.*']]);
});
test('[NEO-164-A] Leafloom: Find next previous keyboard and buttons wrap without selecting manuscript',async({page})=>{
 const d=await writing(page);await d.type('Alpha alpha Alpha');await d.select(0,0,0);await find(d,'alpha');await expect(page.locator('#search-count')).toHaveText('3 found');
 await page.locator('#search-input').press('Enter');await expect(page.locator('#search-count')).toHaveText('1 of 3');
 await page.locator('#search-input').press('Shift+Enter');await expect(page.locator('#search-count')).toHaveText('3 of 3');
 await page.locator('#search-prev').click();await expect(page.locator('#search-count')).toHaveText('2 of 3');
 await page.locator('#search-next').click();await expect(page.locator('#search-count')).toHaveText('3 of 3');
 expect(await page.evaluate(()=>getSelection()?.toString()??'')).toBe('');await d.expectParagraphs([['Alpha alpha Alpha']]);
});
test('[NEO-165-A] Leafloom: Tab from Find places editable caret at result end for subsequent native typing',async({page})=>{
 const d=await writing(page);await d.type('Alpha beta.');await find(d,'beta');await expect(page.locator('#search-count')).toHaveText('1 found');await page.locator('#search-input').press('Tab');expect(await d.caret()).toMatchObject({chapter:0,paragraph:0,offset:10,collapsed:true});await d.type('X');await d.expectParagraphs([['Alpha betaX.']]);
});
for(const method of ['Escape','button'])test(`[NEO-168-A] Leafloom: Find ${method} clears search and later author input refreshes results`,async({page})=>{
 const d=await writing(page);await d.type('Alpha.');await find(d,'alpha');await expect(page.locator('#search-count')).toHaveText('1 found');if(method==='Escape')await page.locator('#search-input').press('Escape');else await page.locator('#search-close').click();await expect(page.locator('#searchbar')).toBeHidden();await expect(page.locator('[data-annotation-kind="search"],.search-hit')).toHaveCount(0);await d.select(0,0,6);await d.type(' Alpha.');await find(d,'alpha');await expect(page.locator('#search-count')).toHaveText('2 found');await d.expectParagraphs([['Alpha. Alpha.']]);
});

test('[NEO-159-A] Leafloom: Find prefills at most eighty trimmed selected characters and hints without a book',async({page})=>{
 const d=await writing(page),text='  '+('Longword '.repeat(15))+'  ';await d.type(text);await d.select(0,0,0,text.length);if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference')await clickReferenceMenu(d.page,['Edit','Find & Replace']);else await d.key(mod+'+f');await expect(page.locator('#search-input')).toHaveValue(text.slice(0,80).trim());await expect(page.locator('#search-input')).toBeFocused();await page.locator('#search-close').click();await d.shelf();if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference')await clickReferenceMenu(d.page,['Edit','Find & Replace']);else await d.key(mod+'+f');await expect(page.locator('#hint')).toContainText('Open a book first');await expect(page.locator('#bookshelf-view')).toBeVisible();
});
test('[NEO-166-A] Leafloom: Replace Enter and button preserve surrounding marks and no-match hints',async({page})=>{
 const d=await writing(page);await d.key(mod+'+b');await d.type('Alpha');await d.key(mod+'+b');await d.type(' beta Alpha.');await find(d,'alpha');await page.locator('#replace-input').fill('Omega');await page.locator('#replace-input').press('Enter');await d.expectParagraphs([['Omega beta Alpha.']]);await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('Omega');await page.locator('#replace-one').click();await d.expectParagraphs([['Omega beta Omega.']]);await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('Omega');await expect(page.locator('#search-count')).toHaveText('none');await page.locator('#replace-one').click();await expect(page.locator('#hint')).toContainText('No matches');await d.expectParagraphs([['Omega beta Omega.']]);
});
test('[NEO-167-A] Leafloom: Replace All across chapters has one Undo and no-match replacement adds no history',async({page})=>{
 const d=await writing(page);await d.type('Alpha alpha.');await d.key('Enter');await d.key('Enter');await d.key('Enter');await d.type('ALPHA tail.');await d.expectParagraphs([['Alpha alpha.'],['ALPHA tail.']]);await find(d,'alpha');await page.locator('#replace-input').fill('Omega');await page.locator('#replace-all').click();await d.expectParagraphs([['Omega Omega.'],['Omega tail.']]);if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference')await page.locator('#replace-all').focus();else await d.select(0,0,0);await d.undo();await d.expectParagraphs([['Alpha alpha.'],['ALPHA tail.']]);await d.redo();await d.expectParagraphs(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference'?[['Alpha alpha.'],['ALPHA tail.']]:[['Omega Omega.'],['Omega tail.']]);if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference'){await find(d,'alpha');await page.locator('#replace-input').fill('Omega');await page.locator('#replace-all').click();await d.expectParagraphs([['Omega Omega.'],['Omega tail.']]);}await find(d,'absent');await page.locator('#replace-all').click();if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference')await page.locator('#replace-all').focus();else await d.select(0,0,0);await d.undo();await d.expectParagraphs([['Alpha alpha.'],['ALPHA tail.']]);
});
