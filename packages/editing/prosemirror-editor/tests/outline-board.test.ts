import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import type { OutlineCard } from '@leafloom/editor-contracts';
const document = new JSDOM('').window.document;
const open = (chapters: string[], metadata: Record<string, unknown> = {}) => new BookCore(document, {
  formatVersion: 'neo-lifecycle/v1', revision: 0,
  metadata: { id: 'book', title: 'Title', author: 'Writer', ...metadata },
  chapters: chapters.map((html, index) => ({ id: 'ch-' + index, html })), darlings: [],
}, null, '', '');
const target = (card: OutlineCard) => ({ kind: card.kind as 'chapter' | 'section' | 'scene' | 'loose', chapterId: card.chapterId,
  ...(card.sectionId ? { sectionId: card.sectionId } : {}), ...(card.passageId ? { passageId: card.passageId } : {}),
  ...(card.segmentIndex !== undefined ? { segmentIndex: card.segmentIndex } : {}), ...(card.looseId ? { looseId: card.looseId } : {}) });
it('manuscript cards project note-less real sections, first prose, words and owned versus virtual notes', () => {
  const core = open(['<p><i>Opening prose.</i></p><p class="scene-break">***</p><p>Unplanned section.</p><p class="scene-break">***</p><p class="ghost" data-sec-id="planned">Planned note</p>'], {
    sectionNotes: { 'ch-0': [{ id: 'planned', text: 'Planned note' }, { id: 'virtual', text: 'Not on page' }] },
  });
  expect(core.outlineCards.map((card) => [card.kind, card.label, card.note, card.excerpt, card.written, card.virtual])).toEqual([
    ['chapter', 'The story', '', '“Opening prose.”', false, false], ['section', 'A', '', '“Unplanned section.”', true, false],
    ['section', 'B', 'Planned note', '', false, false], ['section', 'C', 'Not on page', '', false, true],
  ]);
  expect(core.outlineCards[0]).toMatchObject({ words: 4, first: true, last: false });
  expect(core.outlineCards.at(-1)?.last).toBe(true);
  expect(core.outlineCards[2].words).toBe(0);
});
it('Parts project a full-width separator and non-story pages stay outside the board', () => {
  const core = open(['<p>Copyright.</p>', '<p>Journey</p>', '<p>Story.</p>'], { chapterKinds: { 'ch-0': 'copyright', 'ch-1': 'part' } });
  expect(core.outlineCards.map((card) => card.kind)).toEqual(['part', 'chapter']);
  expect(core.outlineCards[0].label).toBe('Part I · Journey');
});
it('editing an unplanned rich section creates its durable note identity without replacing author words', () => {
  const core = open(['<p>Opening.</p><p class="scene-break">***</p><p><b>Authored section.</b></p>']), card = core.outlineCards[1], pid = card.passageId!, before = core.checkpoint(), reference = core.capture(pid, 0, 'Authored section.'.length);
  core.saveOutlineCard(target(card), '  New   note  ');
  const updated = core.outlineCards[1], id = updated.sectionId;
  expect(id).toBeTruthy(); expect(updated.note).toBe('New note'); expect(updated.passageId).toBe(pid);
  expect(core.html('ch-0')).toContain('<b>Authored section.</b>');
  expect(core.html('ch-0')).not.toContain('ghost');
  expect(core.resolve(reference.id).status).toBe('current');
  core.saveOutlineCard(target(updated), 'Revised note');
  expect(core.outlineCards[1].sectionId).toBe(id);
  expect(core.resolve(reference.id).status).toBe('current');
  const saved = core.checkpoint(), reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.outlineCards[1]).toMatchObject({ sectionId: id, passageId: pid, note: 'Revised note' });
  core.undo(); core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
});
it('seam insertion places a ghost before the next physical section and Undo removes only the new plan', () => {
  const core = open(['<p><i>Opening.</i></p><p class="scene-break">***</p><p><b>Following.</b></p>']), before = core.checkpoint(), pid = core.outlineCards[1].passageId;
  expect(core.insertOutlineCard({ kind: 'section', chapterId: 'ch-0', afterSegment: 0 }, '')).toBeNull();
  const inserted = core.insertOutlineCard({ kind: 'section', chapterId: 'ch-0', afterSegment: 0 }, 'New beat')!;
  expect(core.passageRows('ch-0').map((row) => row.text)).toEqual(['Opening.', '***', 'New beat', '***', 'Following.']);
  expect(core.outlineCards[1].sectionId).toBe(inserted.sectionId);
  expect(core.outlineCards[2].passageId).toBe(pid);
  core.undo(); expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
});
it('loose cards and unwritten section placement share document history and durable metadata', () => {
  const core = open(['<p>Opening.</p>']), chapter = target(core.outlineCards[0]), loose = core.insertOutlineCard({ kind: 'loose' }, 'Loose idea')!;
  expect(core.looseOutlineCards).toHaveLength(1);
  core.dropOutlineCard(loose, chapter, 'into');
  expect(core.looseOutlineCards).toHaveLength(0);
  expect(core.outlineCards[1].note).toBe('Loose idea');
  expect(core.html('ch-0')).toContain('class="ghost"');
  core.undo(); expect(core.looseOutlineCards[0].note).toBe('Loose idea');
  core.redo();
  expect(core.dropOutlineCard(target(core.outlineCards[1]), 'loose', 'into')).toBe(true);
  expect(core.looseOutlineCards[0].note).toBe('Loose idea');
  expect(core.html('ch-0')).toBe('<p>Opening.</p>');
});
it('virtual note moves keep its identity and unsupported chapter drops leave original rich material protected', () => {
  const core = open(['<p>Opening.</p>', '<p>Receiver.</p>', '<table><tr><td>Unsupported</td></tr></table>'], { sectionNotes: { 'ch-0': [{ id: 'virtual', text: 'Virtual plan' }] } }),
    virtual = target(core.outlineCards.find((card) => card.sectionId === 'virtual')!), receiver = target(core.outlineCards.find((card) => card.kind === 'chapter' && card.chapterId === 'ch-1')!);
  core.dropOutlineCard(virtual, receiver, 'into');
  expect(core.outlineCards.find((card) => card.sectionId === 'virtual')).toMatchObject({ chapterId: 'ch-1', virtual: true });
  expect(core.html('ch-1')).toBe('<p>Receiver.</p>');
  const revision = core.revision, before = core.checkpoint();
  expect(() => core.dropOutlineCard({ kind: 'chapter', chapterId: 'ch-2' }, receiver, 'into')).toThrow('UNSUPPORTED_TARGET');
  expect(core.revision).toBe(revision); expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
});
it('walking notes follow authored ghost ownership and dismiss without entering persisted prose', () => {
  const core = open(['<p class="ghost" data-sec-id="planned">Plan</p>'], { sectionNotes: { 'ch-0': [{ id: 'planned', text: 'Plan' }] } }), pid = core.passageRows('ch-0')[0].id;
  core.selectPassage(pid, 0, 4); expect(core.walkingOutlineNote).toBeNull();
  core.insert('Authored words.');
  expect(core.walkingOutlineNote).toMatchObject({ sectionId: 'planned', passageId: pid, text: 'Plan' });
  expect(core.html('ch-0')).toBe('<p data-sec-id="planned">Authored words.</p>');
  core.dismissWalkingOutlineNote(); expect(core.walkingOutlineNote).toBeNull();
  expect(core.outlineCards[1].note).toBe('Plan');
  const saved = core.checkpoint(), reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  reopened.selectPassage(pid, 0); expect(reopened.walkingOutlineNote).toBeNull();
  expect(saved.book.chapters[0].html).not.toMatch(/walk-note|data-walk|Dismiss/);
  core.undo(); expect(core.walkingOutlineNote?.text).toBe('Plan');
});
it('scene cards use real scene runs, first claimed scene notes, cast and measured eighth-page lengths', () => {
  const core = open(['<p class="sp-heading" data-scene-id="scene-one">INT. ROOM - DAY</p><p class="sp-action">First action.</p><p class="sp-character">ADA (V.O.)</p><p class="sp-dialogue">Hello.</p><p class="sp-heading" data-scene-id="scene-one">EXT. ROAD - NIGHT</p><p class="sp-action">Second action.</p>'], { format: 'screenplay', sceneNotes: { 'scene-one': 'Owned first scene' } });
  expect(core.outlineCards).toHaveLength(2);
  expect(core.outlineCards[0]).toMatchObject({ kind: 'scene', note: 'Owned first scene', slug: 'INT. ROOM - DAY', cast: ['ADA'], excerpt: '“First action.”', eighths: null });
  expect(core.outlineCards[1].note).toBe('');
  const revision = core.revision;
  core.setOutlineSceneMeasurements(core.passageRows('ch-0').map((row) => ({ passageId: row.id, lines: 3, before: 1 })));
  expect(core.revision).toBe(revision); expect(core.outlineCards[0].eighths).toBe(2);
});
it('scene edits, reorder and loose-card scene insertion update actual rich paragraphs with Undo and reopen', () => {
  const core = open(['<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-action"><i>First action.</i></p><p class="sp-heading">EXT. ROAD - NIGHT</p><p class="sp-action"><b>Second action.</b></p>'], { format: 'screenplay' });
  const first = target(core.outlineCards[0]), second = target(core.outlineCards[1]);
  core.saveOutlineCard(first, 'First note', 'INT. HALL — DAY');
  expect(core.outlineCards[0]).toMatchObject({ note: 'First note', slug: 'INT. HALL - DAY' });
  const beforeMove = core.checkpoint();
  core.dropOutlineCard(second, first, 'before');
  expect(core.outlineCards.map((card) => card.slug)).toEqual(['EXT. ROAD - NIGHT', 'INT. HALL - DAY']);
  expect(core.html('ch-0')).toContain('<i>First action.</i>'); expect(core.html('ch-0')).toContain('<b>Second action.</b>');
  core.undo(); expect(core.checkpoint().book.chapters).toEqual(beforeMove.book.chapters);
  const loose = core.insertOutlineCard({ kind: 'loose' }, 'New scene idea')!;
  core.dropOutlineCard(loose, target(core.outlineCards[1]), 'before');
  expect(core.outlineCards).toHaveLength(3); expect(core.outlineCards[1].note).toBe('New scene idea'); expect(core.looseOutlineCards).toHaveLength(0);
  const saved = core.checkpoint(), reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.outlineCards.map((card) => [card.slug, card.note])).toEqual(core.outlineCards.map((card) => [card.slug, card.note]));
});
it('promoting a mixed planned and written segment preserves captured rich passage references after omitting ghosts', () => {
  const core = open(['<p>Opening.</p><p class="scene-break">***</p><p class="ghost" data-sec-id="mixed">Plan</p><p><b>Authored rich passage.</b></p><p class="ghost">Another plan</p><p><i>Second authored passage.</i></p><p class="scene-break">***</p><p>Following.</p>'], { sectionNotes: { 'ch-0': [{ id: 'mixed', text: 'Plan' }] } });
  const passage = core.passageRows('ch-0').find(row => row.text === 'Authored rich passage.')!, reference = core.capture(passage.id, 0, passage.text.length), before = core.checkpoint();
  const second = core.passageRows('ch-0').find(row => row.text === 'Second authored passage.')!, secondReference = core.capture(second.id, 0, second.text.length);
  const promoted = core.promoteOutlineSection(target(core.outlineCards.find(card => card.sectionId === 'mixed')!))!;
  expect(core.passageRows(promoted.chapterId)[0].id).toBe(passage.id); expect(core.html(promoted.chapterId)).toBe('<p><b>Authored rich passage.</b></p><p><i>Second authored passage.</i></p>');
  expect(core.resolve(reference.id).status).toBe('current'); expect(core.resolve(secondReference.id).status).toBe('current'); core.undo(); expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
  expect(core.resolve(reference.id).status).toBe('current'); expect(core.resolve(secondReference.id).status).toBe('current'); core.redo(); expect(core.resolve(reference.id).status).toBe('current'); expect(core.resolve(secondReference.id).status).toBe('current');
});
