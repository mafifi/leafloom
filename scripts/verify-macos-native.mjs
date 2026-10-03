import { FontFamilies } from '../packages/host/desktop-host/src/index.ts';
import { Book } from '../packages/documents/document-contracts/src/index.ts';
import { evidenceMetadata } from '../tests/neo-compat/evidence.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { join, resolve,dirname } from 'node:path';
import {createHash} from 'node:crypto';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import {createServer as createHTTPServer} from 'node:http';
import { once } from 'node:events';
const binary = resolve(process.argv[2] ?? 'apps/desktop/src-tauri/target/debug/leafloom-desktop');
const evidenceIdentity = {
  evidenceSchema: 'leafloom/native-v1',
  appImplementation: 'leafloom-production',
  driver: 'tauri-native-hidden',
  referenceCommit: 'ed090e9988d446daf1ebbde91bcebc13b599909b',
};
const buildSha256Before = (await evidenceMetadata('tauri-native-hidden')).buildSha256;
let buildSha256After;
const fixture = await mkdtemp(join(tmpdir(), 'leafloom-native-fixture-'));
await writeFile(join(fixture, '.leafloom-fixture'), '');
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
let imageRelease;let imageStarted=false;let providerPosts=0;
const imageGate=new Promise(resolve=>{imageRelease=resolve;});
const offlineImage=process.argv.includes('--cover-ui')?await readFile(new URL('../apps/desktop/src-tauri/icons/Leafloom.iconset/icon_16x16.png',import.meta.url)):Buffer.from([255,216,255,217]);
let coverServer;
if(process.argv.includes('--cover-art')||process.argv.includes('--cover-ui')) {
 coverServer=createHTTPServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const payload=raw?JSON.parse(raw):null;res.setHeader('Content-Type','application/json');if(req.url==='/models'){res.end(JSON.stringify({data:[]}));return;}providerPosts++;if(req.url==='/chat/completions'){res.end(JSON.stringify({choices:[{message:{content:'A synthetic river at dusk, blue light, no lettering.'}}]}));return;}if(req.url==='/images/generations'){imageStarted=true;await imageGate;res.end(JSON.stringify({data:[{b64_json:offlineImage.toString('base64')}]}));return;}res.statusCode=404;res.end('{}');});coverServer.listen(0,'127.0.0.1');await once(coverServer,'listening');
}
const child = spawn(binary, [], {
  detached:true,
  env: {
    ...process.env,
    LEAFLOOM_FIXTURE_ROOT: fixture,
    LEAFLOOM_HIDDEN: '1',
    ...(process.argv.includes('--document-io')||process.argv.includes('--collection-io')?{LEAFLOOM_FIXTURE_DIALOGS:'1'}:{}),
    ...(process.argv.includes('--runtime-env')?{NODE_OPTIONS:'--leafloom-forbidden-option',NODE_PATH:fixture,NODE_REPL_EXTERNAL_MODULE:join(fixture,'unavailable.mjs')}:{}),
    ...(coverServer?{LEAFLOOM_ART_FIXTURE_BASE:'http://127.0.0.1:'+coverServer.address().port}:{}),
    TAURI_WEBDRIVER_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (data) => (stderr += data));
child.stdout.on('data', (data) => process.stderr.write(data));
const base = 'http://127.0.0.1:' + port;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let session, hostPid, artifactBinding, documentIOCallbackSha256, documentIOSharedSha256, documentIOEdgeHashes, collectionIOCallbackSha256,folderReplacementCallbackSha256;
const driverSha256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
async function request(path, body, method = body ? 'POST' : 'GET') {
  if (process.env.LEAFLOOM_NATIVE_VERBOSE) process.stderr.write(method + ' ' + path + '\n');
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw Error(JSON.stringify(result));
  return result.value;
}
async function until(predicate, label) {
  let last;
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      last = error.message;
    }
    if (child.exitCode !== null) throw Error('Native app exited: ' + stderr);
    await pause(150);
  }
  throw Error('Native timeout: ' + label + ' last=' + last + ' ' + stderr);
}
async function script(source, args = []) {
  return request('/session/' + session + '/execute/sync', { script: source, args });
}
async function invoke(command, args) {
  return request('/session/' + session + '/execute/async', {
    script:
      'const done=arguments[arguments.length-1];window.__TAURI__.core.invoke(arguments[0],arguments[1]).then(done).catch(e=>done(null,String(e)));',
    args: [command, args],
  });
}
async function element(selector) {
  const value = await request('/session/' + session + '/element', {
    using: 'css selector',
    value: selector,
  });
  return value['element-6066-11e4-a52e-4f735466cecf'];
}
async function click(selector) {
  return request('/session/' + session + '/element/' + (await element(selector)) + '/click', {});
}
async function clear(selector){return request('/session/'+session+'/element/'+(await element(selector))+'/clear',{});}
async function type(selector, text) {
  return request('/session/' + session + '/element/' + (await element(selector)) + '/value', {
    text,
  });
}
try {
  await until(() => request('/status'), 'embedded driver');
  const created = await request('/session', { capabilities: { alwaysMatch: {} } });
  session = created.sessionId;
  await pause(1000);
  const startup = await script(
    'return {url:location.href,native:!!window.__TAURI__,errors:window.__leafloomErrors}',
  );
  if (startup.errors?.length)
    throw Error('Native frontend startup error: ' + JSON.stringify(startup.errors));
  await until(() => script('return !!document.querySelector("#fr-name")'), 'onboarding');
  const diag = await invoke('host_request', { method: 'diagnostics', payload: {} });
  if (!diag.ok || diag.value.root !== fixture) throw Error('Native app did not use owned fixture');
  hostPid = diag.value.pid;
  const resourceHost=dirname(diag.value.runtime.entry);
  if(!diag.value.runtime.entry.endsWith('/main.mjs')||dirname(diag.value.runtime.executable)!==resourceHost)throw Error('Unexpected native runtime entry boundary');
  const checksum=async(path)=>createHash('sha256').update(await readFile(path)).digest('hex');
  artifactBinding={driverSha256,runtimeEntry:diag.value.runtime.entry,runtimeExecutable:diag.value.runtime.executable,binarySha256:await checksum(binary),hostMainSha256:await checksum(join(resourceHost,'main.mjs')),nodeSha256:await checksum(diag.value.runtime.executable),webAssets:await request('/session/'+session+'/execute/async',{script:'const done=arguments[arguments.length-1];const urls=[...document.querySelectorAll("script[src],link[rel=stylesheet][href]")].map(el=>el.src||el.href);Promise.all(urls.map(async url=>{const bytes=await(await fetch(url)).arrayBuffer();const sha256=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(v=>v.toString(16).padStart(2,"0")).join("");return {path:new URL(url).pathname,sha256};})).then(done).catch(e=>done(null,String(e)));',args:[]})};
  if(!artifactBinding.webAssets.length)throw Error('Native acceptance omitted actual served frontend assets');
  const installedFonts=FontFamilies.parse(await invoke('os_request',{method:'fontFamilies',payload:{}}));
  if(installedFonts.length<10||new Set(installedFonts).size!==installedFonts.length||(process.platform==='darwin'&&!installedFonts.includes('Georgia')))throw Error('Native font inventory did not enumerate actual installed families');
  let menuFilter;
  if(process.argv.includes('--menu-filter')){
    const checks=[];
    for(const locale of ['en','fr','en']) {
      const changed=await invoke('host_request',{method:'setLanguage',payload:{language:locale}});if(!changed.ok)throw Error('Menu filter locale rebuild failed');
      const check=await invoke('os_request',{method:'_menuProbe',payload:{}});
      if(!check.foreignHidden||!check.copyVisible||!check.ownedVisible)throw Error('Live native menu filter failed after rebuild: '+JSON.stringify(check));checks.push({locale,...check});
    }
    menuFilter={liveInsertion:true,rebuilds:checks};
  }
  const duplicateInstance=spawn(binary,[],{env:{...process.env,LEAFLOOM_FIXTURE_ROOT:fixture,LEAFLOOM_HIDDEN:'1',TAURI_WEBDRIVER_PORT:String(port)},stdio:'ignore'});
  const duplicateExit=await Promise.race([once(duplicateInstance,'exit').then(([code])=>code),pause(5000).then(()=>null)]);
  if(duplicateExit!==0){duplicateInstance.kill('SIGKILL');throw Error('Second application instance was not refused before host startup');}
  const invalid = await invoke('host_request', {
    method: 'readFile',
    payload: { path: '/etc/passwd' },
  });
  if (invalid.ok || invalid.code !== 'INVALID') throw Error('Arbitrary filesystem command escaped');
  const forbidden = await invoke('host_request', {
    method: 'importLegacy',
    payload: { source: '/tmp/unselected' },
  });
  if (forbidden.ok || forbidden.code !== 'UNAUTHORIZED')
    throw Error('Unselected path escaped native grants');
  let coverEvidence;
  if(coverServer&&!process.argv.includes('--cover-ui')) {
   const os=async(method,payload)=>{const reply=await request('/session/'+session+'/execute/async',{script:'const done=arguments[arguments.length-1];window.__TAURI__.core.invoke("os_request",{method:arguments[0],payload:arguments[1]}).then(v=>done({ok:true,value:v})).catch(e=>done({ok:false,code:String(e)}));',args:[method,payload]});return reply;};
   const secret=await os('setSecret',{provider:'openai',value:'synthetic-fixture-key'});if(!secret.ok||secret.value.storage!=='fixture'||!secret.value.configured)throw Error('Fixture credential boundary failed');
   const created=await invoke('host_request',{method:'createBook',payload:{title:'Synthetic cover',author:'Fixture'}});if(!created.ok)throw Error('Cover fixture creation failed');const bookId=created.value.id;
   const job=await os('paintCover',{bookId,quality:'low'});if(!job.ok||job.value.status!=='brief')throw Error('Cover job did not start');
   await until(()=>imageStarted,'held offline image request');
   const duplicate=await os('paintCover',{bookId});if(duplicate.ok||duplicate.code!=='BUSY')throw Error('Duplicate paid request escaped one-job boundary');
   const start=performance.now();const concurrent=await invoke('host_request',{method:'getSettings',payload:{}});const concurrentHostMs=performance.now()-start;if(!concurrent.ok||concurrentHostMs>3000)throw Error('Cover worker blocked main host');
   imageRelease();const completed=await until(async()=>{const value=await os('coverArtJob',{bookId});return value.ok&&value.value.status==='done'?value.value:null;},'cover durable receipt');
   const bytes=await readFile(join(fixture,bookId,completed.result.file));if(!bytes.equals(Buffer.from([255,216,255,217])))throw Error('Saved offline artwork mismatch');
   const sidecar=await readFile(join(fixture,bookId,'art.json'),'utf8');if(sidecar.includes('synthetic-fixture-key'))throw Error('Credential leaked to artwork sidecar');
   await os('setSecret',{provider:'openai',value:null});const cleared=await os('hasSecret',{provider:'openai'});if(cleared.value.configured)throw Error('Fixture credential clear failed');
   coverEvidence={provider:'offline-loopback',credentialStorage:'fixture',oneJob:true,concurrentHostMs,providerPosts,phases:'brief→painting→saving→done',durableArt:true};
  }
  await type('#fr-name', 'Native Writer');
  if (await script('return !!document.querySelector(".fr-choice[data-style=pantser]")'))
    await click('.fr-choice[data-style=pantser]');
  if (await script('return !!document.querySelector("#fr-next")')) await click('#fr-next');
  await click('#fr-done');
  await until(
    () =>
      script('return !!document.querySelector(".new-book")&&!document.querySelector("#firstrun")'),
    'library',
  );
  await click('.new-book');
  await until(
    () =>
      script(
        'return !!document.querySelector("#editor-view,form.modal input,form.modal-box input")',
      ),
    'one-click new book',
  );
  if (await script('return !!document.querySelector("form.modal input,form.modal-box input")')) {
    await type('form.modal input,form.modal-box input', 'Native Proof');
    await click('form.modal button[type="submit"],form.modal-box button[type="submit"]');
  }
  await until(() => script('return !!document.querySelector("#editor-view")'), 'editor');
  await click('.add-chapter');
  await until(
    () => script('return !!document.querySelector(".chapter-body .ProseMirror")'),
    'native editor surface',
  );
  await type('.chapter-body .ProseMirror', 'Native typed sentence.');
  await until(
    () =>
      script(
        'return document.querySelector(".save-state")?.textContent==="Saved"&&document.querySelector(".chapter-body")?.textContent.includes("Native typed sentence.")',
      ),
    'durable autosave',
  );
  await click('#back-to-shelf');
  await until(
    () => script('return !!document.querySelector(".book[data-book-id]")'),
    'library return',
  );
  const bookId = await script(
    'return document.querySelector(".book[data-book-id]").dataset.bookId',
  );
  const onDisk = JSON.parse(await readFile(join(fixture, bookId, 'manuscript.json'), 'utf8'));
  if (!onDisk.chapters.some((c) => c.html.includes('Native typed sentence.')))
    throw Error('Native save absent on disk');
  await click('.book[data-book-id]');
  await until(
    () =>
      script(
        'return document.querySelector(".chapter-body")?.textContent.includes("Native typed sentence.")',
      ),
    'native reopen',
  );
  const spell = await invoke('host_request', {
    method: 'spellcheck',
    payload: { words: ['writer', 'zzbadspellingzz'], language: 'en-US' },
  });
  if (!spell.ok || spell.value.writer !== true || spell.value.zzbadspellingzz !== false)
    throw Error('Native bundled Hunspell failed');
  await click('#back-to-shelf');
  await until(() => script('return !!document.querySelector("#bookshelf-view")'), 'lease release');
  let coverUI;
  if(process.argv.includes('--cover-ui')){
    const callbackSha256=createHash('sha256').update(await readFile(new URL('../tests/neo-compat/native/cover-art.mjs',import.meta.url))).digest('hex');
    const {runCoverArtUI}=await import('../tests/neo-compat/native/cover-art.mjs');
    coverUI=await runCoverArtUI({script,request,click,type,clear,until,fixture,bookId,session,offlineProvider:{imageSha256:createHash('sha256').update(offlineImage).digest('hex'),get posts(){return providerPosts;},get imageStarted(){return imageStarted;},releaseImage(){imageRelease();}}});
    coverUI.callbackSha256=callbackSha256;
  }
  let documentIO;
  if(process.argv.includes('--document-io')){
    const callbackSha256=createHash('sha256').update(await readFile(new URL('../tests/neo-compat/native/document-io.mjs',import.meta.url))).digest('hex');
    documentIOCallbackSha256=callbackSha256;
    documentIOSharedSha256=createHash('sha256').update(await readFile(new URL('../tests/neo-compat/shared/document-io.mjs',import.meta.url))).digest('hex');
    documentIOEdgeHashes=Object.fromEntries(await Promise.all(['native/io-cover-edge.mjs','shared/io-cover-edge.mjs','shared/pdf-layout.mjs'].map(async file=>[file,createHash('sha256').update(await readFile(new URL('../tests/neo-compat/'+file,import.meta.url))).digest('hex')])));
    const {runDocumentIOUI}=await import('../tests/neo-compat/native/document-io.mjs');
    documentIO=await runDocumentIOUI({script,request,click,type,clear,until,fixture,bookId,session,artifactOnly:process.argv.includes('--document-io-artifacts-only')});
    documentIO.callbackSha256=callbackSha256;
    documentIO.sharedSha256=documentIOSharedSha256;
    documentIO.edgeModuleHashes=documentIOEdgeHashes;
    const frontendErrors=await script('return window.__leafloomErrors??[];');
    if(frontendErrors.length)throw Error('Native frontend document IO error: '+JSON.stringify(frontendErrors));
  }
  let collectionIO;
  if(process.argv.includes('--collection-io')){
    collectionIOCallbackSha256=createHash('sha256').update(await readFile(new URL('../tests/neo-compat/native/collection-output.mjs',import.meta.url))).digest('hex');
    const {runCollectionUI}=await import('../tests/neo-compat/native/collection-output.mjs');
    collectionIO=await runCollectionUI({script,request,click,type,clear,until,fixture,bookId,session});
    collectionIO.callbackSha256=collectionIOCallbackSha256;
    const frontendErrors=await script('return window.__leafloomErrors??[];');
    if(frontendErrors.length)throw Error('Native frontend collection IO error: '+JSON.stringify(frontendErrors));
  }
  let folderReplacement;
  if(process.argv.includes('--folder-replacement')){
    folderReplacementCallbackSha256=createHash('sha256').update(await readFile(new URL('../tests/neo-compat/native/folder-replacement.mjs',import.meta.url))).digest('hex');
    const {runFolderReplacementUI}=await import('../tests/neo-compat/native/folder-replacement.mjs');
    folderReplacement=await runFolderReplacementUI({script,request,session,click,type,until,fixture,bookId});
    folderReplacement.callbackSha256=folderReplacementCallbackSha256;
    if((await script('return window.__leafloomErrors??[];')).length)throw Error('Native folder replacement frontend error');
  }
  let uiHostRecovery;
  if(process.argv.includes('--ui-host-recovery')){
    await click('.book[data-book-id="'+bookId+'"]');
    await until(()=>script('return !!document.querySelector(".chapter-body .ProseMirror")'),'recovery editor');
    const originalBytes=await readFile(join(fixture,bookId,'manuscript.json'));
    const baseline=(await invoke('host_request',{method:'listBooks',payload:{}})).value.map(book=>book.id);
    await type('.chapter-body .ProseMirror',' Unsaved recovery sentinel.');
    process.kill(hostPid,'SIGKILL');
    await until(()=>script('return !!document.querySelector(".host-recovery-banner button")'),'actual failure banner');
    if(!await script('return document.querySelector(".chapter-body")?.textContent.includes("Unsaved recovery sentinel.")'))throw Error('Host failure discarded unsaved UI text');
    await click('.host-recovery-banner button');
    await until(()=>script('return !document.querySelector(".host-recovery-banner")&&document.querySelector(".chapter-body")?.textContent.includes("Unsaved recovery sentinel.")'),'actual recovery action');
    const replacement=await invoke('host_request',{method:'diagnostics',payload:{}});
    const oldPid=hostPid;hostPid=replacement.value.pid;if(hostPid===oldPid)throw Error('UI recovery did not replace host');
    const books=(await invoke('host_request',{method:'listBooks',payload:{}})).value;
    const copies=books.filter(book=>!baseline.includes(book.id));
    if(copies.length!==1)throw Error('UI recovery did not create exactly one fresh local copy');
    const copyId=copies[0].id,copy=JSON.parse(await readFile(join(fixture,copyId,'manuscript.json'),'utf8'));
    if(!copy.chapters.some(chapter=>chapter.html.includes('Unsaved recovery sentinel.')))throw Error('Recovery local copy omitted unsaved prose');
    if(!originalBytes.equals(await readFile(join(fixture,bookId,'manuscript.json'))))throw Error('UI recovery modified original manuscript');
    await click('#back-to-shelf');await until(()=>script('return !!document.querySelector("#bookshelf-view")'),'recovery copy close');
    await click('.book[data-book-id="'+copyId+'"]');await until(()=>script('return document.querySelector(".chapter-body")?.textContent.includes("Unsaved recovery sentinel.")'),'recovery durable reopen');
    await click('#back-to-shelf');await until(()=>script('return !!document.querySelector("#bookshelf-view")'),'recovery copy release');
    uiHostRecovery={actualFailureBanner:true,actualRecoveryButton:true,unsavedTextRetained:true,freshLocalCopy:true,originalBytesUnchanged:true,durableCopyReopened:true};
  }
  let nativePerformance;
  if (process.argv.includes('--performance')) {
    const meta = (
      await invoke('host_request', {
        method: 'createBook',
        payload: { title: 'Native 100k fixture', author: 'Fixture' },
      })
    ).value;
    const opened = (
      await invoke('host_request', { method: 'openBook', payload: { bookId: meta.id } })
    ).value;
    const html = Array.from(
      { length: 4000 },
      (_, index) => '<p>' + 'word '.repeat(24) + 'passage' + index + '.</p>',
    ).join('');
    await invoke('host_request', {
      method: 'closeBook',
      payload: { bookId: meta.id, lease: opened.lease },
    });
    const source = Book.parse({ ...opened.book, chapters: [{ id: 'native-large', html }] });
    await writeFile(
      join(fixture, meta.id, 'manuscript.json'),
      JSON.stringify(source, null, 2) + '\n',
    );
    const library = (await invoke('host_request', { method: 'readLibrary', payload: {} })).value;
    library.shelves[0].bookIds.push(meta.id);
    await invoke('host_request', { method: 'writeLibrary', payload: { library } });
    await script('location.reload();return true');
    await until(
      () =>
        script(
          `return !!document.querySelector(${JSON.stringify('.book[data-book-id="' + meta.id + '"]')})`,
        ),
      '100k fixture shelf',
    );
    const openStarted = performance.now();
    await click('.book[data-book-id="' + meta.id + '"]');
    await until(
      () =>
        script(
          'return document.querySelector(".chapter-body")?.textContent.includes("passage3999.")',
        ),
      'native 100k visible',
    );
    const openMs = performance.now() - openStarted;
    const browserDiagnostics=()=>request('/session/'+session+'/execute/async',{script:'const done=arguments[arguments.length-1];if(typeof window.__leafloomTelemetryDiagnostics!=="function"){done(null);return;}window.__leafloomTelemetryDiagnostics().then(done).catch(()=>done(null));',args:[]});
    const telemetryBefore=await browserDiagnostics(),baselineSpans=new Set(telemetryBefore?.spans.map(span=>span.spanId)??[]);
    await script(
      'window.__leafloomInputPaint=[];window.__leafloomInputDOM=[];window.__leafloomInputCount=0;const element=document.querySelector(".chapter-body .ProseMirror");window.__leafloomMountedEditor=element;new MutationObserver(()=>{if(window.__leafloomInputStarted!=null){window.__leafloomInputDOM.push(performance.now()-window.__leafloomInputStarted);window.__leafloomInputStarted=null;}}).observe(element,{childList:true,characterData:true,subtree:true});element.addEventListener("beforeinput",()=>{window.__leafloomInputStarted=performance.now();},{capture:true});element.addEventListener("input",()=>{window.__leafloomInputCount++;const started=window.__leafloomInputStarted??performance.now();requestAnimationFrame(()=>window.__leafloomInputPaint.push(performance.now()-started));},{capture:true});return true',
    );
    const typingStarted = performance.now();
    const dispatchMs=[],typed=' measured native typing with forty characters.';
    for (const character of typed){const started=performance.now();await type('.chapter-body .ProseMirror', character);dispatchMs.push(performance.now()-started);}
    await until(
      () =>
        script(
          'return document.querySelector(".save-state")?.textContent==="Saved"&&document.querySelector(".chapter-body")?.textContent.includes("measured native typing with forty characters.")',
        ),
      'native 100k receipt',
    );
    const typingReceiptMs = performance.now() - typingStarted;
    const paints = await script('return window.__leafloomInputPaint.sort((a,b)=>a-b)');
    const p95InputPaintMs = paints.length
      ? paints[Math.min(paints.length - 1, Math.floor(paints.length * 0.95))]
      : null;
    const input=await script('return {events:window.__leafloomInputCount,dom:window.__leafloomInputDOM.sort((a,b)=>a-b),mounted:window.__leafloomMountedEditor===document.querySelector(".chapter-body .ProseMirror"),hidden:document.hidden}');
    if(!input.mounted||input.events<30)throw Error('Native editor remounted or fewer than thirty actual input events');
    dispatchMs.sort((a,b)=>a-b);
    const browserTelemetry=await browserDiagnostics(),costs=new Map();
    for(const span of browserTelemetry?.spans??[]){
      if(baselineSpans.has(span.spanId))continue;
      if(!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(span.name)||!Number.isFinite(span.durationMs)||JSON.stringify(span).includes('passage3999'))throw Error('Unsafe browser telemetry');
      const measurements=costs.get(span.name)??[];measurements.push(span.durationMs);costs.set(span.name,measurements);
    }
    const topEditorCosts=Array.from(costs,([name,measurements])=>{measurements.sort((a,b)=>a-b);const totalMs=measurements.reduce((a,b)=>a+b,0);return {name,count:measurements.length,totalMs,meanMs:totalMs/measurements.length,p95Ms:measurements[Math.min(measurements.length-1,Math.floor(measurements.length*.95))]};}).sort((a,b)=>b.totalMs-a.totalMs).slice(0,5);
    await click('#back-to-shelf');
    await until(
      () => script('return !!document.querySelector("#bookshelf-view")'),
      'native 100k close',
    );
    const savedBook = JSON.parse(await readFile(join(fixture, meta.id, 'manuscript.json'), 'utf8'));
    if (
      !savedBook.chapters.some(
        (chapter) =>
          chapter.html.includes('measured native typing with forty characters.') &&
          chapter.html.includes('passage0.') &&
          chapter.html.includes('passage3999.'),
      )
    )
      throw Error('Native100k receipt absent or original content changed on disk');
    const durable=(await invoke('host_request',{method:'openBook',payload:{bookId:meta.id}})).value;
    const receiptHashes={};
    for(const [name,file] of Object.entries({manuscript:'manuscript.json',reviews:'reviews.json',notes:'notes.html',outline:'outline.html'})){
      const digest=createHash('sha256').update(await readFile(join(fixture,meta.id,file))).digest('hex');
      if(durable.versions[name]!==digest)throw Error('Native durable receipt hash differs: '+name);
      receiptHashes[name]=digest;
    }
    await invoke('host_request',{method:'closeBook',payload:{bookId:meta.id,lease:durable.lease}});
    const telemetry=(await invoke('host_request',{method:'diagnostics',payload:{}})).value.telemetry;
    if(!telemetry.spans.some(span=>span.name==='documents.checkpoint')||JSON.stringify(telemetry).includes('passage3999')||JSON.stringify(telemetry).includes('measured native'))throw Error('Native telemetry missing checkpoint or contains prose');
    nativePerformance = {
      words: 100000,
      paragraphs: 4000,
      openMs,
      typingReceiptMs,
      inputEvents: input.events,
      keystrokes:typed.length,
      driverInputQualification:'official Tauri WebDriver contenteditable send-keys uses execCommand(insertText); physical keyboard timing is not proved',
      p95DispatchMs:dispatchMs[Math.min(dispatchMs.length-1,Math.floor(dispatchMs.length*.95))],
      p95InputDOMMs:input.dom.length?input.dom[Math.min(input.dom.length-1,Math.floor(input.dom.length*.95))]:null,
      mountedEditorRetained:input.mounted,
      paintSamples:paints.length,
      paintQualification:paints.length?'requestAnimationFrame measures next frame callback; compositor presentation is not measured':'hidden WKWebView did not deliver frame callbacks; paint latency is unproved',
      p95InputPaintMs,
      verifiedDisk: true,
      receiptHashes,
      telemetry:{checkpointSpan:true,metricExports:telemetry.metricExports,contentFree:true},
      browserTelemetry:browserTelemetry?{readOnlyDebugHook:true,topEditorCosts,inclusiveSpans:true,metricNames:browserTelemetry.metrics.map(metric=>metric.name)}:{readOnlyDebugHook:false},
    };
  }
  await click('.book[data-book-id="'+bookId+'"]');
  await until(()=>script('return !!document.querySelector("#editor-view")'),'native close fixture reopen');
  const guardedClose=await request('/session/'+session+'/execute/async',{script:'const done=arguments[arguments.length-1];window.__TAURI__.core.invoke("finish_close").then(()=>done({ok:true})).catch(e=>done({ok:false,code:String(e)}));',args:[]});
  if(guardedClose.ok||guardedClose.code!=='BUSY')throw Error('Native close bypassed live document sessions');
  await invoke('os_request',{method:'closeWindow',payload:{}});
  await until(async()=>{const value=await invoke('host_request',{method:'runtimeState',payload:{}});return value.ok&&value.value.openBooks===0;},'native close releases current writer');
  if(process.platform==='darwin'){const state=await invoke('os_request',{method:'getWindowState',payload:{}});if(state.visible||child.exitCode!==null)throw Error('Mac window close did not retain hidden application after durable close');}
  let hostRecovery;
  if(process.argv.includes('--host-recovery')) {
    const original=await invoke('host_request',{method:'openBook',payload:{bookId}});
    if(!original.ok||!original.value.lease)throw Error('Recovery fixture could not acquire original writer');
    await request('/session/'+session+'/execute/async',{script:'const done=arguments[arguments.length-1];window.__leafloomHostFailures=[];window.__TAURI__.event.listen("leafloom:host-failed",event=>window.__leafloomHostFailures.push(event.payload)).then(()=>done(true)).catch(e=>done(null,String(e)));',args:[]});
    const oldPid=hostPid;
    process.kill(oldPid,'SIGKILL');
    await until(()=>script('return window.__leafloomHostFailures.length===1'),'host failure event');
    const failure=await script('return window.__leafloomHostFailures[0]');
    if(failure.code!=='HOST_UNAVAILABLE'||failure.canRestart!==true||Object.keys(failure).length!==2)throw Error('Host failure event leaked details or omitted recovery capability');
    const unavailable=await request('/session/'+session+'/execute/async',{script:'const done=arguments[arguments.length-1];window.__TAURI__.core.invoke("host_request",{method:"getSettings",payload:{}}).then(v=>done({ok:true,value:v})).catch(e=>done({ok:false,code:String(e)}));',args:[]});
    if(unavailable.ok||unavailable.code!=='HOST_UNAVAILABLE')throw Error('Dead host did not return stable unavailable code');
    const restarted=await invoke('os_request',{method:'restartHost',payload:{}});
    if(!restarted.restarted||!restarted.rebindRequired)throw Error('Host restart omitted rebind requirement');
    const replacement=await invoke('host_request',{method:'diagnostics',payload:{}});
    if(!replacement.ok||replacement.value.pid===oldPid)throw Error('Host process was not replaced');
    hostPid=replacement.value.pid;
    const reopened=await invoke('host_request',{method:'openBook',payload:{bookId}});
    if(!reopened.ok||!reopened.value.lease||reopened.value.lease===original.value.lease)throw Error('Host restart reused an old writer lease');
    const before=await readFile(join(fixture,bookId,'manuscript.json'));
    const stale=await invoke('host_request',{method:'checkpoint',payload:{bookId,lease:original.value.lease,expected:original.value.versions,checkpoint:{book:original.value.book,reviews:original.value.reviews,notes:original.value.notes,outline:original.value.outline}}});
    if(stale.ok||stale.code!=='UNAUTHORIZED')throw Error('Restart accepted an old checkpoint lease: '+JSON.stringify(stale));
    if(!before.equals(await readFile(join(fixture,bookId,'manuscript.json'))))throw Error('Old lease changed durable manuscript');
    const staleClose=await invoke('host_request',{method:'closeBook',payload:{bookId,lease:original.value.lease}});
    if(staleClose.ok||staleClose.code!=='UNAUTHORIZED')throw Error('Old close lease released a new writer');
    const live=await invoke('host_request',{method:'runtimeState',payload:{}});if(!live.ok||live.value.openBooks!==1)throw Error('Old close lease removed fresh session');
    await invoke('host_request',{method:'closeBook',payload:{bookId,lease:reopened.value.lease}});
    const absentClose=await invoke('host_request',{method:'closeBook',payload:{bookId,lease:original.value.lease}});if(!absentClose.ok||absentClose.value!==true)throw Error('Absent stale session close was not idempotent');
    const healthy=await request('/session/'+session+'/execute/async',{script:'const done=arguments[arguments.length-1];window.__TAURI__.core.invoke("os_request",{method:"restartHost",payload:{}}).then(v=>done({ok:true,value:v})).catch(e=>done({ok:false,code:String(e)}));',args:[]});
    if(healthy.ok||healthy.code!=='BUSY')throw Error('Healthy host restarted unexpectedly');
    let reaped=false;try{process.kill(oldPid,0);}catch{reaped=true;}if(!reaped)throw Error('Dead host child was not reaped');
    hostRecovery={unexpectedExitEvent:true,sanitizedEvent:true,processReplaced:true,freshWriterLease:true,oldLeaseDenied:true,staleCloseProtectsFreshSession:true,absentCloseIdempotent:true,durableBytesUnchanged:true,healthyRestartDenied:true,deadChildReaped:true};
  }
  const signatures = await script(
    'return {native:!!window.__TAURI__,title:document.title,driver:!!window.__wdio__}',
  );
  buildSha256After = (await evidenceMetadata('tauri-native-hidden')).buildSha256;
  if (buildSha256Before !== buildSha256After)
    throw Error('Native evidence source changed during execution');
  const result = {
    ...evidenceIdentity,
    status: 'passed',
    buildSha256: buildSha256Before,
    buildSha256Before,
    buildSha256After,
    ...(coverEvidence?{coverArt:coverEvidence}:{}),
    binary,
    artifactBinding,
    menuFilter,
    ...(coverUI?{coverUI}:{}),
    ...(documentIO?{documentIO}:{}),
    ...(collectionIO?{collectionIO}:{}),
    ...(folderReplacement?{folderReplacement}:{}),
    ...(uiHostRecovery?{uiHostRecovery}:{}),
    fixtureKind: 'marked disposable private library',
    hiddenWindow: true,
    singleInstance: true,
    installedFontFamilies:installedFonts.length,
    guardedNativeClose:true,
    macHiddenWindowClose:process.platform==='darwin',
    uiOnboarding: true,
    uiCreateBook: true,
    nativeTyping: true,
    autosaveDisk: true,
    closeReopen: true,
    hunspell: true,
    pathGrants: true,
    arbitraryFilesystemDenied: true,
    ...(process.argv.includes('--runtime-env')?{ambientNodeEnvironmentIgnored:true}:{}),
    signatures,
    nativePerformance,
    hostRecovery,
  };
  if (process.argv[3])
    await writeFile(resolve(process.argv[3]), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  buildSha256After ??= (await evidenceMetadata('tauri-native-hidden')).buildSha256;
  if (process.argv[3] && !process.argv[3].startsWith('--')) {
    const state = session
      ? await script(
          'return {url:location.href,origin:performance.timeOrigin,title:document.title,tileCount:document.querySelectorAll(".book:not(.new-book)").length,body:document.body?.innerText.slice(0,4000),errors:window.__leafloomErrors}',
        ).catch(() => null)
      : null;
    await writeFile(
      resolve(process.argv[3] + '.failure.json'),
      JSON.stringify(
        {
          ...evidenceIdentity,
          status: buildSha256Before === buildSha256After ? 'failed' : 'stale',
          buildSha256: buildSha256Before,
          buildSha256Before,
          buildSha256After,
          binary,
          artifactBinding,
          documentIOCallbackSha256,
          documentIOSharedSha256,
          documentIOEdgeHashes,
          collectionIOCallbackSha256,
          folderReplacementCallbackSha256,
          error: error.message,
          stderr,
          state,
          fixtureKind: 'synthetic marked disposable',
          hiddenWindow: true,
        },
        null,
        2,
      ) + '\n',
    );
    if (session) {
      const screenshot = await request('/session/' + session + '/screenshot').catch(() => null);
      if (screenshot)
        await writeFile(
          resolve(process.argv[3] + '.failure.png'),
          Buffer.from(screenshot, 'base64'),
        );
    }
  }
  process.stderr.write(
    'Native failure: ' +
      stderr +
      '\nApp exit=' +
      child.exitCode +
      ' signal=' +
      child.signalCode +
      '\n',
  );
  throw error;
} finally {
  imageRelease();
  if(coverServer) {coverServer.closeAllConnections();await new Promise(resolve=>coverServer.close(resolve));}
  if(session&&child.exitCode===null){await script('window.__TAURI__.core.invoke("os_request",{method:"quitApp",payload:{}});return true;').catch(()=>{});await Promise.race([once(child,'exit'),pause(5000)]);}
  if (session) await request('/session/' + session, undefined, 'DELETE').catch(() => {});
  if (child.exitCode === null) {
    try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}
    await Promise.race([once(child, 'exit'), pause(5000)]);
    if(child.exitCode===null){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
  }
  if (hostPid) {
    let gone = false;
    for (let tries = 0; tries < 100; tries++) {
      try {
        process.kill(hostPid, 0);
      } catch (error) {
        if (error.code === 'ESRCH') {
          gone = true;
          break;
        }
      }
      await pause(50);
    }
    if (!gone) throw Error('Owned bundled host remained running: ' + hostPid);
  }
  await rm(fixture, { recursive: true, force: true });
}
