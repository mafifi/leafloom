import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const collection=path.join(root,'docs/migration/bundled-licenses');
const digest=async(file)=>createHash('sha256').update(await readFile(file)).digest('hex');
const failures=[];
async function same(a,b,label){try{if(await digest(a)!==await digest(b))failures.push(label+' bytes differ');}catch(error){failures.push(label+': '+error.message);}}
for(const [family,files] of Object.entries({hunspell:['MPL-1.1.txt'],'dictionary-ro':['MPL-1.1.txt','upstream-license.txt'],'dictionary-pt':['MPL-2.0.txt','upstream-license.txt']})){
 for(const file of files)await same(path.join(collection,family,file),path.join(root,'tests/reference/neo/licenses',family,file),family+'/'+file+' upstream legal text');
 const notice=await readFile(path.join(collection,family,'NOTICE.txt'),'utf8');if(/app\.asar|NEO\.app/.test(notice))failures.push(family+' contains an incorrect Electron distribution path');
 if(!notice.includes('Leafloom'))failures.push(family+' missing distributing app name');
}
const resources=process.env.LEAFLOOM_BUNDLE_RESOURCES;
for(const [name,version] of Object.entries({'@farscrl/hunspell-wasm':'1.0.1','dictionary-ro':'3.0.0','dictionary-pt':'4.0.0'})){
 const manifest=resources?path.join(resources,'host/node_modules',name,'package.json'):path.join(root,'apps/desktop/host/node_modules',name,'package.json');
 const actual=JSON.parse(await readFile(manifest,'utf8'));if(actual.version!==version)failures.push(name+' version '+actual.version+' requires reviewed updated legal/source notices');
 if(resources){const directory=path.dirname(manifest);for(const file of name.startsWith('dictionary-')?['index.aff','index.dic','license']:['dist/lib/hunspell.mjs','LICENSE'])try{await stat(path.join(directory,file));}catch{failures.push(name+' missing distributed '+file);}}
}
if(resources){
 for(const family of ['hunspell','dictionary-ro','dictionary-pt'])for(const file of ['NOTICE.txt',...(family==='hunspell'?['MPL-1.1.txt']:['upstream-license.txt',family==='dictionary-ro'?'MPL-1.1.txt':'MPL-2.0.txt'])])await same(path.join(resources,'host/licenses',family,file),path.join(collection,family,file),'Bundle notice '+family+'/'+file);
 for(const file of ['LICENSE','LICENSE.neo','NOTICE'])await same(path.join(resources,'host/licenses',file),path.join(root,file),'Bundle root notice '+file);
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Bundled-license material verified'+(resources?' against actual resources.':' against installed source packages; run with LEAFLOOM_BUNDLE_RESOURCES before distribution.'));
