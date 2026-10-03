import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyNativeEvidence } from '../../scripts/check-native-evidence.mjs';

test('native receipt rejects failed, stale, missing artifacts and simulated Playwright reports', async () => {
 for (const receipt of [{}, { status:'failed' }, {config:{metadata:{evidenceSchema:'leafloom/parity-v1'}},suites:[]}]) {
  const result=await verifyNativeEvidence(receipt,{id:'NEO-263-B',title:'Layout',driverActions:['Export'],assertions:['Actual PDF links']},{root:process.cwd(),buildSha256:'a'.repeat(64)});
  assert.equal(result.passed,false);
  assert.ok(result.problems.some(p=>p.includes('schema')));
 }
});

test('native receipt verifies actual bytes and finite contracts and rejects changed artifacts or hidden physical claims', async () => {
 const root=await mkdtemp(path.join(tmpdir(),'leafloom-evidence-unit-'));
 try {
  const files=['scripts/verify-macos-native.mjs','binary','host/main.mjs','host/node','apps/desktop/dist/assets/app.js','apps/desktop/dist/assets/app.css','tests/neo-compat/native/document-io.mjs','tests/neo-compat/shared/document-io.mjs','tests/neo-compat/native/io-cover-edge.mjs','tests/neo-compat/shared/io-cover-edge.mjs','tests/neo-compat/shared/pdf-layout.mjs'];
  const hashes:Record<string,string>={};
  for(const file of files){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),file);hashes[file]=createHash('sha256').update(file).digest('hex');}
  const entry={id:'NEO-263-B',title:'Layout',driverActions:['Export actual PDF'],assertions:['Parse actual Contents links']};
  const receipt={evidenceSchema:'leafloom/native-v1',appImplementation:'leafloom-production',referenceCommit:'ed090e9988d446daf1ebbde91bcebc13b599909b',driver:'tauri-native-hidden',hiddenWindow:true,fixtureKind:'marked private fixture',status:'passed',buildSha256:'a'.repeat(64),buildSha256Before:'a'.repeat(64),buildSha256After:'a'.repeat(64),binary:path.join(root,'binary'),artifactBinding:{driverSha256:hashes[files[0]],binarySha256:hashes.binary,runtimeEntry:path.join(root,'host/main.mjs'),runtimeExecutable:path.join(root,'host/node'),hostMainSha256:hashes['host/main.mjs'],nodeSha256:hashes['host/node'],webAssets:[{path:'/assets/app.js',sha256:hashes['apps/desktop/dist/assets/app.js']},{path:'/assets/app.css',sha256:hashes['apps/desktop/dist/assets/app.css']}]},documentIO:{driver:'tauri-native-hidden',pickerQualification:'fixture; physical picker unproved',callbackSha256:hashes[files[6]],sharedSha256:hashes[files[7]],edgeModuleHashes:Object.fromEntries(files.slice(8).map(f=>[f.replace('tests/neo-compat/',''),hashes[f]])),evidence:[entry]}};
  const options={root,buildSha256:'a'.repeat(64)};
  assert.equal((await verifyNativeEvidence(receipt,entry,options)).passed,true);
  assert.equal((await verifyNativeEvidence(receipt,{...entry,requiresPhysicalPicker:true},options)).passed,false);
  assert.equal((await verifyNativeEvidence({...receipt,buildSha256After:'b'.repeat(64)},entry,options)).passed,false);
  assert.equal((await verifyNativeEvidence(receipt,{...entry,assertions:['Different assertion']},options)).passed,false);
  assert.equal((await verifyNativeEvidence({...receipt,documentIO:{...receipt.documentIO,evidence:[entry,entry]}},entry,options)).passed,false);
  assert.equal((await verifyNativeEvidence({...receipt,documentIO:{...receipt.documentIO,unexecutedClauses:['NEO-263-B']}},entry,options)).passed,false);
  assert.equal((await verifyNativeEvidence(receipt,{...entry,knownGaps:['Physical panel unproved']},options)).passed,false);
  assert.equal((await verifyNativeEvidence({...receipt,documentIO:{...receipt.documentIO,evidence:[{...entry,artifact:{sha256:'c'.repeat(64)}}]}},entry,options)).passed,false);
  assert.equal((await verifyNativeEvidence({...receipt,documentIO:{...receipt.documentIO,callbackSha256:'d'.repeat(64)}},entry,options)).passed,false);
  await writeFile(path.join(root,'host/main.mjs'),'changed');
  assert.equal((await verifyNativeEvidence(receipt,entry,options)).passed,false);
 } finally {await rm(root,{recursive:true,force:true});}
});
