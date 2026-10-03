import type { IdentityPort } from './contracts';
import type { describe, it, expect } from 'vitest';
export function runConformance(test:{describe:typeof describe;it:typeof it;expect:typeof expect},factory:()=>IdentityPort){
 test.describe('portable identity/review conformance',()=>{
  test.it('extracts contract-owned values without changing the document',()=>{const s=factory(),before=s.checkpoint().book,p=s.passages()[0],ref=s.capture(p.chapterId,p.id,0,p.size);const input=s.extract([ref.id],'voice');test.expect(input.extracts[0].text).toBe(p.text);test.expect(s.checkpoint().book).toEqual(before);test.expect(input.bookId).toBe(before.metadata.id);});
  test.it('review rejection is idempotent and never edits the manuscript',()=>{const s=factory(),p=s.passages()[0],ref=s.capture(p.chapterId,p.id,0,p.size),input=s.extract([ref.id],'voice');const before=s.checkpoint().book;s.receive({reviewId:'review',requestId:input.requestId,items:[{id:'suggestion',kind:'suggestion',category:'voice',references:[ref.id],message:'Try a quieter verb.',replacement:'Mara said.'}]});test.expect(s.reject('suggestion')).toEqual({ok:true});test.expect(s.reject('suggestion')).toEqual({ok:true});test.expect(s.accept('suggestion')).toEqual({ok:false,code:'REJECTED'});test.expect(s.checkpoint().book).toEqual(before);});
 });
}
