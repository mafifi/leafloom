// @vitest-environment jsdom
import { get } from 'svelte/store';
import { it, expect } from 'vitest';
import { fixture } from './application-fixture';
import { nextOutlineCard } from '../../apps/desktop/src/lib/outline-board-presentation';
it('card traversal passes Part headings in both directions and stops at the board boundary', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'plotter'); await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    const core = f.vm.editor!, first = core.chapters[0].id;
    const part = core.createChapter('Journey', 1, { kind: 'part' }), next = core.createChapter('', 2);
    const cards = core.outlineCards;
    expect(cards.map(card => card.kind)).toEqual(['chapter', 'part', 'chapter']);
    expect(nextOutlineCard(cards, 'chapter:' + first, 1)?.chapterId).toBe(next);
    expect(nextOutlineCard(cards, 'chapter:' + next, -1)?.chapterId).toBe(first);
    expect(nextOutlineCard(cards, 'chapter:' + first, -1)).toBeUndefined(); expect(cards[1].chapterId).toBe(part);
  } finally { await f.close(); }
});
it('Go to a planned card selects the complete ghost and typing preserves its passage/note identity through history and durable reopen', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'plotter'); await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    const core = f.vm.editor!, owner = core.chapters[0].id;
    core.selectPassage(core.passageRows(owner)[0].id, 0); core.insert('Opening prose.');
    const target = core.insertOutlineCard({ kind: 'section', chapterId: owner, afterSegment: 0 }, 'Planned words')!;
    const card = core.outlineCards.find(card => card.sectionId === target.sectionId)!;
    expect(card.ghost).toBe(true); const pid = card.passageId!; f.vm.setPanel('outline');
    f.vm.outlineBoard.go(target); await expect.poll(() => core.selection).toEqual({ chapterId: owner, passageId: pid, from: 0, to: 13 });
    core.insert('Written words.'); expect(core.passageRows(owner).find(row => row.id === pid)?.text).toBe('Written words.');
    expect(core.outlineCards.find(card => card.sectionId === target.sectionId)).toMatchObject({ passageId: pid, note: 'Planned words', ghost: false });
    core.undo(); expect(core.passageRows(owner).find(row => row.id === pid)?.text).toBe('Planned words');
    expect(core.outlineCards.find(card => card.sectionId === target.sectionId)?.ghost).toBe(true); core.redo();
    const id = core.metadata.id; await f.vm.closeBook(); await f.vm.openBook(id);
    expect(f.vm.editor!.outlineCards.find(card => card.sectionId === target.sectionId)).toMatchObject({ passageId: pid, note: 'Planned words', ghost: false });
    expect(f.vm.editor!.html(owner)).toContain('Written words.'); expect(f.vm.editor!.html(owner)).not.toContain('Planned words');
  } finally { await f.close(); }
});
