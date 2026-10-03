import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import type {Page} from '@playwright/test';
const referenceRoots=new WeakMap<Page,string>();
export function setReferenceRoot(page:Page,fixture:string){referenceRoots.set(page,path.join(fixture,'Documents','NEO Library'));}
/** Read-only observation of actual persisted files, never a test mutation seam. */
export async function persistedBook(page:Page,title:string,bookId?:string){
 const root=referenceRoots.get(page)??process.env.LEAFLOOM_TEST_ROOT;if(!root)throw Error('Missing isolated storage root');
 for(const folder of await readdir(root,{withFileTypes:true})){
  if(!folder.isDirectory()||!folder.name.startsWith('book-')||(bookId&&folder.name!==bookId))continue;
  const directory=path.join(root,folder.name);
  if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference'){
   const metadata=JSON.parse(await readFile(path.join(directory,'book.json'),'utf8'));if(metadata.title!==title)continue;
   const darlings=JSON.parse(await readFile(path.join(directory,'darlings.json'),'utf8'));
   const stickies=JSON.parse(await readFile(path.join(directory,'stickies.json'),'utf8'));
   return {directory,metadata,darlings,stickies,notes:await readFile(path.join(directory,'notes.html'),'utf8'),chapters:await Promise.all(metadata.chapterOrder.map(async(id:string)=>({id,html:await readFile(path.join(directory,'chapters',id+'.html'),'utf8')})))};
  }
  const manuscript=JSON.parse(await readFile(path.join(directory,'manuscript.json'),'utf8'));if(manuscript.metadata.title!==title)continue;
  return {directory,metadata:manuscript.metadata,darlings:manuscript.darlings,stickies:manuscript.metadata.stickies??[],notes:await readFile(path.join(directory,'notes.html'),'utf8'),chapters:manuscript.chapters};
 }
 throw Error('Actual persisted book not found: '+title);
}
export async function persistedLibrary(page:Page){const root=referenceRoots.get(page)??process.env.LEAFLOOM_TEST_ROOT;if(!root)throw Error('Missing isolated storage root');return JSON.parse(await readFile(path.join(root,'library.json'),'utf8'));}

export function privateStorageRoot(page:Page){const root=referenceRoots.get(page)??process.env.LEAFLOOM_TEST_ROOT;if(!root)throw Error('Missing isolated storage root');return root;}
