import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Page} from '@playwright/test';
import {test,expect} from './author-fixture';
import {BrowserAuthorDriver} from './browser-driver';
import {privateStorageRoot} from './storage-probe';
import {Book} from '../../../packages/documents/document-contracts/src/index';
import {Library} from '../../../packages/library/src/index';
export type BookFixture={chapters?:string[];metadata?:Record<string,unknown>;notes?:string;darlings?:unknown[];stickies?:unknown[];library?:Record<string,unknown>};
/** Existing disk state only. Every action and assertion after open uses production UI/files. */
export async function existingBook(page:Page,fixture:BookFixture={}){
 if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference'&&process.env.LEAFLOOM_REFERENCE_VERSION==='1.3.5')await expect(page.locator('#firstrun')).toBeVisible();
 const root=privateStorageRoot(page),id='book-'+test.info().testId,title='Outline '+test.info().testId.slice(-8),folder=path.join(root,id);
 const chapters=(fixture.chapters??['<p>Alpha beta.</p><p>Gamma delta.</p>']).map((html,i)=>({id:'ch-'+(i+1),html}));
 const metadata={id,title,author:'Fixture Writer',created:'2026-10-02T10:00:00Z',modified:'2026-10-02T10:00:00Z',tabNames:{notes:'Notes',outline:'Outline'},...fixture.metadata,...(fixture.stickies?{stickies:fixture.stickies}:{})};
 const library=Library.parse({firstRunDone:true,authorName:'Fixture Writer',authors:[{id:'fixture-author',name:'Fixture Writer'}],currentAuthorId:'fixture-author',shelves:[{id:'fixture-shelf',name:'Fixture books',authorId:'fixture-author',bookIds:[id]}],writingStyle:'pantser',fonts:{body:'Georgia',dropcap:'literary'},pageTheme:'paper',...fixture.library});
 await mkdir(folder,{recursive:true});await writeFile(path.join(root,'library.json'),JSON.stringify(library));await writeFile(path.join(folder,'notes.html'),fixture.notes??'');await writeFile(path.join(folder,'outline.html'),'');
 if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference'){
  await mkdir(path.join(folder,'chapters'),{recursive:true});await writeFile(path.join(folder,'book.json'),JSON.stringify({...metadata,chapterOrder:chapters.map(c=>c.id)}));for(const chapter of chapters)await writeFile(path.join(folder,'chapters',chapter.id+'.html'),chapter.html);await writeFile(path.join(folder,'darlings.json'),JSON.stringify(fixture.darlings??[]));await writeFile(path.join(folder,'stickies.json'),JSON.stringify(fixture.stickies??[]));await page.reload();
 }else await writeFile(path.join(folder,'manuscript.json'),JSON.stringify(Book.parse({formatVersion:'neo-lifecycle/v1',revision:0,metadata,chapters,darlings:fixture.darlings??[]})));
 const driver=new BrowserAuthorDriver(page);await driver.open();await expect(page.locator('#firstrun')).toBeHidden();await driver.selectBook(title);return {driver,page,id,title,folder};
}
