import { readFile,writeFile,mkdir,readdir,copyFile,lstat,open,rename,rm } from 'node:fs/promises';
import { join,resolve,sep,dirname } from 'node:path';
import { Book,type BookDocument,LifecycleError } from './contracts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const safe=(name:string)=>{if(!name||name==='.'||name==='..'||/[\\/\0]/.test(name))throw new LifecycleError('INVALID');return name;};
async function checked(path:string){if((await lstat(path)).isSymbolicLink())throw new LifecycleError('INVALID');return path;}
async function optional(path:string,fallback:string){try{return await readFile(await checked(path),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return fallback;throw e;}}
export async function importNeo(source:string,destination:string):Promise<BookDocument>{
 await checked(source);if(resolve(destination).startsWith(resolve(source)+sep))throw new LifecycleError('INVALID');try{await lstat(destination);throw new LifecycleError('INVALID');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const raw=z.object({id:z.string(),title:z.string(),author:z.string(),chapterOrder:z.array(z.string())}).catchall(z.json()).parse(JSON.parse(await readFile(await checked(join(source,'book.json')),'utf8')));
 const {chapterOrder,...metadata}=raw;await checked(join(source,'chapters'));
 const chapters=await Promise.all(chapterOrder.map(async id=>({id,html:await readFile(await checked(join(source,'chapters',safe(id)+'.html')),'utf8')})));
 // Unordered chapter files must not disappear during migration.
 const files=await readdir(join(source,'chapters'));if(files.some(f=>f.endsWith('.html')&&!chapterOrder.some(id=>safe(id)+'.html'===f)))throw new LifecycleError('INVALID');
 const book=Book.parse({formatVersion:'neo-lifecycle/v1',revision:0,metadata,chapters,darlings:JSON.parse(await optional(join(source,'darlings.json'),'[]'))});
 const staging=destination+'.import-'+randomUUID();try{
 await mkdir(staging,{recursive:true});
 for(const name of await readdir(source)){if(['book.json','chapters','darlings.json'].includes(name))continue;const file=await checked(join(source,safe(name)));if(!(await lstat(file)).isFile())throw new LifecycleError('INVALID');if(['manuscript.json','manuscript.json.bak'].includes(name)||['.writer.lock','.writer-recovery'].includes(name))throw new LifecycleError('INVALID');await copyFile(file,join(staging,name));}
 for(const name of ['notes','outline']){const html=await optional(join(source,name+'.html'),'');await writeFile(join(staging,name+'.html'),html);}
 await writeFile(join(staging,'manuscript.json'),JSON.stringify(book,null,2)+'\n');
 for(const name of await readdir(staging)){const file=await open(join(staging,name),'r');try{await file.sync();}finally{await file.close();}}const directory=await open(staging,'r');try{await directory.sync();}finally{await directory.close();}await rename(staging,destination);const parent=await open(dirname(destination),'r');try{await parent.sync();}finally{await parent.close();}return book;}finally{await rm(staging,{recursive:true,force:true});}
}
export async function exportNeo(bookFolder:string,destination:string){
 const book=Book.parse(JSON.parse(await readFile(join(bookFolder,'manuscript.json'),'utf8')));await mkdir(join(destination,'chapters'),{recursive:true});
 await writeFile(join(destination,'book.json'),JSON.stringify({...book.metadata,chapterOrder:book.chapters.map(c=>c.id)},null,2));
 for(const chapter of book.chapters)await writeFile(join(destination,'chapters',safe(chapter.id)+'.html'),chapter.html);
 await writeFile(join(destination,'darlings.json'),JSON.stringify(book.darlings));
 for(const name of await readdir(bookFolder)){if(['manuscript.json','.writer.lock','.writer-recovery','manuscript.json.bak','notes.html.bak','outline.html.bak'].includes(name)||/^(manuscript\.json|notes\.html|outline\.html)\.[0-9a-f-]+\.(bak\.)?tmp$/.test(name))continue;const file=await checked(join(bookFolder,safe(name)));if((await lstat(file)).isFile())await copyFile(file,join(destination,name));}
}
