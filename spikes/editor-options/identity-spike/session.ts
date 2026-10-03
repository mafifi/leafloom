import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Schema, Fragment, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { history, undo, redo, isHistoryTransaction, closeHistory, undoDepth } from 'prosemirror-history';
import { schema as baseSchema, exportHTML } from '../parity/src/codec';
import { Book } from '../lifecycle-spike/contracts';
import { IdentityBook, ReviewFile, ReviewInput, ReviewOutput, Reference, type IdentityBookDocument, type IdentityPort, type PassageReference, type ReferenceResolution, type InlineContent, type ReviewRequest, type ReviewState, type ReviewItemValue, type Outcome, type Checkpoint } from './contracts';
import { inspectHTML, baseNode } from './fidelity';
const uuid=()=>globalThis.crypto.randomUUID();
let specs=baseSchema.spec.nodes;
for(const name of ['paragraph','heading','code_block']){const spec=specs.get(name)!;specs=specs.update(name,{...spec,attrs:{...spec.attrs,pid:{default:null}}});}
specs=specs.update('doc',{...specs.get('doc')!,attrs:{version:{default:null}}});
export const identitySchema=new Schema({nodes:specs,marks:baseSchema.spec.marks});
type Entry={node:PMNode;pos:number;path:number[]};
export function entries(doc:PMNode){const found:Entry[]=[];function walk(parent:PMNode,pos:number,path:number[]){parent.forEach((node,offset,index)=>{const at=pos+offset;if(node.isTextblock)found.push({node,pos:at,path:[...path,index]});else if(node.childCount)walk(node,at+1,[...path,index]);});}walk(doc,0,[]);return found;}
export function signature(node:PMNode){return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(baseNode(node).toJSON()))));}
export function runs(fragment:Fragment):InlineContent[]{const out:InlineContent[]=[];fragment.forEach(n=>{
 if(n.isText){const marks=n.marks.map(m=>({kind:m.type.name,attributes:z.record(z.string(),z.json()).parse(m.attrs)}));const last=out.at(-1);if(last?.kind==='text'&&JSON.stringify(last.marks)===JSON.stringify(marks))last.text+=n.text!;else out.push({kind:'text',text:n.text!,marks});}
 else if(n.type.name==='hard_break')out.push({kind:'break'});
 else if(n.type.name==='placeholder'||n.type.name==='darling_anchor')out.push({kind:'atom',name:n.type.name,id:n.attrs.sid||n.attrs.did,attributes:JSON.parse(JSON.stringify(n.attrs))});
 });return out;}
export function runText(content:InlineContent[]){return content.map(r=>r.kind==='text'?r.text:r.kind==='break'?'\n':r.name==='placeholder'?'⚑':'').join('');}
type Range={from:number;to:number};
type Location={from:number;to:number;parts?:Range[];deleted:boolean;unresolved:boolean};
const copyLocation=(loc:Location):Location=>({...loc,parts:loc.parts?.map(p=>({...p}))});
function makeLocation(parts:Range[],unresolved=false):Location{const merged:Range[]=[];for(const part of parts.filter(p=>p.to>p.from)){const previous=merged.at(-1);if(previous&&part.from===previous.to)previous.to=part.to;else merged.push({...part});}return {from:merged[0]?.from||0,to:merged.at(-1)?.to||0,parts:merged,deleted:merged.length===0,unresolved};}
type Snapshot={locations:Map<string,Location>;accepted:Set<string>};
export class ChapterEditor {
 state:EditorState;
 readonly source:string;
 readonly supported:boolean;
 readonly reason:string|null;
 readonly initial:PMNode;
 locations=new Map<string,Location>();
 accepted=new Set<string>();
 private cache=new Map<string,Snapshot>();
 private events:{before:string;after:string}[]=[];
 private cursor=0;
 get retainedSnapshots(){return this.cache.size;}
 constructor(readonly owner:IdentitySession,readonly id:string,html:string,version:string,index?:IdentityBookDocument['chapters'][number]['passages']){
  this.source=html;const inspection=inspectHTML(owner.document,html);this.supported=inspection.supported;this.reason=inspection.reason;this.initial=inspection.model;
  let doc=identitySchema.nodeFromJSON(inspection.model.toJSON());const tr=EditorState.create({doc}).tr;
  const nodes=entries(doc);
  if(index){if(!this.supported&&index.length||this.supported&&index.length!==nodes.length)throw new Error('INVALID_IDENTITY');
   if(this.supported)nodes.forEach((entry,i)=>{const saved=index[i];if(JSON.stringify(saved.path)!==JSON.stringify(entry.path)||saved.signature!==signature(entry.node))throw new Error('INVALID_IDENTITY');tr.setNodeAttribute(entry.pos,'pid',saved.id);});
  }else if(this.supported)for(const entry of nodes)tr.setNodeAttribute(entry.pos,'pid',uuid());
  tr.setDocAttribute('version',version);doc=tr.doc;
  this.state=EditorState.create({doc,plugins:[history()]});this.remember();
 }
 get version():string{return this.state.doc.attrs.version;}
 get passages(){return this.supported?entries(this.state.doc):[];}
 private remember(){this.cache.set(this.version,{locations:new Map(Array.from(this.locations,([id,loc])=>[id,copyLocation(loc)])),accepted:new Set(this.accepted)});}
 register(id:string,loc:Location){this.locations.set(id,loc);this.remember();}
 dispatch(tr:Transaction){
  if(!this.supported&&tr.docChanged)return false;
  if(!tr.docChanged){this.state=this.state.apply(tr);return true;}
  this.remember();const oldVersion=this.version,oldDepth=undoDepth(this.state);const historical=isHistoryTransaction(tr);
  if(!historical){const before=new Map(this.passages.map(e=>[e.node.attrs.pid as string,tr.mapping.map(e.pos,1)]));const candidates=entries(tr.doc);const keep=new Map<string,Entry>();for(const e of candidates){const id=e.node.attrs.pid as string|null;if(!id)continue;const previous=keep.get(id),at=before.get(id);if(!previous||at!==undefined&&Math.abs(e.pos-at)<Math.abs(previous.pos-at))keep.set(id,e);}for(const e of candidates){const id=e.node.attrs.pid as string|null;if(!id||keep.get(id)!==e)tr.setNodeAttribute(e.pos,'pid',uuid());}tr.setDocAttribute('version',uuid());}
  const mapped=new Map<string,Location>();
  for(const [id,loc]of this.locations){
   if(loc.deleted||loc.unresolved){mapped.set(id,copyLocation(loc));continue;}
   const relocate=tr.getMeta('relocate') as {start:number;end:number;target:number}|undefined;
   const parts=this.segments(loc).map(segment=>{const e=this.passages.find(p=>p.node.attrs.pid===segment.passageId)!;return {from:e.pos+1+segment.from,to:e.pos+1+segment.to};});
   const moved=parts.map(part=>relocate&&part.from>=relocate.start+1&&part.to<=relocate.end-1?{from:relocate.target+(part.from-relocate.start),to:relocate.target+(part.to-relocate.start)}:{from:tr.mapping.map(part.from,1),to:tr.mapping.map(part.to,-1)});
   mapped.set(id,makeLocation(moved));
  }
  this.state=this.state.apply(tr);
  const remembered=historical?this.cache.get(this.version):undefined;
  if(remembered){this.locations=new Map(Array.from(mapped,([id,loc])=>[id,remembered.locations.get(id)?copyLocation(remembered.locations.get(id)!):{...loc,unresolved:true}]));this.accepted=new Set(remembered.accepted);}
  else {this.locations=mapped;if(historical)for(const loc of this.locations.values())loc.unresolved=true;}
  const accepted=tr.getMeta('accepted') as string|undefined;if(accepted)this.accepted.add(accepted);
  this.remember();
  const depth=undoDepth(this.state);
  if(historical)this.cursor=depth;
  else {this.events=this.events.slice(0,this.cursor);if(depth!==oldDepth||!this.events.length)this.events.push({before:oldVersion,after:this.version});else this.events[this.events.length-1].after=this.version;while(this.events.length>depth)this.events.shift();this.cursor=this.events.length;}
  const retained=new Set([this.version,...this.events.flatMap(event=>[event.before,event.after])]);for(const key of this.cache.keys())if(!retained.has(key))this.cache.delete(key);
  this.owner.changed();return true;
 }
 undo(){return undo(this.state,tr=>this.dispatch(tr));}
 redo(){return redo(this.state,tr=>this.dispatch(tr));}
 segments(loc:Location){if(loc.deleted||loc.unresolved)return [];return (loc.parts||[{from:loc.from,to:loc.to}]).flatMap(part=>this.passages.filter(e=>part.to>e.pos+1&&part.from<e.pos+1+e.node.content.size).map(e=>({passageId:e.node.attrs.pid as string,from:Math.max(0,part.from-e.pos-1),to:Math.min(e.node.content.size,part.to-e.pos-1)})));}
 content(loc:Location){let content=Fragment.empty;for(const segment of this.segments(loc)){const e=this.passages.find(p=>p.node.attrs.pid===segment.passageId)!;content=content.append(e.node.content.cut(segment.from,segment.to));}return runs(content);}
 restore(id:string,location:import('./contracts').Checkpoint['reviews']['references'][number]){
  if(location.version!==this.version||location.location.unresolved){this.register(id,{from:0,to:0,deleted:location.location.deleted,unresolved:true});return;}
  const segments=location.location.segments;
  if(location.location.deleted){this.register(id,{from:0,to:0,deleted:true,unresolved:false});return;}
  const positions=segments.map(s=>{const e=this.passages.find(e=>e.node.attrs.pid===s.passageId);if(!e||s.to>e.node.content.size||s.to<=s.from)throw new Error('INVALID_REFERENCE');return {from:e.pos+1+s.from,to:e.pos+1+s.to};});
  if(!positions.length||positions.some((p,i)=>positions.some((other,j)=>i!==j&&p.from<other.to&&p.to>other.from)))throw new Error('INVALID_REFERENCE');
  const loc=makeLocation(positions);
  if(JSON.stringify(this.segments(loc))!==JSON.stringify(segments))throw new Error('INVALID_REFERENCE');this.register(id,loc);
 }
 checkpoint(){return {id:this.id,html:baseNode(this.state.doc).eq(this.initial)?this.source:exportHTML(this.owner.document,baseNode(this.state.doc)),version:this.version,passages:this.passages.map(e=>({id:e.node.attrs.pid as string,path:e.path,signature:signature(e.node)}))};}
}
export class IdentitySession implements IdentityPort {
 private book:IdentityBookDocument;
 private editors=new Map<string,ChapterEditor>();
 private references=new Map<string,PassageReference>();
 private items=new Map<string,{item:ReviewItemValue;reviewId:string;rejected:boolean}>();
 private requests=new Map<string,ReviewRequest>();
 private revision:number;
 constructor(readonly document:Document,input:unknown,reviewData?:unknown){
  const raw=input as {formatVersion?:unknown};
  if(raw?.formatVersion==='neo-lifecycle/v1'){const legacy=Book.parse(input);this.book={...legacy,formatVersion:'neo-identity/v1',chapters:legacy.chapters.map(c=>({...c,version:uuid(),passages:[]}))};for(const c of legacy.chapters)this.editors.set(c.id,new ChapterEditor(this,c.id,c.html,this.book.chapters.find(p=>p.id===c.id)!.version));}
  else {this.book=IdentityBook.parse(input);for(const c of this.book.chapters)this.editors.set(c.id,new ChapterEditor(this,c.id,c.html,c.version,c.passages));}
  this.revision=this.book.revision;
  if(reviewData){const reviews=ReviewFile.parse(reviewData);if(reviews.bookId!==this.book.metadata.id)throw new Error('INVALID_REVIEW_BOOK');for(const saved of reviews.references){if(this.references.has(saved.reference.id))throw new Error('DUPLICATE_REFERENCE');this.references.set(saved.reference.id,saved.reference);const e=this.editors.get(saved.reference.chapterId);if(!e)throw new Error('INVALID_REFERENCE');e.restore(saved.reference.id,saved);}
   for(const r of reviews.reviews){if(this.items.has(r.item.id)||r.item.references.some(id=>!this.references.has(id)))throw new Error('INVALID_REVIEW');this.items.set(r.item.id,{item:r.item,reviewId:r.reviewId,rejected:r.state==='rejected'});if(r.state==='accepted'){const ref=this.references.get(r.item.references[0])!;this.editor(ref.chapterId).accepted.add(r.item.id);}}
  }
 }
 changed(){this.revision++;}
 editor(id:string){const e=this.editors.get(id);if(!e)throw new Error('NOT_FOUND');return e;}
 passages(){return Array.from(this.editors,([chapterId,e])=>e.passages.map(p=>({id:p.node.attrs.pid as string,chapterId,kind:p.node.type.name,text:runText(runs(p.node.content)),size:p.node.content.size}))).flat();}
 capture(chapterId:string,passageId:string,from:number,to:number){const e=this.editor(chapterId),p=e.passages.find(p=>p.node.attrs.pid===passageId);if(!p||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>p.node.content.size||to<=from)throw new Error('INVALID_REFERENCE');const expected=runs(p.node.content.cut(from,to));const ref=Reference.parse({id:uuid(),chapterId,passageId,from,to,version:e.version,expected,text:runText(expected)});this.references.set(ref.id,ref);e.register(ref.id,{from:p.pos+1+from,to:p.pos+1+to,deleted:false,unresolved:false});return structuredClone(ref);}
 resolve(id:string):ReferenceResolution{const ref=this.references.get(id);if(!ref)return {status:'unresolved',segments:[],text:''};const e=this.editor(ref.chapterId),loc=e.locations.get(id);if(!loc||loc.unresolved)return {status:'unresolved',segments:[],text:''};if(loc.deleted)return {status:'deleted',segments:[],text:''};const segments=e.segments(loc),content=e.content(loc);return {status:segments.length===0?'deleted':JSON.stringify(content)===JSON.stringify(ref.expected)?'current':'changed',segments,text:runText(content)};}
 extract(ids:string[],category:ReviewRequest['category']){const request=ReviewInput.parse({requestId:uuid(),bookId:this.book.metadata.id,revision:this.revision,category,extracts:ids.map(id=>{const ref=this.references.get(id);if(!ref||this.resolve(id).status!=='current')throw new Error('STALE');const e=this.editor(ref.chapterId),loc=e.locations.get(id)!;const runs=e.content(loc);return {reference:ref,chapterVersion:e.version,currentSegments:this.resolve(id).segments,passageOrder:e.passages.findIndex(p=>p.node.attrs.pid===this.resolve(id).segments[0].passageId),chapterOrder:this.book.chapters.findIndex(c=>c.id===ref.chapterId),passageKind:e.passages.find(p=>p.node.attrs.pid===this.resolve(id).segments[0].passageId)!.node.type.name,runs,text:runText(runs)};})});this.requests.set(request.requestId,request);return structuredClone(request);}
 receive(output:unknown){const result=ReviewOutput.parse(output),request=this.requests.get(result.requestId);if(!request)throw new Error('UNKNOWN_REQUEST');const allowed=new Set(request.extracts.map(e=>e.reference.id));const ids=new Set<string>();for(const item of result.items){if(ids.has(item.id)||this.items.has(item.id)||item.references.some(r=>!allowed.has(r)))throw new Error('INVALID_REVIEW');ids.add(item.id);}for(const item of result.items)this.items.set(item.id,{item,reviewId:result.reviewId,rejected:false});}
 reviews():ReviewState[]{return structuredClone(Array.from(this.items.values(),r=>({...r.item,state:r.rejected?'rejected':Array.from(this.editors.values()).some(e=>e.accepted.has(r.item.id))?'accepted':'pending'})));}
 accept(id:string):Outcome{const row=this.items.get(id);if(!row||row.item.kind!=='suggestion')return {ok:false,code:'NOT_FOUND'};if(row.rejected)return {ok:false,code:'REJECTED'};if(this.reviews().find(r=>r.id===id)?.state==='accepted')return {ok:true};const ref=this.references.get(row.item.references[0])!,resolved=this.resolve(ref.id),e=this.editor(ref.chapterId),loc=e.locations.get(ref.id);if(resolved.status!=='current'||!loc)return {ok:false,code:'STALE'};if(resolved.segments.length!==1||ref.expected.some(r=>r.kind!=='text'))return {ok:false,code:'UNSUPPORTED_TARGET'};
  const fragment=e.state.doc.slice(loc.from,loc.to).content;const textNodes=fragment.content;if(textNodes.some(n=>!n.isText)||textNodes.some(n=>!n.sameMarkup(textNodes[0])))return {ok:false,code:'UNSUPPORTED_TARGET'};
  const tr=closeHistory(e.state.tr);if(row.item.replacement)tr.replaceWith(loc.from,loc.to,identitySchema.text(row.item.replacement,textNodes[0]?.marks));else tr.delete(loc.from,loc.to);tr.setMeta('accepted',id);e.dispatch(tr);return {ok:true};}
 reject(id:string):Outcome{const row=this.items.get(id);if(!row)return {ok:false,code:'NOT_FOUND'};if(this.reviews().find(r=>r.id===id)?.state==='accepted')return {ok:false,code:'STALE'};row.rejected=true;return {ok:true};}
 move(chapterId:string,passageId:string,targetIndex:number){const e=this.editor(chapterId);const p=e.passages.find(p=>p.node.attrs.pid===passageId);if(!p||p.path.length!==1||!Number.isInteger(targetIndex)||targetIndex<0||targetIndex>=e.state.doc.childCount)throw new Error('UNSUPPORTED_MOVE');const oldIndex=p.path[0];if(oldIndex===targetIndex)return;
  const tr=closeHistory(e.state.tr).delete(p.pos,p.pos+p.node.nodeSize);let target=0;for(let i=0;i<targetIndex;i++)target+=tr.doc.child(i).nodeSize;tr.insert(target,p.node).setMeta('relocate',{start:p.pos,end:p.pos+p.node.nodeSize,target});e.dispatch(tr);
 }
 checkpoint():Checkpoint{const book=IdentityBook.parse({...this.book,revision:this.revision,chapters:Array.from(this.editors.values(),e=>e.checkpoint())});const reviews=ReviewFile.parse({formatVersion:'neo-reviews/v1',bookId:book.metadata.id,references:Array.from(this.references.values(),reference=>{const e=this.editor(reference.chapterId),loc=e.locations.get(reference.id)!;return {reference,version:e.version,location:{segments:e.segments(loc),deleted:loc.deleted,unresolved:loc.unresolved}};}),reviews:Array.from(this.items.values(),r=>({item:r.item,reviewId:r.reviewId,state:this.reviews().find(i=>i.id===r.item.id)!.state}))});return {book,reviews};}
 legacyEnvelope(){const saved=this.checkpoint().book;return Book.parse({...saved,formatVersion:'neo-lifecycle/v1',chapters:saved.chapters.map(c=>({id:c.id,html:c.html}))});}
}
