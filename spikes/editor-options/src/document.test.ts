import { describe, it, expect } from 'vitest';
import { createFixture } from './fixture';
import { enter, backspace, archiveSelection, restoreDarling, applyProposal, splitRuns, textOf } from './document';
import type { Proposal } from './contracts';
const caret = (blockId = 'opening', from = 10, to = from) => ({ chapterId: 'chapter-one', blockId, from, to });
const proposal = (): Proposal => ({ id: 'proposal-1', sourceRevision: 0, skill: 'voice-review', blockId: 'opening', from: 0, to: 25, expected: 'The lighthouse was quiet.', sourceBlockText: 'The lighthouse was quiet. Too quiet.', replacement: [{ text: 'The lighthouse stood silent.' }], explanation: 'A focused alternative.' });
describe('author workflow', () => {
  it('splits formatted text through paragraph, scene, chapter and reverses chapter boundary', () => {
    let result = enter(createFixture(), caret('opening', 26), 1);
    expect(result.document.chapters[0].blocks).toHaveLength(4);
    expect(result.document.chapters[0].blocks[1].runs).toEqual([{ text: 'Too quiet.', italic: true }]);
    result = enter(result.document, result.selection, 2);
    expect(result.document.chapters[0].blocks[1].kind).toBe('scene-break');
    result = enter(result.document, result.selection, 3);
    expect(result.document.chapters).toHaveLength(3);
    expect(textOf(result.document.chapters[1].blocks[0])).toBe('Too quiet.');
    const merged = backspace(result.document, result.selection);
    expect(merged.document.chapters).toHaveLength(2);
    expect(merged.selection.from).toBe(26);
  });
  it('archives a formatted passage and restores after an unrelated prefix edit', () => {
    const result = archiveSelection(createFixture(), caret('opening', 26, 36));
    expect(result.document.darlings[0].runs).toEqual([{ text: 'Too quiet.', italic: true }]);
    result.document.chapters[0].blocks[0].runs.unshift({ text: 'Listen. ' });
    const restored = restoreDarling(result.document, result.document.darlings[0].id);
    expect(textOf(restored.document.chapters[0].blocks[0])).toBe('Listen. The lighthouse was quiet. Too quiet.');
    expect(restored.document.darlings).toHaveLength(0);
  });
  it('refuses to restore a darling into a deleted block', () => {
    const result = archiveSelection(createFixture(), caret('opening', 26, 36));
    result.document.chapters[0].blocks.shift();
    expect(() => restoreDarling(result.document, result.document.darlings[0].id)).toThrow('anchor');
  });
  it('accepts an older proposal after unrelated author edits', () => {
    const doc = createFixture(); doc.revision = 1; doc.chapters[1].blocks[0].runs[0].text += ' Again.';
    const result = applyProposal(doc, proposal());
    expect(textOf(result.document.chapters[0].blocks[0])).toBe('The lighthouse stood silent. Too quiet.');
    expect(result.document.chapters[0].blocks[0].runs.at(-1)?.italic).toBe(true);
  });
  it('refuses an older proposal if its target was edited', () => {
    const doc = createFixture(); doc.revision = 1; doc.chapters[0].blocks[0].runs[0].text = 'The tower was quiet. ';
    expect(() => applyProposal(doc, proposal())).toThrow('changed');
  });
  it('rebases a proposal over a prefix insertion without overwriting author words', () => {
    const doc = createFixture(); doc.revision = 1; doc.chapters[0].blocks[0].runs.unshift({ text: 'Tonight, ' });
    expect(textOf(applyProposal(doc, proposal()).document.chapters[0].blocks[0])).toBe('Tonight, The lighthouse stood silent. Too quiet.');
  });
  it('splits Unicode strings without losing their formatting', () => {
    const [left, right] = splitRuns([{ text: 'été ', italic: true }, { text: '海', bold: true }], 4);
    expect(left).toEqual([{ text: 'été ', italic: true }]); expect(right).toEqual([{ text: '海', bold: true }]);
  });
});

it('refuses to restore archived prose into a scene marker',()=>{const result=archiveSelection(createFixture(),caret('weather',0, 'Beyond the glass, the sea kept its own counsel.'.length));const target=result.document.chapters[0].blocks[1];target.kind='scene-break';target.runs=[];expect(()=>restoreDarling(result.document,result.document.darlings[0].id)).toThrow('scene');});
it('joins across a chapter whose predecessor ends in a scene marker',()=>{const doc=createFixture();doc.chapters[0].blocks.push({id:'tail-scene',kind:'scene-break',runs:[]});const result=backspace(doc,{chapterId:'chapter-two',blockId:'return',from:0,to:0});expect(result.document.chapters).toHaveLength(1);expect(result.document.chapters[0].blocks.some(b=>b.id==='tail-scene')).toBe(false);expect(textOf(result.document.chapters[0].blocks[2])).toContain('At sunrise');});
