import { z } from 'zod';
import { Metadata } from '@leafloom/document-contracts';
import type { OutlineCardTarget } from '@leafloom/editor-contracts';
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { chapterNotes, sectionNotes } from './outline-card-projection';
import { chapterSegments, hasClass, replaceChapterContent, sceneBreak, type SectionNote } from './outline-segments';
import { sectionsFrom } from './model';
import type { OutlineData } from './outline-moves';
export const parseCardTarget = (value: OutlineCardTarget) => z.strictObject({ kind: z.enum(['chapter', 'section', 'scene', 'loose']), chapterId: z.string(), sectionId: z.string().optional(), segmentIndex: z.number().int().min(-1).optional(), sceneIndex: z.number().int().nonnegative().optional(), passageId: z.string().optional(), looseId: z.string().optional() }).parse(value);
export function cardData(doc: PMNode): OutlineData {
  const metadata = Metadata.parse(structuredClone(doc.attrs.metadata));
  return { metadata, chapters: chapterNotes(metadata), sections: sectionNotes(metadata) };
}
export function writeCardData(tr: Transaction, data: OutlineData) {
  tr.setDocAttribute('metadata', Metadata.parse({ ...data.metadata, chapterNotes: data.chapters, sectionNotes: data.sections }));
}
export function cardSection(doc: PMNode, target: OutlineCardTarget, data: OutlineData) {
  const chapter = sectionsFrom(doc).find((section) => section.node.attrs.id === target.chapterId);
  if (!chapter) throw Error('INVALID_OUTLINE_TARGET');
  const segments = chapterSegments(chapter.node, data.sections[target.chapterId] ?? []),
    index = target.sectionId ? segments.findIndex((segment) => segment.id === target.sectionId)
      : target.passageId ? segments.findIndex((segment) => segment.paragraphs.some((node) => node.attrs.pid === target.passageId)) : target.segmentIndex ?? -1;
  return { chapter, segments, index, segment: segments[index] };
}
export function placeCardGhost(tr: Transaction, chapterId: string, note: SectionNote, before: number | null, notes: SectionNote[]) {
  const chapter = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === chapterId);
  if (!chapter) throw Error('INVALID_OUTLINE_TARGET');
  const children = Array.from(chapter.node.content.content), target = before === null ? null : chapterSegments(chapter.node, notes)[before],
    first = target?.break ?? target?.paragraphs[0], at = first ? children.indexOf(first) : -1,
    ghost = chapter.node.type.schema.nodes.paragraph.create({ class: 'ghost', data: { 'data-sec-id': note.id }, pid: crypto.randomUUID() }, chapter.node.type.schema.text(note.text));
  if (at >= 0) {
    if (hasClass(children[at], 'scene-break')) children.splice(at, 0, sceneBreak(note.id), ghost);
    else children.splice(at, 0, ghost, sceneBreak(note.id));
  } else {
    if (children.some((node) => node.textContent.trim()) && !hasClass(children.at(-1)!, 'scene-break')) children.push(sceneBreak(note.id));
    children.push(ghost);
  }
  replaceChapterContent(tr, chapterId, children);
}
