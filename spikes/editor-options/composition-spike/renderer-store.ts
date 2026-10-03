import { Checkpoint,SourceBook,Reviews,OpenReply,SaveReply,type HostPort,type Opened,type DocumentStore,type Receipt } from './contracts';
export class ElectronStore implements DocumentStore {
 lease:string|null=null;readOnly=false;
 constructor(readonly host:HostPort){}
 async open():Promise<Opened>{const result=await this.host.request<Opened&{lease:string|null;readOnly:boolean}>({method:'open'});if(!result.ok)throw Error(result.code);const value=OpenReply.parse(result.value);this.lease=value.lease;this.readOnly=value.readOnly;return value;}
 async save(checkpoint:import('./contracts').CheckpointValue,expected:Opened['versions'],traceparent?:string):Promise<Receipt>{if(!this.lease)throw Error('UNAUTHORIZED');const result=await this.host.request<Receipt>({method:'save',lease:this.lease,checkpoint,expected},traceparent);if(!result.ok)throw Error(result.code);return SaveReply.parse(result.value);}
 onCloseRequested(fn:()=>void){return this.host.onCloseRequested(fn);}
 dirty(revision:number){void this.host.request({method:'dirty',revision});}
 close(){return this.host.request({method:'close'});}
 finish(discard:boolean){return this.host.request({method:'finish-close',discard});}
}
/** Browser fixture uses the same validated boundary. Electron owns durable storage. */
export class MemoryStore implements DocumentStore {
 private value:Opened;private serial=0;delay=0;fail=false;
 constructor(book:unknown){this.value={book:SourceBook.parse(book),reviews:null,notes:'<p>Notes.</p>',outline:'<p>Outline.</p>',recovered:false,versions:{manuscript:'0'.repeat(64),reviews:'0'.repeat(64),notes:'0'.repeat(64),outline:'0'.repeat(64)}};}
 async open(){return structuredClone(this.value);}
 async save(raw:import('./contracts').CheckpointValue,expected:Opened['versions']){const value=Checkpoint.parse(raw);if(this.delay)await new Promise(r=>setTimeout(r,this.delay));if(this.fail)throw Error('DISK_ERROR');if(Object.keys(expected).some(k=>expected[k as keyof typeof expected]!==this.value.versions[k as keyof typeof expected]))throw Error('EXTERNAL_CHANGE');this.value={book:value.book,reviews:Reviews.parse(value.reviews),notes:value.notes,outline:value.outline,recovered:false,versions:Object.fromEntries(Object.keys(expected).map(k=>[k,(++this.serial).toString(16).padStart(64,'0')])) as Opened['versions']};return {revision:value.book.revision,versions:this.value.versions};}
}
