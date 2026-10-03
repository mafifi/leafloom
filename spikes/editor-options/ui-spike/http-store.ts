import { ManuscriptSchema, type Manuscript } from '../src/contracts';
import type { BookStore, AuxiliaryDocument } from './storage';
export class HttpBookStore implements BookStore {
 constructor(private key:string){}
 private async request(file:string,value?:unknown){const response=await fetch(`/__spike/book/${this.key}/${file}`,{method:value===undefined?'GET':'PUT',headers:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)});const result=await response.json();if(!response.ok)throw new Error(result.error??'Save failed');return result;}
 async save(doc:Manuscript){await this.request('manuscript',doc);}
 async load(){const doc=await this.request('manuscript');return doc===null?null:ManuscriptSchema.parse(doc);}
 async saveText(kind:AuxiliaryDocument,text:string){await this.request(kind,text);}
 async loadText(kind:AuxiliaryDocument){const result=await this.request(kind);if(typeof result!=='string')throw new Error('Invalid auxiliary document');return result;}
}
