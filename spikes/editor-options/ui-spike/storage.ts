import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { ManuscriptSchema, type Manuscript } from '../src/contracts.ts';
export type SaveStage='temporary.synced'|'backup.replaced'|'current.replaced';
export type AuxiliaryDocument='notes'|'outline';
export interface BookStore {save(document:Manuscript):Promise<void>;load():Promise<Manuscript|null>;saveText(kind:AuxiliaryDocument,text:string):Promise<void>;loadText(kind:AuxiliaryDocument):Promise<string>;}
export class FileBookStore implements BookStore {
 private queue=Promise.resolve();
 constructor(private root:string,private barrier?:(stage:SaveStage)=>Promise<void>){}
 private ordered<T>(operation:()=>Promise<T>):Promise<T>{const next=this.queue.then(operation);this.queue=next.then(()=>{},()=>{});return next;}
 private async read(name:string){try{return await readFile(join(this.root,name),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 private async durable(name:string,text:string){const file=await open(join(this.root,name),'w',0o600);try{await file.writeFile(text,'utf8');await file.sync();}finally{await file.close();}}
 private async directorySync(){const directory=await open(this.root,'r');try{await directory.sync();}finally{await directory.close();}}
 private async replace(name:string,text:string,valid:(raw:string)=>boolean){
  await mkdir(this.root,{recursive:true});await this.durable(name+'.tmp',text);await this.barrier?.('temporary.synced');
  const previous=await this.read(name);if(previous!==null&&valid(previous)){await this.durable(name+'.bak.tmp',previous);await rename(join(this.root,name+'.bak.tmp'),join(this.root,name+'.bak'));await this.directorySync();}
  await this.barrier?.('backup.replaced');await rename(join(this.root,name+'.tmp'),join(this.root,name));await this.directorySync();await this.barrier?.('current.replaced');
 }
 private validBook=(raw:string)=>{try{return ManuscriptSchema.safeParse(JSON.parse(raw)).success;}catch{return false;}};
 async save(raw:Manuscript){const document=ManuscriptSchema.parse(raw),serialized=JSON.stringify(document,null,2)+'\n';return this.ordered(async()=>{const previous=await this.read('manuscript.json');if(previous&&this.validBook(previous)&&JSON.parse(previous).revision>document.revision)throw new Error('Refusing an older manuscript revision');await this.replace('manuscript.json',serialized,this.validBook);});}
 load(){return this.ordered(async()=>{const current=await this.read('manuscript.json');if(current&&this.validBook(current))return ManuscriptSchema.parse(JSON.parse(current));const backup=await this.read('manuscript.json.bak');if(backup&&this.validBook(backup)){await this.replace('manuscript.json',backup,this.validBook);return ManuscriptSchema.parse(JSON.parse(backup));}if(current!==null||backup!==null)throw new Error('No valid manuscript version could be recovered');return null;});}
 saveText(kind:AuxiliaryDocument,text:string){return this.ordered(()=>this.replace(kind+'.txt',text,()=>true));}
 loadText(kind:AuxiliaryDocument){return this.ordered(async()=>await this.read(kind+'.txt')??'');}
}
