const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const path=require('node:path');
function signedHostIdentitySha256(root=process.cwd()){
 if(process.platform!=='darwin')return 'not-macos';
 const identities=['electron-reference','electron'].map(runtime=>{
  const directory=path.join(root,'node_modules/.neo-parity-hosts',runtime);
  const receipt=readFileSync(path.join(directory,'receipt.json'));
  const bundle=path.join(directory,'NEO Parity.app');
  const verification=spawnSync('codesign',['--verify','--deep','--strict',bundle],{encoding:'utf8',timeout:15000});
  const shown=spawnSync('codesign',['-d','-r-','--verbose=4',bundle],{encoding:'utf8',timeout:15000});
  const requirement=shown.stdout?.split('\n').find(line=>line.startsWith('designated => '));
  const cdHash=shown.stderr?.split('\n').find(line=>line.startsWith('CDHash='));
  if(verification.status!==0||shown.status!==0||!requirement||!cdHash||!shown.stderr.includes('Authority=Apple ')||shown.stderr.includes('Signature=adhoc'))throw Error(`Invalid certificate-signed host: ${runtime}`);
  if(requirement!==String(JSON.parse(receipt).requirement).trim())throw Error(`Signing receipt mismatch: ${runtime}`);
  return {runtime,receiptSha256:createHash('sha256').update(receipt).digest('hex'),requirement,cdHash,executableSha256:createHash('sha256').update(readFileSync(path.join(bundle,'Contents/MacOS/Electron'))).digest('hex')};
 });
 return createHash('sha256').update(JSON.stringify(identities)).digest('hex');
}
module.exports={signedHostIdentitySha256};
