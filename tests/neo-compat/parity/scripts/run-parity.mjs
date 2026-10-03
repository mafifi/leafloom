import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const suites=[
 ['library',{}],['books',{}],['editing',{NEO_EDITING_ENGINE:'original'}],['editing',{NEO_EDITING_ENGINE:'prosemirror'}],
 ['editing-edge',{NEO_EDITING_EDGE_ENGINE:'original'}],['editing-edge',{NEO_EDITING_EDGE_ENGINE:'prosemirror'}],
 ['notes',{NEO_NOTES_ENGINE:'original'}],['notes',{NEO_NOTES_ENGINE:'prosemirror'}],['spelling',{}],['presentation',{}],['persistence',{}],['io',{}],['io-edge',{}],['navigation-edge',{}],['acceptance-gap',{}],
 ['canonical',{NEO_CANONICAL_ENGINE:'original'}],['canonical',{NEO_CANONICAL_ENGINE:'prosemirror'}],['native',{NEO_NATIVE_ENGINE:'original'}],['native',{NEO_NATIVE_ENGINE:'prosemirror'}],['reference',{}],['target',{}],
 ['native-accessibility',{NEO_NATIVE_ACCESSIBILITY_ENGINE:'original'}],['native-accessibility',{NEO_NATIVE_ACCESSIBILITY_ENGINE:'prosemirror'}],
 ['adapter-regressions',{}],['modal-families',{}],['modifier-shortcuts',{}],
];
if(process.env.NEO_NATIVE_OS_DRIVER==='1')suites.push(['native-shortcuts',{}]);
async function run(command,args,env={}){await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,env:{...process.env,...env},stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));});}
await run('npx',['vite','build','--config','parity/vite.config.ts']);
await run('npx',['vite','build','--config','parity/persistence-build.config.ts']);
const failures=[];
for(const[suite,env]of suites){if(existsSync(path.join(cwd,'node_modules/.neo-parity-hosts/crash-stop.json'))){failures.push('Native crash safety stop: further Electron launches cancelled pending investigation');break;}console.log(`Parity suite: ${suite} ${Object.values(env).join(' ')}`);try{await run('npx',['playwright','test','--config',`parity/${suite}.config.ts`],env);}catch(error){failures.push(error.message);}}
try{await run('node',['parity/scripts/check-coverage.mjs']);}catch(error){failures.push(error.message);}
if(failures.length){console.error(`Parity run failed:\n${failures.join('\n')}`);process.exitCode=1;}
