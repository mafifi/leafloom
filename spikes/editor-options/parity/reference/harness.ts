import { _electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync,existsSync,mkdirSync,appendFileSync,writeFileSync } from 'node:fs';
import { execFileSync, spawnSync,spawn,type ChildProcess } from 'node:child_process';
const require = createRequire(import.meta.url);
export async function createReferenceDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'neo-parity-reference-'));
  await writeFile(path.join(directory, '.neo-parity-fixture'), 'isolated-neo-parity-v1');
  return realpath(directory);
}
export function referenceExecutable(engine?: 'prosemirror'): string {
  const runtime=engine==='prosemirror'?'electron':'electron-reference';
  if(existsSync(path.resolve('node_modules/.neo-parity-hosts/crash-stop.json')))throw Error('Native crash safety stop: inspect crash-stop.json and crash reports before another launch');
  let executablePath=require(runtime) as string;
  if(process.platform==='darwin'){
    const hostRoot=path.resolve('node_modules/.neo-parity-hosts',runtime);
    const receipt=JSON.parse(readFileSync(path.join(hostRoot,'receipt.json'),'utf8'));
    if(receipt.identifier!=='org.neo.editor-parity'||receipt.version!==require(runtime+'/package.json').version)throw Error('Prepare the stable signed NEO parity hosts before launching');
    const bundle=path.join(hostRoot,'NEO Parity.app');
    execFileSync('codesign',['--verify','--deep','--strict',bundle],{stdio:'pipe',timeout:15000});
    const signing=spawnSync('codesign',['-d','-r-','--verbose=2',bundle],{encoding:'utf8'});
    if(signing.status!==0||!signing.stderr.includes('Authority=Apple ')||signing.stderr.includes('Signature=adhoc')||!signing.stdout.split('\n').includes(String(receipt.requirement).trim()))throw Error('Stable certificate signing requirement not verified');
    const signature=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(bundle,'Contents/Info.plist')],{encoding:'utf8'}).trim();
    if(signature!==receipt.identifier)throw Error('Unexpected NEO parity bundle identity');
    executablePath=path.join(bundle,'Contents/MacOS/Electron');
  }
  return executablePath;
}
export async function launchReference(directory: string, engine?: 'prosemirror'): Promise<ElectronApplication> {
  const runtime=engine==='prosemirror'?'electron':'electron-reference';
  const app=await _electron.launch({ executablePath:referenceExecutable(engine),
    args: [path.resolve('parity/reference/launch.cjs')],
    env: { ...process.env, NEO_PARITY_DATA_DIR: directory, NEO_PARITY_ENGINE: engine ?? '' },
  }).catch(error=>{const stop=path.resolve('node_modules/.neo-parity-hosts/crash-stop.json');mkdirSync(path.dirname(stop),{recursive:true});writeFileSync(stop,JSON.stringify({kind:'launch-failure',time:new Date().toISOString(),engine:engine??'original',runtime,error:String(error)},null,2));throw error;});
  trackReferenceProcess(app.process(),directory,engine);
  const version=await app.evaluate(()=>process.versions.electron);
  if(version!==require(runtime+'/package.json').version){await app.close();throw new Error(`Unexpected Electron runtime ${version}`);}
  return app;
}
export async function removeReferenceDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}

export function trackReferenceProcess(processHandle:ChildProcess,directory:string,engine?:'prosemirror'):void{
 const runtime=engine==='prosemirror'?'electron':'electron-reference';
  const ledger=path.resolve('node_modules/.neo-parity-hosts');mkdirSync(ledger,{recursive:true});

  appendFileSync(path.join(ledger,'process-ledger.jsonl'),JSON.stringify({event:'launch',time:new Date().toISOString(),pid:processHandle.pid,engine:engine??'original',runtime,directory})+'\n');
  processHandle.once('error',error=>writeFileSync(path.join(ledger,'crash-stop.json'),JSON.stringify({kind:'launch-error',time:new Date().toISOString(),engine:engine??'original',runtime,error:String(error)},null,2)));
  processHandle.once('exit',(code,signal)=>{
    const record={event:'exit',time:new Date().toISOString(),pid:processHandle.pid,engine:engine??'original',runtime,code,signal};
    appendFileSync(path.join(ledger,'process-ledger.jsonl'),JSON.stringify(record)+'\n');
    if(['SIGSEGV','SIGABRT','SIGBUS','SIGILL','SIGTRAP'].includes(signal??'')||[139,134,138,132,133].includes(code??-1))writeFileSync(path.join(ledger,'crash-stop.json'),JSON.stringify(record,null,2));
  });
}
export function spawnReference(directory:string,engine?:'prosemirror'):ChildProcess{
 const child=spawn(referenceExecutable(engine),[path.resolve('parity/reference/launch.cjs')],{env:{...process.env,NEO_PARITY_DATA_DIR:directory,NEO_PARITY_ENGINE:engine??''},stdio:'ignore'});
 trackReferenceProcess(child,directory,engine);return child;
}
