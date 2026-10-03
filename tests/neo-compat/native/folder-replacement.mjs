import assert from 'node:assert/strict';
import {cp,readFile,writeFile,rename,readdir,mkdir} from 'node:fs/promises';
import {join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {SourceBook} from '../../../packages/documents/document-contracts/src/index.ts';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashes(root){const out={};async function visit(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const file=join(folder,entry.name);if(entry.isDirectory())await visit(file);else if(entry.isFile())out[relative(root,file)]=sha(await readFile(file));}}await visit(root);return out;}
export async function runFolderReplacementUI({script,request,session,click,type,until,fixture,bookId}){
  const folder=join(fixture,bookId),stage=join(fixture,'.incoming-'+bookId),aside=join(fixture,'.preserved-'+bookId);
  const saved=async()=>SourceBook.parse(JSON.parse(await readFile(join(folder,'manuscript.json'),'utf8')));
  await click('.book[data-book-id="'+bookId+'"]');
  await until(()=>script('return document.querySelector(".chapter-body .ProseMirror")?.textContent.includes("Native typed sentence.");'),'original native paragraph');
  await until(()=>script('return document.querySelector(".save-state")?.textContent==="Saved";'),'clean original native receipt before external replacement');
  await request('/session/'+session+'/execute/async',{script:'const done=arguments[arguments.length-1];window.__TAURI__.core.invoke("host_request",{method:"runtimeState",payload:{}}).then(done).catch(error=>done(null,String(error)));',args:[]});
  assert.equal(await script('return document.querySelector(".save-state")?.textContent;'),'Saved');
  // Use the same supported HTML and passage-index adapter as the paired browser fixture.
  const parser=await build({stdin:{contents:`import {inspectHTML} from ${JSON.stringify(join(process.cwd(),'packages/editing/prosemirror-editor/src/fidelity.ts'))};import {entries,signature} from ${JSON.stringify(join(process.cwd(),'packages/editing/prosemirror-editor/src/identity.ts'))};import {randomUUID} from 'node:crypto';export function index(document,html,prior){const parsed=inspectHTML(document,html);if(!parsed.supported)throw Error('Unsupported remote fixture');return entries(parsed.model).map(entry=>{const digest=signature(entry.node),old=prior.find(row=>row.signature===digest&&JSON.stringify(row.path)===JSON.stringify(entry.path));return{id:old?.id??randomUUID(),path:entry.path,signature:digest};});}`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',target:'node24',write:false});
  const parserBytes=parser.outputFiles[0].contents,fixtureParserSha256=sha(parserBytes);
  const {index}=await import('data:text/javascript;base64,'+Buffer.from(parserBytes).toString('base64'));
  const change=book=>{const chapter=book.chapters[0];if('passages'in chapter)chapter.passages=index(new JSDOM('').window.document,chapter.html,chapter.passages);return SourceBook.parse(book);};
  const original=await saved(),chapterId=original.chapters[0].id;
  const companions={notes:await readFile(join(folder,'notes.html')),outline:await readFile(join(folder,'outline.html')),darlings:original.darlings,stickies:original.metadata.stickies};
  await cp(folder,stage,{recursive:true,filter:path=>basename(path)!=='.writer.lock'});
  const incoming=structuredClone(original);incoming.chapters[0].html+='<p><b>Remote incoming.</b></p>';
  await writeFile(join(stage,'manuscript.json'),JSON.stringify(change(incoming)));
  await rename(folder,aside);const protectedHashes=await hashes(aside);await rename(stage,folder);
  await until(()=>script('return document.querySelector(".chapter-body .ProseMirror")?.textContent.includes("Remote incoming.")&&!document.querySelector(".external-change-banner");'),'actual host-event adoption of replacement');
  const append=async(text)=>{await script('const el=document.querySelector(".chapter-body .ProseMirror"),p=el.querySelector("p:last-child"),range=document.createRange();range.selectNodeContents(p);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);el.focus();return true;');await type('.chapter-body .ProseMirror',text);await until(()=>script('return document.querySelector(".save-state")?.textContent==="Saved";'),'native durable replacement receipt');};
  await append(' X');
  await click('#back-to-shelf');await until(()=>script('return !!document.querySelector("#bookshelf-view");'),'replacement durable close');
  let current=await saved();assert.ok(current.chapters[0].html.includes('Remote incoming. X'));assert.ok(/<(?:b|strong)>Remote incoming\. X<\/(?:b|strong)>/.test(current.chapters[0].html));
  assert.equal(current.metadata.id,bookId);assert.equal(current.chapters[0].id,chapterId);
  await click('.book[data-book-id="'+bookId+'"]');await until(()=>script('return document.querySelector(".chapter-body")?.textContent.includes("Remote incoming. X");'),'replacement reopen');
  current.chapters[0].html+='<p><i>Later remote.</i></p>';await writeFile(join(folder,'manuscript.json'),JSON.stringify(change(current)));
  await until(()=>script('return document.querySelector(".chapter-body .ProseMirror")?.textContent.includes("Later remote.");'),'reattached watcher later external edit');
  await append(' Y');await click('#back-to-shelf');await until(()=>script('return !!document.querySelector("#bookshelf-view");'),'later durable close');
  current=await saved();assert.ok(/<(?:i|em)>Later remote\. Y<\/(?:i|em)>/.test(current.chapters[0].html));
  assert.ok(current.chapters[0].html.startsWith(original.chapters[0].html),'Original baseline paragraph bytes retain their exact rich HTML');
  assert.equal(current.metadata.id,bookId);assert.equal(current.chapters[0].id,chapterId);assert.deepEqual(current.darlings,companions.darlings);assert.deepEqual(current.metadata.stickies,companions.stickies);
  assert.deepEqual(await readFile(join(folder,'notes.html')),companions.notes);assert.deepEqual(await readFile(join(folder,'outline.html')),companions.outline);assert.deepEqual(await hashes(aside),protectedHashes);
  await click('.book[data-book-id="'+bookId+'"]');await until(()=>script('return document.querySelector(".chapter-body")?.textContent.includes("Later remote. Y");'),'later rich paragraph reopen');
  assert.equal(await script('return document.querySelectorAll(".chapter-body .ProseMirror p b,.chapter-body .ProseMirror p strong").length;'),1);
  assert.equal(await script('return document.querySelectorAll(".chapter-body .ProseMirror p i,.chapter-body .ProseMirror p em").length;'),1);
  await click('#back-to-shelf');await until(()=>script('return !!document.querySelector("#bookshelf-view");'),'folder proof releases writer');
  const artifacts=join(process.cwd(),'.leafloom/evidence/native-folder-replacement-'+Date.now());await mkdir(artifacts,{recursive:true});await cp(folder,join(artifacts,'incoming-final'),{recursive:true});await cp(aside,join(artifacts,'original-aside'),{recursive:true});await writeFile(join(artifacts,'protected-original-hashes.json'),JSON.stringify(protectedHashes,null,2));await writeFile(join(artifacts,'fixture-parser.mjs'),parserBytes);
  return{driver:'tauri-native-hidden',artifacts,fixtureParserSha256,protectedOriginalHashes:protectedHashes,finalFileHashes:await hashes(folder),evidence:[{id:'NEO-245-A',title:'[NEO-245-A] Leafloom: native whole-folder replacement and later external edit retain rich author writing',driverActions:['Replace the actual private book directory without its writer lock','Wait for actual host event and mounted WebView incoming paragraph','Type X through public WebDriver, save and reopen','Write a later external paragraph in the replacement folder, type Y, save and reopen'],assertions:['Actual rich incoming prose adopted with fresh ownership','Both later native author edits durably reopen with bold and italic marks','Book/chapter identity and companions retained','Original baseline rich HTML bytes unchanged','Every original aside file hash remains unchanged'],qualification:'hidden native WebView public selection and official WebDriver text input; physical keyboard input and visible paint unproved'}]};
}
