import { ProposalSchema } from './contracts';
import type { Manuscript, Selection, WritingAgent } from './contracts';
import { validSelection, textOf } from './document';
/** Repeatable provider for the proposal/cancellation/race contract, not a model-quality test. */
export function createDeterministicAgent(delayMs=1500): WritingAgent {
 return { async review(document:Manuscript,selection:Selection,signal:AbortSignal) {
  const {block}=validSelection(document,selection); const source=textOf(block); const expected=source.slice(selection.from,selection.to);
  if(!expected.trim())throw new Error('Select a passage for review.');
  await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Review cancelled','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},delayMs); if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
  return ProposalSchema.parse({id:crypto.randomUUID(),sourceRevision:document.revision,skill:'specific-image/v1',blockId:block.id,from:selection.from,to:selection.to,expected,sourceBlockText:source,replacement:[{text:expected.replace(/was quiet/g,'stood silent').replace(/somebody/g,'a stranger')}],explanation:'Deterministic fixture: replace a general description with a more specific image. This tests the editing protocol, not writing quality.'});
 }};
}
