import {test,expect} from './author-fixture';
import {existingBook} from './book-fixture';
import {persistedBook,privateStorageRoot} from './storage-probe';
import {clickReferenceMenu} from '../reference/harness';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Page} from '@playwright/test';
const source=process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference';
async function flags(page:Page){
 if(source)return page.evaluate(()=>Array.from(CSS.highlights.get('neo-spell')||[]).map(r=>r.toString()).sort());
 return (await page.locator('[data-annotation-kind="spelling"]').allTextContents()).sort();
}
async function pass(page:Page){
 if(source)await clickReferenceMenu(page,['Edit','Spellcheck Pass']);
 else{await page.locator('#format-menu').click();await page.getByRole('menuitem',{name:'Spellcheck on',exact:true}).click();}
}
function word(n:number){let suffix='';do{suffix=String.fromCharCode(97+n%26)+suffix;n=Math.floor(n/26)-1;}while(n>=0);return 'qzxqueued'+suffix;}

test('[NEO-180-B] Leafloom: actual hundred-thousand-word renderer scan cannot paint obsolete rich text after replacement and chapter switch',async({page})=>{
 test.setTimeout(90_000);
 const words=Array.from({length:100000},(_,i)=>word(i));
 expect(new Set(words).size).toBe(100000);
 const paragraphs=Array.from({length:1000},(_,i)=>words.slice(i*100,(i+1)*100).join(' '));
 const html=paragraphs.map(text=>'<p><b>'+text+'</b></p>').join(''),wrong='qzxsecondmisspelling';
 const c=await existingBook(page,{chapters:[html,'<p><i>'+wrong+'</i></p>'],notes:'<p>Research stays.</p>'});
 await c.driver.select(0,0,0);
 const fixture=path.resolve(privateStorageRoot(page),'../..'),control=path.join(fixture,'.neo-parity-host.json');
 type RecordEntry={type:string;payload:{channel:string;id?:number;args?:unknown[]}};
 const records=async()=>JSON.parse(await readFile(path.join(fixture,'intercepted-effects.json'),'utf8')) as RecordEntry[];
 let finalFetched=false,finalCompleted=false;
 const batches:string[][]=[];
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 if(source)await writeFile(control,JSON.stringify({ipcLog:true,ipcDelays:{'spell:check':{after:6000}}}));
 else await page.route('**/__leafloom/host',async route=>{
  const request=route.request().postDataJSON();
  if(request.method!=='spellcheck'||!request.payload.words.some((w:string)=>w.startsWith('qzxqueued')))return route.continue();
  batches.push(request.payload.words);
  const response=await route.fetch();
  if(request.payload.words.includes(words.at(-1))){finalFetched=true;await held;await route.fulfill({response});finalCompleted=true;}
  else await route.fulfill({response});
 });
 await pass(page);
 let oldID:number|undefined;
 if(source){
  await expect.poll(async()=>(await records()).filter(r=>r.type==='ipc-start'&&r.payload.channel==='spell:check').length,{timeout:30000}).toBe(1);
  const start=(await records()).find(r=>r.type==='ipc-start'&&r.payload.channel==='spell:check')!;
  oldID=start.payload.id;
  expect(start.payload.args?.[0]).toEqual(words);
  expect((await records()).some(r=>r.type==='ipc-complete'&&r.payload.id===oldID&&r.payload.channel==='spell:check')).toBe(false);
  await writeFile(control,JSON.stringify({ipcLog:true}));
 }else{
  await expect.poll(()=>finalFetched,{timeout:45000}).toBe(true);
  expect(batches.every(batch=>batch.length<=10000)).toBe(true);expect([...new Set(batches.flat())]).toEqual(words);
  await test.info().attach('actual-provider-batches',{body:JSON.stringify({batchSizes:batches.map(batch=>batch.length),requestWords:batches.flat().length,distinctWords:new Set(batches.flat()).size}),contentType:'application/json'});
  expect(finalCompleted).toBe(false);
 }
 try{
  await c.driver.select(0,0,0,paragraphs.at(-1)!.length,999);
  await page.keyboard.insertText('hello');
  await expect(page.locator('.chapter-body').first()).toHaveText('hello');
  await c.driver.select(1,0,0);
  await expect.poll(()=>flags(page)).toEqual([wrong]);
  if(source)expect((await records()).some(r=>r.type==='ipc-complete'&&r.payload.id===oldID&&r.payload.channel==='spell:check')).toBe(false);
  else expect(finalCompleted).toBe(false);
 }finally{release();}
 if(source)await expect.poll(async()=>(await records()).some(r=>r.type==='ipc-complete'&&r.payload.id===oldID&&r.payload.channel==='spell:check'),{timeout:30000}).toBe(true);
 else await expect.poll(()=>finalCompleted).toBe(true);
 await expect.poll(()=>flags(page)).toEqual([wrong]);
 if(source)expect(await page.evaluate(()=>Array.from(CSS.highlights.get('neo-spell')||[]).every(r=>r.startContainer.isConnected&&r.endContainer.isConnected))).toBe(true);
 else expect(await page.locator('[data-annotation-kind="spelling"]').evaluateAll((elements,word)=>elements.every(e=>e.isConnected&&e.closest('.chapter-body')?.textContent===word),wrong)).toBe(true);
 await c.driver.shelf();
 const saved=await persistedBook(page,c.title,c.id);
 expect(saved.chapters.map((ch:{html:string})=>ch.html)).toEqual(['<p><b>hello</b></p>','<p><i>'+wrong+'</i></p>']);
 expect(saved.notes).toBe('<p>Research stays.</p>');
 await c.driver.selectBook(c.title);await c.driver.expectParagraphs([['hello'],[wrong]]);
 await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('hello');
 await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText(wrong);
 test.info().annotations.push({type:'real-worker-workload',description:'100000 distinct words in the actual first chapter; original submits one renderer request, candidate reaches all100000 distinct words through validated batches of at most10000 and holds the real last-word batch reply; actual batch sizes/total, including generation restarts, are attached. This strengthens the historical small-book/manual-queue fixture; it does not claim an identical unbounded candidate IPC payload.'});
});

test('[NEO-174-A] Leafloom: English Wh-what and repeated prefix stammers judge the final word while ordinary compounds retain rich author Undo',async({page})=>{
 const text='Wh-what Wh-whut W-wh-what glarp-known',html='<p>Wh-what <i>Wh-whut</i> W-wh-what <b>glarp-known</b></p>';
 const c=await existingBook(page,{chapters:[html],notes:'<p>Unchanged notes.</p>'});
 await c.driver.select(0,0,0);await pass(page);
 await expect.poll(()=>flags(page)).toEqual(['glarp','whut']);
 const start=text.indexOf('whut');await c.driver.select(0,0,start,start+4);await page.keyboard.insertText('what');
 await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('Wh-what');
 await expect.poll(()=>flags(page)).toEqual(['glarp']);
 await c.driver.undo();await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('Wh-whut');
 await expect.poll(()=>flags(page)).toEqual(['glarp','whut']);
 await c.driver.shelf();const saved=await persistedBook(page,c.title,c.id);
 expect(saved.chapters[0].html).toBe(html);expect(saved.notes).toBe('<p>Unchanged notes.</p>');
 await c.driver.selectBook(c.title);await c.driver.expectParagraphs([[text]]);
 await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('glarp-known');
});
