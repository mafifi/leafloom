import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,readFile,writeFile,unlink,symlink,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyReleaseFonts} from './verify-release-fonts.mjs';
const source=fileURLToPath(new URL('../apps/desktop/host/fonts/',import.meta.url));
test('bundled export fonts retain exact pinned bytes and complete licenses',async()=>{
 const root=await mkdtemp(join(tmpdir(),'leafloom-font-provenance-'));
 try{
  for(const name of ['provenance.json','provenance-cjk.json']){
   const manifest=JSON.parse(await readFile(join(source,name),'utf8'));await copyFile(join(source,name),join(root,name));
   for(const file of Object.keys(manifest.files))await copyFile(join(source,file),join(root,file),constants.COPYFILE_FICLONE);
  }
  assert.deepEqual(await verifyReleaseFonts(root),{manifests:2,files:9});
  const license=join(root,'LICENSE.NotoSerifCJK');await writeFile(license,'incomplete license');
  await assert.rejects(verifyReleaseFonts(root),/Font resource hash mismatch/);
  await copyFile(join(source,'LICENSE.NotoSerifCJK'),license);
  const font=join(root,'NotoSerifCJKjp-Regular.otf');await unlink(font);await symlink(join(source,'NotoSerifCJKjp-Regular.otf'),font);
  await assert.rejects(verifyReleaseFonts(root),/Font resource invalid/);
 }finally{await rm(root,{recursive:true,force:true});}
});
