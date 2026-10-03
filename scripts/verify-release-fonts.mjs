import {readFile,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export async function verifyReleaseFonts(directory){
 let files=0;
 for(const name of ['provenance.json','provenance-cjk.json']){
  const manifest=JSON.parse(await readFile(join(directory,name),'utf8'));
  if(!['https://github.com/notofonts/noto-fonts','https://github.com/notofonts/noto-cjk'].includes(manifest.repository)||!/^[0-9a-f]{40}$/.test(manifest.revision)||manifest.license!=='SIL Open Font License 1.1')throw Error('Font provenance invalid');
  for(const [file,expected]of Object.entries(manifest.files)){
   if(!/^[A-Za-z0-9._-]+$/.test(file)||!/^[0-9a-f]{64}$/.test(expected))throw Error('Font resource reference invalid');
   const path=join(directory,file),metadata=await lstat(path);
   if(!metadata.isFile()||metadata.isSymbolicLink())throw Error('Font resource invalid');
   const bytes=await readFile(path);
   if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Font resource hash mismatch: '+file);
   if(file.startsWith('LICENSE')&&!bytes.toString('utf8').includes('SIL OPEN FONT LICENSE Version 1.1'))throw Error('Font license missing');
   files++;
  }
 }
 return{manifests:2,files};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyReleaseFonts(process.argv[2]??join(dirname(dirname(fileURLToPath(import.meta.url))),'apps/desktop/host/fonts'))));
