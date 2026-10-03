import { open,readFile,mkdir,rename,unlink,rmdir,lstat } from 'node:fs/promises';
import { join } from 'node:path';import { createHash,randomUUID } from 'node:crypto';
import { Book,LifecycleError,type BookDocument,type DocumentName,type OpenBook,type SavedReceipt } from './contracts';
export type Stage='temporary.synced'|'backup.replaced'|'current.replaced'|'directory.synced';
const names={manuscript:'manuscript.json',notes:'notes.html',outline:'outline.html'} as const;
export const hash=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch(e){return(e as NodeJS.ErrnoException).code!=='ESRCH';}};
type Owner={pid:number;token:string};
export class BookFiles {
 private queue:Promise<void>=Promise.resolve();private owner:Owner|null=null;private uncertain=new Map<DocumentName,{expected:string;etag:string;revision:number}>();
 constructor(readonly root:string,private barrier?:(stage:Stage)=>Promise<void>){}
 private async read(path:string){try{if((await lstat(path)).isSymbolicLink())throw new LifecycleError('INVALID');return new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 private async write(path:string,value:string){const file=await open(path,'wx',0o600);try{await file.writeFile(value,'utf8');await file.sync();}finally{await file.close();}}
 private ordered<T>(op:()=>Promise<T>){const next=this.queue.then(op);this.queue=next.then(()=>{},()=>{});return next;}
 private async syncDir(){const directory=await open(this.root,'r');try{await directory.sync();}finally{await directory.close();}}
 async acquire(){if(this.owner)return this.owner.token;await mkdir(this.root,{recursive:true});const lock=join(this.root,'.writer.lock'),recovery=join(this.root,'.writer-recovery');
  try{await lstat(recovery);throw new LifecycleError('BUSY');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const owner={pid:process.pid,token:randomUUID()};
  try{await this.write(lock,JSON.stringify(owner));}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
   let previous:Owner;try{previous=JSON.parse((await this.read(lock))!);}catch{throw new LifecycleError('BUSY');}
   if(!Number.isInteger(previous.pid)||alive(previous.pid))throw new LifecycleError('BUSY');
   try{await mkdir(recovery);}catch{throw new LifecycleError('BUSY');}
   try{const current=JSON.parse((await this.read(lock))!) as Owner;if(current.token!==previous.token||alive(current.pid))throw new LifecycleError('BUSY');await unlink(lock);await this.write(lock,JSON.stringify(owner));}finally{await rmdir(recovery);}
  }
  this.owner=owner;return owner.token;
 }
 async release(){await this.queue;if(!this.owner)return;const lock=join(this.root,'.writer.lock');try{const current=JSON.parse((await this.read(lock))!) as Owner;if(current.token===this.owner.token)await unlink(lock);}finally{this.owner=null;}}
 private valid(name:DocumentName,value:string){if(name!=='manuscript')return true;try{return Book.safeParse(JSON.parse(value)).success;}catch{return false;}}
 private async readVersion(name:DocumentName,recover:boolean):Promise<{text:string;recovered:boolean}>{
  const file=join(this.root,names[name]);let current:string|null,invalidEncoding=false;try{current=await this.read(file);}catch(e){if(e instanceof TypeError){current=null;invalidEncoding=true;}else throw e;}
  if(!invalidEncoding&&current!==null&&this.valid(name,current))return{text:current,recovered:false};
  const backup=await this.read(file+'.bak');if(backup!==null&&this.valid(name,backup)){if(recover){if(!this.owner)throw new LifecycleError('UNAUTHORIZED');await this.atomic(name,backup,null);}return{text:backup,recovered:true};}
  if(name!=='manuscript'&&current===null&&!invalidEncoding)return{text:'',recovered:false};throw new LifecycleError('CORRUPT');
 }
 private async atomic(name:DocumentName,text:string,expected:string|null){
  let replaced=false;const file=join(this.root,names[name]),temporary=file+'.'+randomUUID()+'.tmp',backup=file+'.'+randomUUID()+'.bak.tmp';
  try{await this.write(temporary,text);await this.barrier?.('temporary.synced');let previous:string|null;try{previous=await this.read(file);}catch(e){if(e instanceof TypeError&&expected===null)previous=null;else throw e;}
   if(expected!==null&&hash(previous??'')!==expected)throw new LifecycleError('EXTERNAL_CHANGE');
   if(previous!==null&&this.valid(name,previous)){await this.write(backup,previous);await rename(backup,file+'.bak');await this.syncDir();}await this.barrier?.('backup.replaced');
   if(expected!==null&&hash((await this.read(file))??'')!==expected)throw new LifecycleError('EXTERNAL_CHANGE');
   await rename(temporary,file);replaced=true;await this.barrier?.('current.replaced');await this.syncDir();await this.barrier?.('directory.synced');
  }catch(error){if(replaced)throw new LifecycleError('SAVE_UNCERTAIN');throw error;}finally{for(const path of [temporary,backup])try{await unlink(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 }
 load(recover=true):Promise<OpenBook>{return this.ordered(async()=>{const manuscript=await this.readVersion('manuscript',recover),notes=await this.readVersion('notes',recover),outline=await this.readVersion('outline',recover);return{book:Book.parse(JSON.parse(manuscript.text)),notes:notes.text,outline:outline.text,versions:{manuscript:hash(manuscript.text),notes:hash(notes.text),outline:hash(outline.text)},recovered:manuscript.recovered||notes.recovered||outline.recovered};});}
 save(name:DocumentName,raw:BookDocument|string,expected:string,revision:number):Promise<SavedReceipt>{
  if(!this.owner)return Promise.reject(new LifecycleError('UNAUTHORIZED'));
  let text:string;try{if(name==='manuscript'){const book=Book.parse(raw);if(book.revision!==revision)throw new LifecycleError('INVALID');text=JSON.stringify(book,null,2)+'\n';}else{if(typeof raw!=='string')throw new LifecycleError('INVALID');text=raw;}}catch(e){return Promise.reject(e);}
  return this.ordered(async()=>{if(!this.owner)throw new LifecycleError('UNAUTHORIZED');const current=await this.readVersion(name,false);if(hash(current.text)!==expected){const pending=this.uncertain.get(name);if(pending&&pending.expected===expected&&pending.etag===hash(text)&&pending.revision===revision&&hash(current.text)===pending.etag){try{await this.syncDir();}catch{throw new LifecycleError('SAVE_UNCERTAIN');}this.uncertain.delete(name);return{name,revision,etag:pending.etag};}throw new LifecycleError('EXTERNAL_CHANGE');}if(name==='manuscript'&&text!==current.text&&JSON.parse(current.text).revision>=revision)throw new LifecycleError('INVALID');
   if(text!==current.text)try{await this.atomic(name,text,expected);}catch(error){if(error instanceof LifecycleError&&error.code==='SAVE_UNCERTAIN')this.uncertain.set(name,{expected,etag:hash(text),revision});throw error;}return{name,revision,etag:hash(text)};});
 }
}
