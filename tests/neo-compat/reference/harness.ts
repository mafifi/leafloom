import {_electron,type ElectronApplication,type Page} from '@playwright/test';
import {mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {readFileSync,existsSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync,spawnSync} from 'node:child_process';
const directory=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.join(directory,'package.json'));
const ledger=path.join(directory,'node_modules/.neo-parity-hosts');
function safetyStop(record:unknown){mkdirSync(ledger,{recursive:true});writeFileSync(path.join(ledger,'crash-stop.json'),JSON.stringify(record,null,2));}
export async function createReferenceDirectory(){const fixture=await mkdtemp(path.join(tmpdir(),'leafloom-neo-reference-'));await writeFile(path.join(fixture,'.neo-parity-fixture'),'isolated-neo-parity-v1');return realpath(fixture);}
export function referenceExecutable(){
 if(process.env.LEAFLOOM_NATIVE_REFERENCE!=='1')throw Error('Native reference is opt-in: LEAFLOOM_NATIVE_REFERENCE=1');
 if(existsSync(path.join(ledger,'crash-stop.json')))throw Error('Native reference safety stop: inspect crash evidence before another launch');
 if(process.platform!=='darwin')return require('electron-reference') as string;
 const folder=path.join(ledger,'electron-reference'),receipt=JSON.parse(readFileSync(path.join(folder,'receipt.json'),'utf8'));
 if(receipt.identifier!=='org.neo.editor-parity'||receipt.version!==require('electron-reference/package.json').version)throw Error('Stable reference host receipt does not match pinned runtime');
 const bundle=path.join(folder,'NEO Parity.app');
 execFileSync('codesign',['--verify','--deep','--strict',bundle],{timeout:15000});
 const signature=spawnSync('codesign',['-d','-r-','--verbose=2',bundle],{encoding:'utf8'});
 if(signature.status!==0||!signature.stderr.includes('Authority=Apple ')||signature.stderr.includes('Signature=adhoc')||!signature.stdout.split('\n').includes(String(receipt.requirement).trim()))throw Error('Stable certificate identity is unverified');
 const identifier=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(bundle,'Contents/Info.plist')],{encoding:'utf8'}).trim();
 if(identifier!==receipt.identifier)throw Error('Stable reference app identifier mismatch');
 return path.join(bundle,'Contents/MacOS/Electron');
}
export async function launchReference(fixture:string):Promise<ElectronApplication>{
 const executablePath=referenceExecutable();
 const app=await _electron.launch({executablePath,args:[path.join(directory,'launch.cjs')],env:{...process.env,NEO_PARITY_DATA_DIR:fixture,NEO_PARITY_ENGINE:''}}).catch(error=>{safetyStop({kind:'launch-failure',time:new Date().toISOString(),error:String(error)});throw error;});
 mkdirSync(ledger,{recursive:true});const processHandle=app.process();appendFileSync(path.join(ledger,'process-ledger.jsonl'),JSON.stringify({event:'launch',pid:processHandle.pid,time:new Date().toISOString(),fixture})+'\n');
 processHandle.once('error',error=>safetyStop({kind:'process-error',error:String(error)}));
 processHandle.once('exit',(code,signal)=>{const record={event:'exit',pid:processHandle.pid,time:new Date().toISOString(),code,signal};appendFileSync(path.join(ledger,'process-ledger.jsonl'),JSON.stringify(record)+'\n');if(['SIGSEGV','SIGABRT','SIGBUS','SIGILL','SIGTRAP'].includes(signal??'')||[139,134,138,132,133].includes(code??-1))safetyStop(record);});
 if(process.env.LEAFLOOM_REFERENCE_HIDDEN==='1'){const windows=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map((win:{isVisible():boolean;isFocused():boolean})=>({visible:win.isVisible(),focused:win.isFocused()})));if(windows.some((win:{visible:boolean;focused:boolean})=>win.visible||win.focused)){await app.close();throw Error('Hidden original reference acquired a native window');}}
 if(await app.evaluate(()=>process.versions.electron)!==require('electron-reference/package.json').version){await app.close();throw Error('Actual reference runtime differs from pinned dependency');}
 return app;
}

const applications=new WeakMap<Page,ElectronApplication>();
export function bindReferenceApplication(page:Page,app:ElectronApplication){applications.set(page,app);}
/** Native clipboard belongs only to the opt-in original reference adapter. */
export async function writeReferenceClipboard(page:Page,text:string,html?:string){if(process.env.LEAFLOOM_REFERENCE_HIDDEN==='1')throw Error('Hidden source reference does not authorize global clipboard writes');const app=applications.get(page);if(!app)throw Error('Missing original reference application');await app.evaluate(({clipboard},{text,html})=>clipboard.write({text,...(html?{html}:{})}),{text,html});}
export async function clickReferenceMenu(page:Page,labels:string[]){const app=applications.get(page);if(!app)throw Error('Missing original reference application');await app.evaluate(({Menu},labels)=>{let items=Menu.getApplicationMenu()?.items;let item;for(const label of labels){item=items?.find((candidate:{label:string})=>candidate.label.replace(/\t.*$/,'')===label);if(!item)throw Error('Missing original native menu '+label);items=item.submenu?.items;}if(!item?.enabled)throw Error('Disabled original native menu');item.click();},labels);}
export async function referenceVersion(page:Page){const app=applications.get(page);if(!app)throw Error('Missing original reference application');return app.evaluate(({app})=>app.getVersion());}
