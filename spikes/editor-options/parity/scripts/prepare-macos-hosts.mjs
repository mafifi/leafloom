import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.platform!=='darwin')throw Error('macOS hosts can only be prepared on macOS');
const identity=process.env.NEO_PARITY_SIGN_IDENTITY;
if(!identity)throw Error('Set NEO_PARITY_SIGN_IDENTITY to an existing certificate identity; ad-hoc signing is not accepted.');
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});
const identifier='org.neo.editor-parity';
const output=path.join(root,'node_modules/.neo-parity-hosts');mkdirSync(output,{recursive:true});
for(const runtime of ['electron-reference','electron']){
 const upstream=require(runtime);const version=require(runtime+'/package.json').version;
 const destination=path.join(output,runtime,'NEO Parity.app');const receipt=path.join(output,runtime,'receipt.json');
 const upstreamHash=createHash('sha256').update(readFileSync(upstream)).digest('hex');
 if(existsSync(receipt)){
  const prior=JSON.parse(readFileSync(receipt,'utf8'));
  if(prior.version===version&&prior.upstreamHash===upstreamHash&&prior.identity===identity&&prior.identifier===identifier&&prior.requirement?.startsWith('designated => ')){run('codesign',['--verify','--deep','--strict',destination]);console.log(`${runtime}: reuse verified ${destination}`);continue;}
 }
 rmSync(path.dirname(destination),{recursive:true,force:true});mkdirSync(path.dirname(destination),{recursive:true});
 cpSync(path.resolve(upstream,'../../..'),destination,{recursive:true,verbatimSymlinks:true});
 const plist=path.join(destination,'Contents/Info.plist');
 for(const [key,value] of Object.entries({CFBundleIdentifier:identifier,CFBundleName:'NEO Parity',CFBundleDisplayName:'NEO Parity'}))run('/usr/libexec/PlistBuddy',['-c',`Set :${key} ${value}`,plist]);
 // Dedicated development bundle only. Preserve upstream runtime entitlements and
 // sign nested frameworks/helpers under the same certificate as the host.
 // No notarisation or hardened-runtime change is part of a local test host.
 run('codesign',['--force','--deep','--preserve-metadata=entitlements','--sign',identity,destination]);
 run('codesign',['--verify','--deep','--strict',destination]);
 const inspection=spawnSync('codesign',['-d','-r-','--verbose=2',destination],{encoding:'utf8'});
 if(inspection.status!==0||!inspection.stderr.includes('Authority=Apple ')||inspection.stderr.includes('Signature=adhoc'))throw Error('Certificate signing verification failed');
 const requirement=inspection.stdout.split('\n').find(line=>line.startsWith('designated => '));
 const shown=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',plist]).trim();
 if(shown!==identifier)throw Error('Unexpected signed bundle identifier');
 writeFileSync(receipt,JSON.stringify({runtime,version,identifier,identity,upstreamHash,executable:path.join(destination,'Contents/MacOS/Electron'),requirement},null,2));
 console.log(`${runtime}: signed and verified ${destination}`);
}
