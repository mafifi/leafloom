import {test,expect} from './author-fixture';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {BrowserAuthorDriver} from './browser-driver';
import {root,evidenceMetadata} from '../evidence.mjs';
import {Book} from '../../../packages/documents/document-contracts/src/index';
import type {TelemetryDiagnostics} from '../../../packages/observability/telemetry-contracts/src/index';
import {Library} from '../../../packages/library/src/index';
const mod=process.platform==='darwin'?'Meta':'Control';
const percentile=(values:number[],fraction:number)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*fraction)-1];
for(const configuration of [{count:10_000,chapterCount:10,paragraphs:10,wordsPerParagraph:100},{count:100_000,chapterCount:100,paragraphs:10,wordsPerParagraph:100},{count:100_000,chapterCount:1,paragraphs:4000,wordsPerParagraph:25}])test(`Leafloom production performance: ${configuration.count} word book ${configuration.paragraphs===4000?'dense4000paragraph ':''}native typing, retained views and durable save`,async({page})=>{
 const {count,chapterCount,paragraphs,wordsPerParagraph}=configuration; const shape=paragraphs===4000?'dense4000':'';
 test.setTimeout(120_000);
 const fixture=process.env.LEAFLOOM_TEST_ROOT;if(!fixture)throw Error('Performance requires private filesystem fixture');
 const id='book-performance-'+count+shape,title='Performance '+count+shape,folder=path.join(fixture,id),line=Array.from({length:wordsPerParagraph},(_,i)=>'word'+String(i).padStart(3,'0')).join(' ');
 const chapters=Array.from({length:chapterCount},(_,i)=>({id:'performance-chapter-'+i,html:Array.from({length:paragraphs},()=>'<p>'+line+'</p>').join('')}));
 const book=Book.parse({formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id,title,author:'Performance Writer',kind:'novel'},chapters,darlings:[]});
 const library=Library.parse({firstRunDone:true,authorName:'Performance Writer',authors:[{id:'performance-author',name:'Performance Writer'}],currentAuthorId:'performance-author',shelves:[{id:'performance-shelf',name:'Synthetic performance books',authorId:'performance-author',bookIds:[id]}],writingStyle:'pantser',fonts:{body:'Georgia',dropcap:'none'},pageTheme:'paper'});
 // Only initial synthetic state is prepared through files. All measured edits use production UI.
 await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'manuscript.json'),JSON.stringify(book));await writeFile(path.join(folder,'notes.html'),'');await writeFile(path.join(folder,'outline.html'),'');await writeFile(path.join(fixture,'library.json'),JSON.stringify(library));
 const d=new BrowserAuthorDriver(page),opened=performance.now();await d.open();await page.locator(`.book[data-book-id="${id}"]`).click();await expect(page.locator('.chapter-body .ProseMirror')).toHaveCount(chapters.length);await page.evaluate(()=>document.fonts.ready);const openMs=performance.now()-opened;
 await d.select(0,0,line.length);
 await page.evaluate(()=>{
  const views=[...document.querySelectorAll('.chapter-body .ProseMirror')],editor=views[0];
  const data={views,samples:[] as number[],trusted:[] as boolean[],pending:null as {started:number,text:string}|null};
  const observe=new MutationObserver(()=>{const pending=data.pending;if(!pending||editor.textContent===pending.text)return;data.pending=null;requestAnimationFrame(()=>requestAnimationFrame(()=>data.samples.push(performance.now()-pending.started)));});
  observe.observe(editor,{subtree:true,characterData:true,childList:true});
  editor.addEventListener('keydown',event=>{const key=event as KeyboardEvent;if(key.key.length===1&&!key.ctrlKey&&!key.metaKey&&!key.altKey){data.trusted.push(key.isTrusted);data.pending={started:performance.now(),text:editor.textContent??''};}},true);
  (window as unknown as {leafloomPerf:typeof data}).leafloomPerf=data;
 });
 for(let i=0;i<16;i++){await d.type('x');await expect.poll(()=>page.evaluate(()=>(window as unknown as {leafloomPerf:{samples:number[]}}).leafloomPerf.samples.length)).toBe(i+1);}
 const measured=await page.evaluate(()=>{const data=(window as unknown as {leafloomPerf:{views:Element[];samples:number[];trusted:boolean[]}}).leafloomPerf;const current=[...document.querySelectorAll('.chapter-body .ProseMirror')];return {samples:data.samples,trusted:data.trusted,retainedViews:current.length===data.views.length&&current.every((view,i)=>view===data.views[i]),renderedViews:current.length};});
 expect(measured.trusted.every(Boolean)).toBe(true);expect(measured.retainedViews).toBe(true);expect(measured.renderedViews).toBe(chapters.length);
 const samples=measured.samples.slice(3),p50=percentile(samples,.5),p95=percentile(samples,.95);
 const saved=page.waitForResponse(response=>{try{const request=response.request().postDataJSON();return response.url().endsWith('/__leafloom/host')&&request.method==='checkpoint'&&request.payload.bookId===id;}catch{return false;}});
 await d.type('Z');const saveStarted=performance.now();await d.key(mod+'+s');const response=await saved,saveMs=performance.now()-saveStarted,reply=await response.json();expect(reply.ok).toBe(true);
 for(const [name,file] of Object.entries({manuscript:'manuscript.json',reviews:'reviews.json',notes:'notes.html',outline:'outline.html'}))expect(reply.value.versions[name]).toBe(createHash('sha256').update(await readFile(path.join(folder,file))).digest('hex'));
 await expect(page.locator('.save-state')).toHaveText('Saved');const actual=JSON.parse(await readFile(path.join(folder,'manuscript.json'),'utf8'));expect(actual.chapters[0].html).toContain('x'.repeat(16)+'Z');
 const telemetry=await page.evaluate(async()=>await (window as unknown as {__leafloomTelemetryDiagnostics?:()=>Promise<TelemetryDiagnostics>}).__leafloomTelemetryDiagnostics?.()??null);
 const report={telemetry,schema:'leafloom/performance-v1',words:count,chapters:chapters.length,paragraphsPerChapter:paragraphs,openMs,inputToPaint:{p50,p95,samples},saveReceiptMs:saveMs,retainedViews:measured.retainedViews,renderedViews:measured.renderedViews,historySnapshotObservation:'not exposed by runtime diagnostics',metadata:await evidenceMetadata('browser')};
 const artifact=path.join(root,'.leafloom/evidence',`performance-${count}${shape}-${Date.now()}.json`);await mkdir(path.dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');await test.info().attach('performance',{path:artifact,contentType:'application/json'});
 await d.shelf();expect(p95,'native key to two subsequent animation frames, warm samples').toBeLessThanOrEqual(50);
});
