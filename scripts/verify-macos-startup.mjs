import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const binary=resolve(process.argv[2]??'apps/desktop/src-tauri/target/debug/leafloom-desktop');
const cases=[];
for(const kind of ['corrupt-profile','symlink-profile','symlink-library-lock']){
 const root=await mkdtemp(join(tmpdir(),'leafloom-startup-fixture-'));
 let child;
 try{
  await writeFile(join(root,'.leafloom-fixture'),'');await mkdir(join(root,'.profile'));
  const sentinel=Buffer.from('private fixture bytes');const target=join(root,'sentinel');await writeFile(target,sentinel);
  if(kind==='corrupt-profile')await writeFile(join(root,'.profile/host-settings.json'),'{invalid');
  if(kind==='symlink-profile')await symlink(target,join(root,'.profile/host-settings.json'));
  if(kind==='symlink-library-lock')await symlink(target,join(root,'.leafloom-host.lock'));
  child=spawn(binary,[],{detached:true,env:{...process.env,LEAFLOOM_FIXTURE_ROOT:root,LEAFLOOM_HIDDEN:'1'},stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',data=>stderr+=data);
  const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup did not fail promptly')),15000);child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});child.once('error',reject);});
  const expected=kind==='symlink-library-lock'?'LIBRARY_UNAVAILABLE':'INVALID_PROFILE';
  if(exit.code!==1||!stderr.includes('Leafloom startup failed: '+expected))throw Error('Unexpected startup result: '+JSON.stringify({exit,stderr}));
  if(!sentinel.equals(await readFile(target)))throw Error('Startup changed protected fixture bytes');
  cases.push({kind,code:expected,exitCode:exit.code,protectedBytesUnchanged:true,hidden:true});
 }finally{
  if(child?.exitCode===null){try{process.kill(-child.pid,'SIGKILL');}catch{}}
  await rm(root,{recursive:true,force:true});
 }
}
const receipt={status:'passed',binary,binarySha256:createHash('sha256').update(await readFile(binary)).digest('hex'),fixtureKind:'marked disposable private profiles',cases};
if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
