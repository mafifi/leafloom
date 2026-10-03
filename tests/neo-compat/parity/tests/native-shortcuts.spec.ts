import {referenceExecutable} from '../reference/harness';
import {test,expect,type ElectronApplication,type Page} from '@playwright/test';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {openEditingFixture,selectText,menu,type Engine} from './editing-helpers';

/** The enabled suite cooperates with the root agent's native CUA driver. */
const enabled=process.env.NEO_NATIVE_OS_DRIVER==='1';
const engines:Engine[]=process.env.NEO_NATIVE_OS_ENGINE?[process.env.NEO_NATIVE_OS_ENGINE as Engine]:['original','prosemirror'];
const requestPath=path.resolve(process.env.NEO_NATIVE_OS_REQUEST_PATH??'/tmp/neo-parity-os-shortcut.json');
const ackPath=requestPath+'.ack.json';
type Identity={engine:Engine;nonce:string;windowTitle:string;mainPid:number;rendererPid:number;appPath:string};
type Ack={id:string;engine:Engine;nonce:string;observedTitle:string;observedPid:number;action:string;keys:string[];driver:string;timestamp:string;log:unknown[]};
async function identify(app:ElectronApplication,engine:Engine):Promise<Identity>{
 const nonce=randomUUID();const pids=await app.evaluate(({BrowserWindow})=>({mainPid:process.pid,rendererPid:BrowserWindow.getAllWindows()[0].webContents.getOSProcessId()}));
 const windowTitle=`NEO OS ${engine} ${pids.mainPid} ${nonce}`;
 await app.evaluate(({app,BrowserWindow},title)=>{const win=BrowserWindow.getAllWindows()[0];win.setTitle(title);app.focus({steal:true});win.focus();win.webContents.focus();},windowTitle);
 await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle())).toBe(windowTitle);
 const executable=referenceExecutable(engine==='prosemirror'?engine:undefined);const appPath=executable.slice(0,executable.indexOf('.app')+4);return{engine,nonce,windowTitle,...pids,appPath};
}
async function osKeys(identity:Identity,action:string,keys:string[]){
 const id=randomUUID(),deadline=Date.now()+180_000;
 await unlink(ackPath).catch(error=>{if(error.code!=='ENOENT')throw error;});
 const request={id,action,keys,...identity,observedTitle:identity.windowTitle,observedPid:identity.mainPid,deadline,requestPath,ackPath,testTitle:test.info().title,expectedDriver:'cua-native-app'};
 const temporary=requestPath+'.writing';await writeFile(temporary,JSON.stringify(request,null,2)+'\n');await rename(temporary,requestPath);
 process.stdout.write('NEO_NATIVE_OS_REQUEST '+JSON.stringify(request)+'\n');
 let ack:Ack|undefined;
 await expect.poll(async()=>{try{const value=JSON.parse(await readFile(ackPath,'utf8')) as Ack;if(value.id===id)ack=value;return ack?.id;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}},{timeout:180_000,message:`Native OS action ${action} was not acknowledged before its deadline`}).toBe(id);
 expect(Date.now()).toBeLessThanOrEqual(deadline+1000);
 expect(ack).toMatchObject({id,action,keys,engine:identity.engine,nonce:identity.nonce,observedTitle:identity.windowTitle,observedPid:identity.mainPid,driver:'cua-native-app'});
 expect(Number.isFinite(Date.parse(ack!.timestamp))).toBe(true);expect(ack!.log.length).toBeGreaterThan(0);
 await test.info().attach('native-os-'+action,{body:JSON.stringify({request,ack},null,2),contentType:'application/json'});
}
async function owned(engine:Engine,run:(app:ElectronApplication,page:Page,identity:Identity)=>Promise<void>){
 const ctx=await openEditingFixture(engine,{chapters:['<p>helo native author prose.</p>']});try{await selectText(ctx.page,0,0,4);await run(ctx.app,ctx.page,await identify(ctx.app,engine));}finally{await ctx.close();}
}
for(const engine of engines)test.describe(engine,()=>{
 test.skip(process.platform!=='darwin','Cooperative native OS shortcut proof currently targets macOS.');
 test.skip(!enabled,'Requires an explicitly enabled root-coordinated native CUA driver; skipped runs provide no OS shortcut evidence.');
 test('[NEO-170-C] OS Cmd semicolon dispatches real spell pass once and off clears marks',async()=>owned(engine,async(_app,page,identity)=>{
  expect(await page.evaluate(()=>Array.from(CSS.highlights.get('neo-spell')??[]).length)).toBe(0);
  await osKeys(identity,'spell-on',['CMD',';']);await expect.poll(()=>page.evaluate(()=>Array.from(CSS.highlights.get('neo-spell')??[]).map(r=>r.toString()))).toEqual(['helo']);
  await osKeys(identity,'spell-off',['CMD',';']);await expect.poll(()=>page.evaluate(()=>Array.from(CSS.highlights.get('neo-spell')??[]).length)).toBe(0);await expect(page.locator('.chapter-body')).toHaveText('helo native author prose.');
 }));
 test('[NEO-216-C][NEO-214-B] OS Cmd slash opens help and Escape returns actual writing caret',async()=>owned(engine,async(_app,page,identity)=>{
  await osKeys(identity,'help-open',['CMD','/']);await expect(page.locator('#keyboard-shortcuts')).toBeVisible();await expect(page.locator('#keyboard-shortcuts')).toHaveCount(1);
  await osKeys(identity,'help-close',['ESC']);await expect(page.locator('#keyboard-shortcuts')).toBeHidden();await expect(page.locator('.chapter-body')).toBeFocused();await page.keyboard.type('X');await expect(page.locator('.chapter-body')).toHaveText('heloX native author prose.');
 }));
 test('[NEO-205-C] OS Cmd zero dispatch resets text17/page1 preserving interface/font',async()=>owned(engine,async(app,page,identity)=>{
  // Setup calls the genuine NEO command through its existing native menu.
  await menu(app,['Format','Body Font','Jost']);await menu(app,['View','Interface Size','150%']);await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim())).toBe('1.5');
  await app.evaluate(({Menu,BrowserWindow})=>{const format=Menu.getApplicationMenu()!.items.find(i=>i.label==='Format')!;const item=format.submenu!.items.find(i=>i.label==='Larger Text')!;item.click(item,BrowserWindow.getAllWindows()[0],{} as Electron.KeyboardEvent);});await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--editor-size').trim())).toBe('18px');await page.locator('#zoom-in').click();await expect(page.locator('#zoom-level')).toHaveText('110%');await selectText(page,0,0,4);
  await osKeys(identity,'reset-typography',['CMD','0']);await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--editor-size').trim())).toBe('17px');await expect(page.locator('#zoom-level')).toHaveText('100%');expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim())).toBe('1.5');expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--body-font').trim())).toContain('Jost');await expect(page.locator('.chapter-body')).toHaveText('helo native author prose.');
 }));
 test('[NEO-212-B][NEO-214-B] OS Shift Cmd F and Cmd Enter toggle real fullscreen and Escape exits before shelf',async()=>owned(engine,async(app,page,identity)=>{
  await osKeys(identity,'fullscreen-menu',['CMD','SHIFT','F']);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);await expect(page.locator('body')).toHaveClass(/full-screen/);
  await osKeys(identity,'fullscreen-escape',['ESC']);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);await expect(page.locator('#editor-view')).toBeVisible();
  // Characterize the source shortcut collision; candidate must consume the
  // fullscreen command before either paragraph or scene-break handlers run.
  await osKeys(identity,'fullscreen-renderer',['CMD','ENTER']);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);await expect(page.locator('.chapter-body p')).toHaveCount(engine==='original'?2:1);
  await osKeys(identity,'fullscreen-renderer-off',['CMD','ENTER']);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);await expect(page.locator('.chapter-body p')).toHaveCount(engine==='original'?3:1);await expect(page.locator('.chapter-body .scene-break')).toHaveCount(engine==='original'?1:0);await expect(page.locator('.chapter-body')).toHaveText(engine==='original'?'helo*** native author prose.':'helo native author prose.');
 }));
 test('[NEO-267-B] OS Cmd E opens real email-address setup and Escape cancels without sending',async()=>owned(engine,async(_app,page,identity)=>{
  await osKeys(identity,'email-setup',['CMD','E']);await expect(page.locator('.modal-backdrop:visible h2')).toHaveText('Email drafts to');await expect(page.locator('.modal-backdrop:visible input')).toBeFocused();
  await osKeys(identity,'email-cancel',['ESC']);await expect(page.locator('.modal-backdrop:visible')).toHaveCount(0);await expect(page.locator('.chapter-body')).toHaveText('helo native author prose.');
 }));
});
