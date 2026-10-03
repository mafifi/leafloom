import { ManuscriptSchema, ProposalSchema } from './contracts';
import type { Block, Manuscript, Proposal, Run, Selection } from './contracts';
export const textOf = (block: Block): string => block.runs.map(r => r.text).join('');
export const newId = (kind: string): string => `${kind}-${crypto.randomUUID()}`;
export function splitRuns(runs: Run[], at: number): [Run[], Run[]] {
  const left: Run[] = [], right: Run[] = []; let pos = 0;
  for (const run of runs) { const cut = Math.max(0, Math.min(run.text.length, at - pos));
    if (cut) left.push({ ...run, text: run.text.slice(0, cut) });
    if (cut < run.text.length) right.push({ ...run, text: run.text.slice(cut) }); pos += run.text.length;
  } return [left, right];
}
export function locate(document: Manuscript, blockId: string) {
  for (const [chapterIndex, chapter] of document.chapters.entries()) { const blockIndex = chapter.blocks.findIndex(b => b.id === blockId); if (blockIndex >= 0) return { chapter, block: chapter.blocks[blockIndex], chapterIndex, blockIndex }; }
  throw new Error('The target anchor no longer exists.');
}
export function validSelection(document: Manuscript, selection: Selection) {
  const found = locate(document, selection.blockId); const size = textOf(found.block).length;
  if (found.chapter.id !== selection.chapterId || selection.from < 0 || selection.to < selection.from || selection.to > size) throw new Error('The selection is outside its paragraph.');
  return found;
}
const clone = (doc: Manuscript): Manuscript => structuredClone(doc);
const empty = (): Block => ({ id: newId('paragraph'), kind: 'paragraph', runs: [] });
export function enter(document: Manuscript, selection: Selection, count: number): { document: Manuscript; selection: Selection } {
  const doc = clone(document); const { chapter, block, chapterIndex, blockIndex } = validSelection(doc, selection);
  if (selection.from !== selection.to) throw new Error('Select a caret position for a structural gesture.');
  if (block.kind === 'scene-break') return { document, selection };
  const previous = chapter.blocks[blockIndex - 1];
  const atStart = selection.from === 0; const blank = !textOf(block).trim();
  if (atStart && previous?.kind === 'scene-break') {
    chapter.blocks.splice(blockIndex - 1, 1);
    const moved = chapter.blocks.splice(blockIndex - 1); if (!chapter.blocks.length) chapter.blocks.push(empty());
    const next = { id: newId('chapter'), title: '', blocks: moved.length ? moved : [empty()] };
    doc.chapters.splice(chapterIndex + 1, 0, next);
    return { document: doc, selection: { chapterId: next.id, blockId: next.blocks[0].id, from: 0, to: 0 } };
  }
  if ((blank && previous) || (atStart && count >= 2 && previous)) {
    if (blank) { block.kind = 'scene-break'; block.runs = []; const next = empty(); chapter.blocks.splice(blockIndex + 1, 0, next); return { document: doc, selection: { ...selection, blockId: next.id, from: 0, to: 0 } }; }
    const scene: Block = { id: newId('scene'), kind: 'scene-break', runs: [] };
    if (!textOf(previous).trim()) { previous.kind = 'scene-break'; previous.runs = []; }
    else chapter.blocks.splice(blockIndex, 0, scene);
    return { document: doc, selection };
  }
  const [left, right] = splitRuns(block.runs, selection.from); block.runs = left;
  const next: Block = { id: newId('paragraph'), kind: 'paragraph', runs: right };
  chapter.blocks.splice(blockIndex + 1, 0, next);
  return { document: doc, selection: { ...selection, blockId: next.id, from: 0, to: 0 } };
}
export function backspace(document: Manuscript, selection: Selection): { document: Manuscript; selection: Selection } {
  const doc = clone(document); const found = validSelection(doc, selection); const { chapter, block, chapterIndex, blockIndex } = found;
  if (selection.from !== 0 || selection.to !== 0) return { document, selection };
  const previous = chapter.blocks[blockIndex - 1];
  if (previous?.kind === 'scene-break') { chapter.blocks.splice(blockIndex - 1, 1); return { document: doc, selection }; }
  if (previous) { const at = textOf(previous).length; previous.runs.push(...block.runs); chapter.blocks.splice(blockIndex, 1); return { document: doc, selection: { ...selection, blockId: previous.id, from: at, to: at } }; }
  if (chapterIndex > 0) { const preceding = doc.chapters[chapterIndex - 1]; while(preceding.blocks.at(-1)?.kind==='scene-break')preceding.blocks.pop();if(!preceding.blocks.length)preceding.blocks.push(empty());const last = preceding.blocks.at(-1)!;
    const at = textOf(last).length; last.runs.push(...block.runs); preceding.blocks.push(...chapter.blocks.slice(1)); doc.chapters.splice(chapterIndex, 1);
    return { document: doc, selection: { chapterId: preceding.id, blockId: last.id, from: at, to: at } };
  } return { document, selection };
}
export function archiveSelection(document: Manuscript, selection: Selection): { document: Manuscript; selection: Selection } {
  const doc = clone(document); const { chapter, block } = validSelection(doc, selection);
  if (selection.to <= selection.from) throw new Error('Select a passage to keep in Darlings.');
  const original = textOf(block); const [left, rest] = splitRuns(block.runs, selection.from); const [removed, right] = splitRuns(rest, selection.to - selection.from);
  doc.darlings.unshift({ id: newId('darling'), chapterId: chapter.id, blockId: block.id, offset: selection.from, runs: removed, prefix: original.slice(0, selection.from).slice(-60), suffix: original.slice(selection.to, selection.to + 60) });
  block.runs = [...left, ...right]; return { document: doc, selection: { ...selection, to: selection.from } };
}
export function restoreDarling(document: Manuscript, id: string): { document: Manuscript; selection: Selection } {
  const doc = clone(document); const darling = doc.darlings.find(d => d.id === id); if (!darling) throw new Error('Darling no longer exists.');
  const { chapter, block } = locate(doc, darling.blockId); if(block.kind==='scene-break')throw new Error('Darling target became a scene marker; restore needs review.');const current = textOf(block); const candidates: number[] = [];
  for (let at = 0; at <= current.length; at++) { const before = current.slice(0, at); const after = current.slice(at);
    if ((!darling.prefix || before.endsWith(darling.prefix)) && (!darling.suffix || after.startsWith(darling.suffix))) candidates.push(at);
  }
  // A surviving suffix can re-anchor after a prefix edit. Ambiguity always requires review.
  if (!candidates.length && darling.suffix) for (let at = 0; at <= current.length; at++) if (current.slice(at).startsWith(darling.suffix)) candidates.push(at);
  if (!candidates.length && darling.prefix) for (let at = 0; at <= current.length; at++) if (current.slice(0, at).endsWith(darling.prefix)) candidates.push(at);
  if (candidates.length !== 1) throw new Error('Darling anchor changed or is ambiguous; restore needs review.');
  const at = candidates[0]; const [left, right] = splitRuns(block.runs, at); block.runs = [...left, ...darling.runs, ...right]; doc.darlings = doc.darlings.filter(d => d.id !== id);
  return { document: doc, selection: { chapterId: chapter.id, blockId: block.id, from: at, to: at + darling.runs.reduce((n,r) => n+r.text.length,0) } };
}
/** Conservative single-change rebase. Multiple separated changes spanning the target require a fresh review. */
export function applyProposal(document: Manuscript, raw: Proposal): { document: Manuscript; selection: Selection } {
  const proposal = ProposalSchema.parse(raw); const doc = clone(document); const { chapter, block } = locate(doc, proposal.blockId);
  if (proposal.sourceRevision > document.revision || proposal.sourceBlockText.slice(proposal.from, proposal.to) !== proposal.expected) throw new Error('Proposal source is invalid.');
  const current = textOf(block), source = proposal.sourceBlockText; let from = proposal.from, to = proposal.to;
  if (current !== source && source && current.indexOf(source) >= 0 && current.indexOf(source) === current.lastIndexOf(source)) { const shift = current.indexOf(source); from += shift; to += shift; }
  else if (current !== source) { let start = 0; while (start < Math.min(source.length,current.length) && source[start] === current[start]) start++;
    let suffix = 0; while (suffix < source.length-start && suffix < current.length-start && source[source.length-1-suffix] === current[current.length-1-suffix]) suffix++;
    const oldEnd = source.length - suffix, newEnd = current.length - suffix;
    if (oldEnd <= from) { const shift = newEnd - oldEnd; from += shift; to += shift; }
    else if (start < to) throw new Error('The proposal target changed; request another review.');
  }
  if (current.slice(from,to) !== proposal.expected) throw new Error('The proposal target changed; request another review.');
  const [left, rest] = splitRuns(block.runs, from); const [,right] = splitRuns(rest,to-from); block.runs = [...left,...proposal.replacement,...right];
  ManuscriptSchema.parse(doc); return { document: doc, selection: { chapterId: chapter.id, blockId: block.id, from, to: from+proposal.replacement.reduce((n,r)=>n+r.text.length,0) } };
}
