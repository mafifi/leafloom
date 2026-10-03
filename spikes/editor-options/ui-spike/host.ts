import type { Plugin } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileBookStore } from './storage.ts';
export function bookHost():Plugin {
 const stores=new Map<string,FileBookStore>();let root:string;
 return {name:'neo-ui-spike-book-host',async configureServer(server){root=process.env.NEO_UI_SPIKE_BOOKS??await mkdtemp(join(tmpdir(),'neo-ui-books-'));server.middlewares.use(async(req,res,next)=>{
  const match=req.url?.match(/^\/__spike\/book\/([a-zA-Z0-9-]{1,80})\/(manuscript|notes|outline)$/);if(!match)return next();res.setHeader('Content-Type','application/json');
  try{const [,key,file]=match;let store=stores.get(key);if(!store){store=new FileBookStore(join(root,key));stores.set(key,store);}let value:unknown;
   if(req.method==='PUT'){let body='';for await(const chunk of req){body+=chunk;if(body.length>16*1024*1024)throw new Error('Book exceeds spike transport limit');}value=JSON.parse(body);if(file==='manuscript')await store.save(value as Parameters<FileBookStore['save']>[0]);else{if(typeof value!=='string')throw new Error('Expected text');await store.saveText(file as 'notes'|'outline',value);}res.end('null');}
   else if(req.method==='GET'){res.end(JSON.stringify(file==='manuscript'?await store.load():await store.loadText(file as 'notes'|'outline')));}
   else{res.statusCode=405;res.end(JSON.stringify({error:'Unsupported method'}));}
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e instanceof Error?e.message:'Book operation failed'}));}
 });}};
}
