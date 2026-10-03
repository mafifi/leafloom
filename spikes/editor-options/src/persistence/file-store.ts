import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ManuscriptSchema } from '../contracts.js';
import type { ManuscriptStore } from '../contracts.js';
/** Host-only provider. Serialized atomic snapshots, with no access to the production library. */
export function createFileStore(file:string): ManuscriptStore {
 let queue=Promise.resolve();
 return { save(document){const parsed=ManuscriptSchema.parse(document);const text=JSON.stringify(parsed,null,2); const op=queue.then(async()=>{await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',text,'utf8');await rename(file+'.tmp',file);});queue=op.catch(()=>{});return op;},
 async load(){await queue;try{return ManuscriptSchema.parse(JSON.parse(await readFile(file,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}} };
}
