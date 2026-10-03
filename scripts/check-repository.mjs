import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const roles=new Set(['contract','provider','consumer','runtime','composition']);
const runtimes=new Set(['portable','browser','node','tauri']);
const skip=new Set(['node_modules','.git','target','dist','build','.leafloom']);
export async function filesIn(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){if(skip.has(entry.name))continue;const name=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await filesIn(name));else if(entry.isFile())result.push(name);}return result;}
export function importedModules(source){return [...source.matchAll(/(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?|\b(?:import|require)\s*\()\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);}
export function packageProblems(pkg,packages){const issues=[];const meta=pkg.leafloom;if(!roles.has(meta?.role))issues.push('declare leafloom.role');if(!runtimes.has(meta?.runtime))issues.push('declare leafloom.runtime');
 for(const [name,version]of Object.entries({...pkg.dependencies,...pkg.devDependencies,...pkg.peerDependencies})){if(name.startsWith('@leafloom/')){if(version!=='workspace:*')issues.push(`${name}: use workspace:*`);}else if(!String(version).startsWith('catalog:'))issues.push(`${name}: external versions belong in root catalog`);}
 for(const name of Object.keys(pkg.dependencies??{})){const target=packages.get(name);if(!target)continue;const to=target.leafloom?.role;if(['contract','consumer'].includes(meta?.role)&&['provider','composition'].includes(to))issues.push(`${meta.role} cannot depend on ${to} ${name}`);if(meta?.role==='provider'&&to==='composition')issues.push(`provider cannot depend on composition ${name}`);}
 return issues;
}
export function sourceProblems(source,filename,meta,packages){const issues=[];for(const specifier of importedModules(source)){
  if(/(?:^|\/)(?:spikes|tests\/reference|tests\/neo-compat)(?:\/|$)/.test(specifier)||specifier.includes('/Development/drawloom')||specifier.includes('/Development/projects'))issues.push(`production imports reference/private/spike ${specifier}`);
  const external=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0];const target=packages.get(external);
  if(['contract','consumer'].includes(meta.role)&&['provider','composition'].includes(target?.leafloom?.role))issues.push(`${meta.role} imports ${target.leafloom.role} ${specifier}`);
  if(meta.runtime==='portable'&&(/^(?:node:|electron$|@tauri-apps\/|@playwright\/)/.test(specifier)||['fs','path','os','crypto','child_process','worker_threads'].includes(external)))issues.push(`portable source imports host API ${specifier}`);
  if(filename.endsWith('.svelte')&&meta.role==='composition'&&(target?.leafloom?.role==='provider'||/^(?:node:|electron$|@tauri-apps\/)/.test(specifier)))issues.push(`presentation view imports provider or host API ${specifier}`);
 }
 if(filename.endsWith('.svelte')&&meta.role==='composition'&&/\bfetch\s*\(/.test(source))issues.push(`presentation view performs transport in ${filename}`);
 if(meta.runtime==='portable'&&/\b(?:HTMLElement|HTMLDivElement|HTMLInputElement|HTMLTextAreaElement|HTMLCanvasElement|Window|Document|KeyboardEvent|MouseEvent|ClipboardEvent|MutationObserver)\b/.test(source))issues.push(`portable source exposes browser ambient type in ${filename}`);
 return issues;
}
export async function verifyProvenance(){const receipt=JSON.parse(await readFile(path.join(root,'tests/reference/provenance.json'),'utf8'));const issues=[];if(receipt.commit!=='ed090e9988d446daf1ebbde91bcebc13b599909b')issues.push('unexpected upstream revision');for(const [name,expected]of Object.entries(receipt.files)){try{const hash=createHash('sha256').update(await readFile(path.join(root,'tests/reference/neo',name))).digest('hex');if(hash!==expected)issues.push(`modified NEO oracle ${name}`);}catch{issues.push(`missing NEO oracle ${name}`);}}return issues;}
export async function checkRepository(){const problems=[];const packageFiles=[];for(const directory of ['packages','apps']){for(const file of await filesIn(path.join(root,directory)))if(path.basename(file)==='package.json')packageFiles.push(file);}
 const packages=new Map();for(const file of packageFiles){const pkg=JSON.parse(await readFile(file,'utf8'));packages.set(pkg.name,{...pkg,file});}
 for(const pkg of packages.values()){
  for(const issue of packageProblems(pkg,packages))problems.push(`${path.relative(root,pkg.file)}: ${issue}`);
  const sourceRoot=path.join(path.dirname(pkg.file),'src');try{for(const file of await filesIn(sourceRoot)){if(!/\.(?:ts|js|svelte)$/.test(file))continue;for(const issue of sourceProblems(await readFile(file,'utf8'),path.relative(root,file),pkg.leafloom??{},packages))problems.push(`${path.relative(root,file)}: ${issue}`);}}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 problems.push(...await verifyProvenance());for(const name of ['README.md','AGENTS.md','ARCHITECTURE.md','DESIGN.md','CONTRIBUTING.md','WRITING.md','LICENSE','LICENSE.neo','NOTICE'])try{await stat(path.join(root,name));}catch{problems.push(`missing ${name}`);}
 return {packages:packages.size,problems};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await checkRepository();if(result.problems.length){console.error(result.problems.join('\n'));process.exitCode=1;}else console.log(`Repository policy passed: ${result.packages} packages; pinned NEO oracle verified.`);}
