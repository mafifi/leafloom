import {signedHostIdentitySha256} from '../macos-host-identity.cjs';
import {createHash} from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function json(name){return JSON.parse(await readFile(path.join(base,name),'utf8'));}
function results(report){const rows=[];function walk(suites,lineage=[]){for(const suite of suites??[]){const names=[...lineage,suite.title];for(const spec of suite.specs??[])rows.push({title:spec.title,lineage:names,tests:spec.tests??[]});walk(suite.suites,names);}}walk(report.suites);return rows;}
const buildHashes=await Promise.all(['../parity-dist/neo-prosemirror.js','reference/launch.cjs','../package-lock.json','../parity-dist/persistence-boundary.cjs'].map(async file=>createHash('sha256').update(await readFile(path.resolve(base,file))).digest('hex')));
const proofHash=createHash('sha256').update(buildHashes.join('\n')).digest('hex');
const referenceRoot=path.resolve(base,'../../..');
const referenceSourceHashes={};
for(const file of await readdir(referenceRoot)){if(/\.(js|html|css|json)$/.test(file)&&(await stat(path.join(referenceRoot,file))).isFile())referenceSourceHashes[file]=createHash('sha256').update(await readFile(path.join(referenceRoot,file))).digest('hex');}
const runtimeVersions=await Promise.all(['electron-reference','electron'].map(async name=>JSON.parse(await readFile(path.resolve(base,'../node_modules',name,'package.json'),'utf8')).version));
const integrationSourceHashes={};
for(const file of await readdir(path.join(base,'tests'))){if(file.endsWith('.ts'))integrationSourceHashes[`parity/tests/${file}`]=createHash('sha256').update(await readFile(path.join(base,'tests',file))).digest('hex');}
for(const file of ['reference/harness.ts','evidence.ts','scripts/prepare-macos-hosts.mjs','macos-host-identity.cjs','macos-host-identity.d.cts'])integrationSourceHashes[`parity/${file}`]=createHash('sha256').update(await readFile(path.join(base,file))).digest('hex');
const currentSignedHostIdentity=signedHostIdentitySha256(path.resolve(base,'..'));
const metadata=new Map();
const cache=new Map();async function report(name){if(!cache.has(name)){let data;try{data=await json(name);}catch(error){if(error.code!=='ENOENT')throw error;data={};}metadata.set(name,data.config?.metadata??{});cache.set(name,results(data));}return cache.get(name);}
async function passed(entry){const rows=await report(entry.report),meta=metadata.get(entry.report);if(meta?.signedHostIdentitySha256!==currentSignedHostIdentity||meta?.proofBuildSha256!==proofHash||meta.referenceElectronVersion!==runtimeVersions[0]||meta.targetElectronVersion!==runtimeVersions[1])return false;if(Object.keys(referenceSourceHashes).some(file=>meta.referenceSourceHashes?.[file]!==referenceSourceHashes[file]))return false;if(Object.keys(integrationSourceHashes).some(file=>meta.integrationSourceHashes?.[file]!==integrationSourceHashes[file]))return false;const found=rows.filter(row=>row.title===entry.title&&(!entry.engine||row.lineage.includes(entry.engine)||row.title.includes(entry.engine+':')));return found.length===1&&found[0].tests.length>0&&found[0].tests.every(test=>test.expectedStatus==='passed'&&test.results?.length===1&&test.results[0].status==='passed');}
const problems=[];
try{
 const inventory=await json('feature-inventory.json'),registry=await json('integration-registry.json');
 for(const gap of registry.remainingGaps??[])problems.push(`${gap.featureId}: unresolved registry acceptance (${gap.gap})`);
 const registryIds=new Set();for(const entry of registry.scenarios){if(registryIds.has(entry.scenarioId))problems.push(`Duplicate registry scenario ${entry.scenarioId}`);registryIds.add(entry.scenarioId);}
 const allIds=new Set();let required=0,covered=0;
 for(const feature of inventory.features){
  if(allIds.has(feature.id))problems.push(`Duplicate feature ${feature.id}`);allIds.add(feature.id);
  if(!feature.sources?.length)problems.push(`${feature.id}: missing source evidence`);
  if(!['required','platform-variant','roadmap'].includes(feature.status))problems.push(`${feature.id}: unknown classification`);
  if(feature.status!=='required')continue;
  if(!feature.scenarios?.length)problems.push(`${feature.id}: no scenarios`);
  for(const scenario of feature.scenarios??[]){
   required++;const entry=registry.scenarios.find(e=>e.scenarioId===scenario.id&&e.featureId===feature.id);
   if(!entry){problems.push(`${scenario.id}: uncovered`);continue;}
   const before=problems.length;
   for(const id of scenario.acceptanceEvidenceScenarios??[]){if(!feature.scenarios?.some(s=>s.id===id)||!registry.scenarios.some(e=>e.scenarioId===id&&e.featureId===feature.id))problems.push(`${scenario.id}: missing same-feature acceptance evidence ${id}`);}
   for(const id of entry.supplementalScenarioIds??[]){if(!feature.scenarios?.some(s=>s.id===id)||!registry.scenarios.some(e=>e.scenarioId===id&&e.featureId===feature.id))problems.push(`${scenario.id}: missing same-feature supplemental requirement ${id}`);}
   if(!entry.assertions?.length||!entry.driverActions?.length||entry.reviewed!==true)problems.push(`${scenario.id}: actions/assertions not reviewed`);
   if(entry.knownGaps?.length)problems.push(`${scenario.id}: unproved acceptance clauses (${entry.knownGaps.join('; ')})`);
   const source=await readFile(path.resolve(base,'..',entry.testFile),'utf8');
   if(!source.includes(scenario.id))problems.push(`${scenario.id}: test source lacks scenario ID`);
   if(!entry.targetCases?.length)problems.push(`${scenario.id}: no target integrations`);
   const testHash=createHash('sha256').update(source).digest('hex');
   for(const file of entry.testFiles??[entry.testFile]){
    const hash=createHash('sha256').update(await readFile(path.resolve(base,'..',file))).digest('hex');
    for(const item of [...(entry.targetCases??[]),...(entry.oracle.cases??[]),...(entry.baselineDefectCases??[])]){await report(item.report);if(metadata.get(item.report)?.integrationSourceHashes?.[file]!==hash)problems.push(`${scenario.id}: evidence predates integration source ${file}`);}
   }
   for(const item of entry.targetCases??[]){if(!await passed(item))problems.push(`${scenario.id}: target not passed without skip/retry (${item.title})`);if(metadata.get(item.report)?.integrationSourceHashes?.[entry.testFile]!==testHash)problems.push(`${scenario.id}: target evidence predates current integration source`);}
   if(entry.oracle?.kind==='neo-reference'){
    if(!entry.oracle.cases?.length)problems.push(`${scenario.id}: no baseline integrations`);
    for(const item of entry.oracle.cases??[]){if(!await passed(item))problems.push(`${scenario.id}: original not passed (${item.title})`);if(metadata.get(item.report)?.integrationSourceHashes?.[entry.testFile]!==testHash)problems.push(`${scenario.id}: baseline evidence predates current integration source`);}
   }else if(entry.oracle?.kind!=='contract-output'||!entry.oracle.sourceEvidence)problems.push(`${scenario.id}: no baseline/output oracle`);
   for(const item of entry.baselineDefectCases??[]){if(!await passed(item))problems.push(`${scenario.id}: original defect characterization not passed (${item.title})`);}
   if(problems.length===before)covered++;
  }
 }
 if(!required)problems.push('No required scenarios inventoried');
 console.log(`${covered}/${required} required scenarios verified; ${registry.scenarios.length} registered.`);
 if(problems.length)throw new Error(`${problems.length} coverage failures:\n${problems.join('\n')}`);
 console.log('Full parity coverage gate passed.');
}catch(error){console.error(error.message);process.exitCode=1;}
