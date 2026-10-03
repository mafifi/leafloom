import {signedHostIdentitySha256} from './macos-host-identity.cjs';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
/** Bind integration reports to the exact engine, host boundary and dependency lock. */
export function evidenceMetadata(){
 const files=['parity-dist/neo-prosemirror.js','parity/reference/launch.cjs','package-lock.json','parity-dist/persistence-boundary.cjs'];
 const hashes=files.map(file=>createHash('sha256').update(readFileSync(path.resolve(file))).digest('hex'));
 const integrationSourceHashes=Object.fromEntries(readdirSync(path.resolve('parity/tests')).filter(file=>file.endsWith('.ts')).map(file=>{const name=`parity/tests/${file}`;return[name,createHash('sha256').update(readFileSync(path.resolve(name))).digest('hex')];}));
 for(const name of ['parity/reference/harness.ts','parity/evidence.ts','parity/scripts/prepare-macos-hosts.mjs','parity/macos-host-identity.cjs','parity/macos-host-identity.d.cts'])integrationSourceHashes[name]=createHash('sha256').update(readFileSync(path.resolve(name))).digest('hex');
 const referenceRoot=process.env.NEO_REFERENCE_ROOT||path.resolve('../reference/neo');
 const referenceSourceHashes=Object.fromEntries(readdirSync(referenceRoot).filter(file=>/\.(js|html|css|json)$/.test(file)&&statSync(path.join(referenceRoot,file)).isFile()).map(file=>[file,createHash('sha256').update(readFileSync(path.join(referenceRoot,file))).digest('hex')]));
 const referenceElectronVersion=JSON.parse(readFileSync(path.resolve('node_modules/electron-reference/package.json'),'utf8')).version;
 const targetElectronVersion=JSON.parse(readFileSync(path.resolve('node_modules/electron/package.json'),'utf8')).version;
 return {signedHostIdentitySha256:signedHostIdentitySha256(),referenceElectronVersion,targetElectronVersion,referenceSourceHashes,integrationSourceHashes,targetBundleSha256:hashes[0],hostHarnessSha256:hashes[1],dependencyLockSha256:hashes[2],persistenceBoundarySha256:hashes[3],proofBuildSha256:createHash('sha256').update(hashes.join('\n')).digest('hex')};
}
