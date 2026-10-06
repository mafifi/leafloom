import { z } from 'zod';
import { storyKinds } from '@leafloom/document-contracts';
import type { OutlineCardInsertion, OutlineCardTarget, OutlineDropSide, OutlineSceneMeasurement } from '@leafloom/editor-contracts';
import { closeHistory } from 'prosemirror-history';
import type { OutlineContext } from './outline';
import { bookSchema, sectionsFrom } from './model';
import { chapterSegments, hasClass, orderSectionNotes, replaceChapterContent, repointSectionStickies, type SectionNote } from './outline-segments';
import { proseOutlineCards, sceneOutlineCards, looseOutlineCards, looseNotes, sceneSegments, walkingOutlineNote } from './outline-card-projection';
import { cardData, cardSection, parseCardTarget, placeCardGhost, writeCardData } from './outline-card-data';
import { joinOutlineChapter, moveOutlineSection } from './outline-moves';
import { syncOutlineGhosts } from './outline-ghosts';
import { insertSceneCard, moveSceneCard, resolveScene, saveSceneCard } from './outline-scene-operations';
const textValue = (value: string) => z.string().parse(value).replace(/\s+/g, ' ').trim();
/** Commands use the same live editor and history; measurements are disposable projection inputs. */
export class OutlineBoardOperations {
  private measurements = new Map<string, OutlineSceneMeasurement>();
  constructor(private readonly context: OutlineContext) {}
  private get state() { return this.context.state(); }
  private supported(id: string) {
    if (this.context.supported && !this.context.supported(id)) throw Error('UNSUPPORTED_TARGET');
  }
  get cards() { return this.state.doc.attrs.metadata.format === 'screenplay' ? sceneOutlineCards(this.state.doc, this.measurements) : proseOutlineCards(this.state.doc, this.context.chapters()); }
  get looseCards() { return looseOutlineCards(this.state.doc); }
  get walkingNote() { return walkingOutlineNote(this.state); }
  measurement(id:string) { return this.measurements.get(id); }
  measure(value: OutlineSceneMeasurement[]) {
    const parsed = z.array(z.strictObject({ passageId: z.string(), lines: z.number().positive(), before: z.number().nonnegative(), page: z.number().int().positive().optional(), fill: z.number().int().nonnegative().optional() })).parse(value),
      next = new Map(parsed.map((line) => [line.passageId, line]));
    if (JSON.stringify([...next]) === JSON.stringify([...this.measurements])) return;
    this.measurements = next;
    this.context.dispatch(this.state.tr, 'outline.measure');
  }
  save(target: OutlineCardTarget, text: string, slug?: string) {
    target = parseCardTarget(target);
    if (target.kind !== 'loose') this.supported(target.chapterId);
    const data = cardData(this.state.doc), tr = closeHistory(this.state.tr), value = textValue(text);
    if (target.kind === 'chapter') data.chapters[target.chapterId] = value;
    else if (target.kind === 'loose') {
      const cards = looseNotes(data.metadata), card = cards.find((card) => card.id === target.looseId);
      if (!card) throw Error('INVALID_OUTLINE_TARGET');
      card.text = value;
      data.metadata.looseCards = value ? cards : cards.filter((card) => card.id !== target.looseId);
    } else if (target.kind === 'scene') saveSceneCard(tr, data, target, value, slug === undefined ? undefined : textValue(slug));
    else {
      const { chapter, segment } = cardSection(tr.doc, target, data), list = data.sections[target.chapterId] ??= [];
      if (target.sectionId) {
        const note = list.find((note) => note.id === target.sectionId);
        if (!note) throw Error('INVALID_OUTLINE_TARGET');
        note.text = value;
        syncOutlineGhosts(tr, target.chapterId, list);
      } else if (value) {
        const anchor = segment?.paragraphs.find((node) => !hasClass(node, 'ghost'));
        if (!anchor) throw Error('INVALID_OUTLINE_TARGET');
        const note: SectionNote = { id: crypto.randomUUID(), text: value };
        list.push(note);
        const children = Array.from(chapter.node.content.content).map((node) => node === anchor ? node.type.create({ ...node.attrs, data: { ...node.attrs.data, 'data-sec-id': note.id } }, node.content, node.marks) : node);
        replaceChapterContent(tr, target.chapterId, children);
        data.sections[target.chapterId] = orderSectionNotes(sectionsFrom(tr.doc).find((section) => section.node.attrs.id === target.chapterId)!.node, list);
      }
    }
    writeCardData(tr, data);
    if (!tr.doc.eq(this.state.doc)) this.context.dispatch(tr, 'outline.card.edit');
  }
  insert(location: OutlineCardInsertion, text = '', slug = ''): OutlineCardTarget | null {
    location = z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('chapter'), afterChapterId: z.string().nullable() }),
      z.strictObject({ kind: z.literal('section'), chapterId: z.string(), afterSegment: z.number().int().min(-1) }),
      z.strictObject({ kind: z.literal('scene'), afterScene: z.number().int().min(-1) }),
      z.strictObject({ kind: z.literal('loose') }),
    ]).parse(location);
    const data = cardData(this.state.doc), tr = closeHistory(this.state.tr), value = textValue(text);
    let result: OutlineCardTarget;
    if (location.kind === 'chapter') {
      const id = crypto.randomUUID(), owner = location.afterChapterId === null ? null : this.context.section(location.afterChapterId);
      tr.insert(owner ? owner.pos + owner.node.nodeSize : 0, this.context.createChapter(id));
      data.chapters[id] = value;
      result = { kind: 'chapter', chapterId: id };
    } else if (location.kind === 'loose') {
      const id = crypto.randomUUID();
      data.metadata.looseCards = [...looseNotes(data.metadata), { id, text: value }];
      result = { kind: 'loose', chapterId: '', looseId: id };
    } else if (location.kind === 'scene') {
      if (!value && !textValue(slug)) return null;
      const scenes = sceneSegments(tr.doc), owner = scenes[location.afterScene]?.chapterId ?? scenes[0]?.chapterId ?? this.context.chapters().at(-1)?.id;
      if (!owner) throw Error('INVALID_OUTLINE_TARGET');
      this.supported(owner);
      result = insertSceneCard(tr, data, location.afterScene, value, textValue(slug));
    } else {
      if (!value) return null;
      this.supported(location.chapterId);
      const id = crypto.randomUUID(), note = { id, text: value }, owner = this.context.section(location.chapterId), list = data.sections[location.chapterId] ??= [], segments = chapterSegments(owner.node, list),
        before = location.afterSegment + 1 < segments.length ? location.afterSegment + 1 : null;
      list.push(note);
      placeCardGhost(tr, location.chapterId, note, before, list);
      data.sections[location.chapterId] = orderSectionNotes(sectionsFrom(tr.doc).find((section) => section.node.attrs.id === location.chapterId)!.node, list);
      result = { kind: 'section', chapterId: location.chapterId, sectionId: id };
    }
    writeCardData(tr, data);
    this.context.dispatch(tr, 'outline.card.insert');
    return result;
  }
  removeNote(target: OutlineCardTarget) {
    target = parseCardTarget(target);
    if (target.kind !== 'loose') this.supported(target.chapterId);
    const data = cardData(this.state.doc), tr = closeHistory(this.state.tr);
    if (target.kind === 'chapter') delete data.chapters[target.chapterId];
    else if (target.kind === 'loose') data.metadata.looseCards = looseNotes(data.metadata).filter((note) => note.id !== target.looseId);
    else if (target.kind === 'scene') {
      const scene = resolveScene(tr, target), notes = z.record(z.string(), z.string()).parse(data.metadata.sceneNotes ?? {});
      if (scene.sceneId) delete notes[scene.sceneId];
      data.metadata.sceneNotes = notes;
    } else {
      data.sections[target.chapterId] = (data.sections[target.chapterId] ?? []).filter((note) => note.id !== target.sectionId);
      syncOutlineGhosts(tr, target.chapterId, data.sections[target.chapterId]);
    }
    writeCardData(tr, data);
    if (!tr.doc.eq(this.state.doc)) this.context.dispatch(tr, 'outline.card.remove-note');
  }
  dismissWalk() {
    const walking = this.walkingNote;
    if (!walking) return;
    const data = cardData(this.state.doc), note = data.sections[walking.chapterId].find((note) => note.id === walking.sectionId)!;
    note.dismissed = true;
    const tr = closeHistory(this.state.tr);
    writeCardData(tr, data);
    this.context.dispatch(tr, 'outline.walk.dismiss');
  }
  promote(target: OutlineCardTarget): OutlineCardTarget | null {
    target = parseCardTarget(target);
    if (target.kind !== 'section') return null;
    this.supported(target.chapterId);
    const data = cardData(this.state.doc), tr = closeHistory(this.state.tr), { chapter, segment } = cardSection(tr.doc, target, data);
    if (!segment) return null;
    const children = Array.from(chapter.node.content.content), moved = [...(segment.break ? [segment.break] : []), ...segment.paragraphs], remaining = children.filter((node) => !moved.includes(node)),
      oldStart = chapter.pos + 1 + children.slice(0, children.indexOf(segment.paragraphs[0])).reduce((sum, node) => sum + node.nodeSize, 0),
      prose = segment.paragraphs.filter((node) => !hasClass(node, 'ghost')).map((node) => { const attrs = { ...node.attrs, data: { ...node.attrs.data } }; delete attrs.data['data-sec-id']; return node.type.create(attrs, node.content, node.marks); }), id = crypto.randomUUID(),
      note = segment.id ? data.sections[target.chapterId]?.find((note) => note.id === segment.id) : null;
    if (!segment.break && remaining[0] && hasClass(remaining[0], 'scene-break')) remaining.shift();
    replaceChapterContent(tr, target.chapterId, remaining);
    const live = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === target.chapterId)!, template = this.context.createChapter(id), node = prose.length ? template.copy(bookSchema.nodes.section.create(null, prose).content) : template;
    tr.insert(live.pos + live.node.nodeSize, node);
    if (note?.text) data.chapters[id] = note.text;
    if (segment.id) data.sections[target.chapterId] = data.sections[target.chapterId].filter((note) => note.id !== segment.id);
    repointSectionStickies(data.metadata, prose, id);
    if (prose.length) {
      // Removed plans consume old positions but no positions in the promoted writing.
      let start = oldStart, target = live.pos + live.node.nodeSize + 1;
      const ranges = [];
      for (const paragraph of segment.paragraphs) {
        if (!hasClass(paragraph, 'ghost')) { ranges.push({ start, end: start + paragraph.nodeSize, target }); target += paragraph.nodeSize; }
        start += paragraph.nodeSize;
      }
      tr.setMeta('relocate', ranges);
    }
    writeCardData(tr, data); this.context.dispatch(tr, 'outline.card.promote');
    return { kind: 'chapter', chapterId: id };
  }
  drop(source: OutlineCardTarget, target: OutlineCardTarget | 'loose', side: OutlineDropSide): boolean {
    side = z.enum(['before', 'after', 'into']).parse(side);
    source = parseCardTarget(source);
    if (source.kind !== 'loose') this.supported(source.chapterId);
    if (target !== 'loose') { target = parseCardTarget(target); this.supported(target.chapterId); }
    const data = cardData(this.state.doc), tr = closeHistory(this.state.tr);
    if (target === 'loose') {
      if (source.kind !== 'section') return false;
      const card = this.cards.find((card) => card.kind === 'section' && card.chapterId === source.chapterId && (source.sectionId ? card.sectionId === source.sectionId : card.passageId === source.passageId));
      if (!card || card.written || card.virtual || !card.sectionId) return false;
      const note = data.sections[source.chapterId].find((note) => note.id === card.sectionId)!;
      data.sections[source.chapterId] = data.sections[source.chapterId].filter((note) => note.id !== card.sectionId);
      data.metadata.looseCards = [...looseNotes(data.metadata), { id: crypto.randomUUID(), text: note.text }];
      syncOutlineGhosts(tr, source.chapterId, data.sections[source.chapterId]);
    } else if (target.kind === 'scene') {
      const before = resolveScene(tr, target).index + (side === 'after' ? 1 : 0);
      if (source.kind === 'scene') { if (!moveSceneCard(tr, data, source, before)) return false; }
      else if (source.kind === 'loose') {
        const note = looseNotes(data.metadata).find((note) => note.id === source.looseId);
        if (!note) return false;
        data.metadata.looseCards = looseNotes(data.metadata).filter((note) => note.id !== source.looseId);
        insertSceneCard(tr, data, before - 1, note.text, '');
      } else return false;
    } else if (source.kind === 'chapter') {
      const rows = this.context.chapters(), from = rows.findIndex((row) => row.id === source.chapterId), into = rows.findIndex((row) => row.id === target.chapterId);
      if (side === 'into') {
        if (source.chapterId === target.chapterId || ![source.chapterId, target.chapterId].every((id) => rows.some((row) => row.id === id && storyKinds.some((kind) => kind === row.kind)))) return false;
        joinOutlineChapter(tr, data, source.chapterId, target.chapterId);
      } else {
        const at = into + (side === 'after' ? 1 : 0);
        if (from < 0 || into < 0 || at === from || at === from + 1) return false;
        const owner = this.context.section(source.chapterId), nodes = Array.from(tr.doc.content.content);
        nodes.splice(from, 1); nodes.splice(at > from ? at - 1 : at, 0, owner.node);
        tr.delete(owner.pos, owner.pos + owner.node.nodeSize);
        const index = nodes.indexOf(owner.node), position = nodes.slice(0, index).reduce((sum, node) => sum + node.nodeSize, 0);
        tr.insert(position, owner.node);
        tr.setMeta('relocate', { start: owner.pos, end: owner.pos + owner.node.nodeSize, target: position });
      }
    } else {
      let chapterId = target.chapterId, before: number | null = null;
      const owner = this.context.section(chapterId), segs = chapterSegments(owner.node, data.sections[chapterId] ?? []);
      if (side !== 'into') {
        if (target.kind === 'chapter') {
          if (side === 'before') {
            const rows = this.context.chapters(), at = rows.findIndex((row) => row.id === chapterId), previous = rows.slice(0, at).reverse().find((row) => storyKinds.some((kind) => kind === row.kind));
            if (previous) chapterId = previous.id;
            else before = segs[0] && !segs[0].id && segs.length > 1 ? 1 : segs[0]?.id ? 0 : null;
          } else before = segs[0] && !segs[0].id && segs.length > 1 ? 1 : segs[0]?.id ? 0 : null;
        } else { const at = cardSection(tr.doc, target, data).index; before = side === 'before' ? at < 0 ? null : at : at + 1 < segs.length && at >= 0 ? at + 1 : null; }
      }
      this.supported(chapterId);
      if (source.kind === 'loose') {
        const note = looseNotes(data.metadata).find((note) => note.id === source.looseId);
        if (!note) return false;
        data.metadata.looseCards = looseNotes(data.metadata).filter((note) => note.id !== source.looseId);
        const fresh = { id: crypto.randomUUID(), text: note.text }, list = data.sections[chapterId] ??= [];
        list.push(fresh);
        if (fresh.text) placeCardGhost(tr, chapterId, fresh, before, list);
        data.sections[chapterId] = orderSectionNotes(sectionsFrom(tr.doc).find((section) => section.node.attrs.id === chapterId)!.node, list);
      } else if (source.kind === 'section') {
        const from = cardSection(tr.doc, source, data);
        if (!from.segment) {
          if (!source.sectionId || source.chapterId === chapterId) return false;
          const note = data.sections[source.chapterId]?.find((note) => note.id === source.sectionId);
          if (!note) return false;
          data.sections[source.chapterId] = data.sections[source.chapterId].filter((note) => note.id !== source.sectionId);
          (data.sections[chapterId] ??= []).push(note);
        } else if (!moveOutlineSection(tr, data, source.chapterId, from.index, { chapterId, before })) return false;
      } else return false;
    }
    writeCardData(tr, data); this.context.dispatch(tr, 'outline.card.drop'); return true;
  }
}
