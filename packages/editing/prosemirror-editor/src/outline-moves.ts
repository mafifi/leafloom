import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { MetadataValue } from '@leafloom/document-contracts';
import { bookSchema, sectionsFrom } from './model';
import { removeChapterMetadata } from './metadata';
import { chapterSegments, hasClass, orderSectionNotes, repointSectionStickies, replaceChapterContent, sceneBreak, type SectionNote } from './outline-segments';
export type OutlineData = { metadata: MetadataValue; chapters: Record<string, string>; sections: Record<string, SectionNote[]> };
const children = (node: PMNode) => Array.from(node.content.content);
const blank = (nodes: PMNode[]) => !nodes.some((node) => node.textContent.trim() || hasClass(node, 'scene-break') || hasClass(node, 'ghost') || containsPlaceholder(node));
function containsPlaceholder(node: PMNode) {
  let found = false;
  node.descendants((child) => { if (child.type.name === 'placeholder') found = true; });
  return found;
}
export function joinOutlineChapter(tr: Transaction, data: OutlineData, fromId: string, intoId: string): string {
  const from = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === fromId)!,
    into = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === intoId)!,
    id = crypto.randomUUID(),
    titles = data.metadata.chapterTitles as Record<string, string> | undefined,
    note: SectionNote = { id, text: (data.chapters[fromId] ?? '').trim() || (titles?.[fromId] ?? '').trim() },
    moving = children(from.node), destination = children(into.node),
    hasLines = moving.some((node) => node.textContent.trim() || containsPlaceholder(node));
  const originalStart = from.pos + 1, originalEnd = from.pos + from.node.nodeSize - 1;
  let removedOpeningSize = 0;
  if (hasLines) {
    if (blank(destination)) destination.length = 0;
    else if (!hasClass(destination.at(-1)!, 'scene-break')) destination.push(sceneBreak(id));
    if (hasClass(moving[0], 'scene-break') && destination.length && hasClass(destination.at(-1)!, 'scene-break'))
      removedOpeningSize = moving.shift()!.nodeSize;
    const opening = moving[0];
    if (opening && !hasClass(opening, 'scene-break') && !hasClass(opening, 'ghost'))
      moving[0] = opening.type.create({ ...opening.attrs, data: { ...opening.attrs.data, 'data-sec-id': id } }, opening.content, opening.marks);
    repointSectionStickies(data.metadata, moving, intoId);
    if (note.text && opening && (hasClass(opening, 'scene-break') || hasClass(opening, 'ghost'))) {
      const ghost = bookSchema.nodes.paragraph.create({ class: 'ghost', data: { 'data-sec-id': id }, pid: crypto.randomUUID() }, bookSchema.text(note.text));
      if (hasClass(opening, 'scene-break')) destination.push(sceneBreak(id), ghost);
      else destination.push(ghost, sceneBreak(id));
    }
    destination.push(...moving);
  }
  if (!hasLines && note.text) {
    if (destination.some((node) => node.textContent.trim()) && !hasClass(destination.at(-1)!, 'scene-break')) destination.push(sceneBreak(id));
    destination.push(bookSchema.nodes.paragraph.create({ class: 'ghost', data: { 'data-sec-id': id }, pid: crypto.randomUUID() }, bookSchema.text(note.text)));
  }
  (data.sections[intoId] ??= []).push(note, ...(data.sections[fromId] ?? []));
  delete data.sections[fromId];
  delete data.chapters[fromId];
  removeChapterMetadata(data.metadata, fromId);
  // Source deletion and destination insertion share one author transaction.
  tr.delete(from.pos, from.pos + from.node.nodeSize);
  replaceChapterContent(tr, intoId, destination);
  const target = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === intoId)!;
  if (hasLines && moving.length) {
    const first = moving[0];
    let offset = 0;
    target.node.forEach((node, pos) => { if (node.attrs.pid === first.attrs.pid) offset = pos; });
    tr.setMeta('relocate', { start: originalStart + removedOpeningSize, end: originalEnd, target: target.pos + 1 + offset });
  }
  data.sections[intoId] = orderSectionNotes(sectionsFrom(tr.doc).find((section) => section.node.attrs.id === intoId)!.node, data.sections[intoId]);
  return id;
}
export function moveOutlineSection(tr: Transaction, data: OutlineData, fromId: string, segmentIndex: number, to: { chapterId: string; before: number | null }): boolean {
  const source = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === fromId),
    destination = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === to.chapterId);
  if (!source || !destination) throw Error('INVALID_OUTLINE_TARGET');
  const segments = chapterSegments(source.node, data.sections[fromId] ?? []), segment = segments[segmentIndex],
    targets = fromId === to.chapterId ? segments : chapterSegments(destination.node, data.sections[to.chapterId] ?? []),
    target = to.before === null ? null : targets[to.before];
  if (!segment || (to.before !== null && !target)) throw Error('INVALID_OUTLINE_TARGET');
  if (target === segment || (fromId === to.chapterId && (to.before === segmentIndex + 1 || (to.before === null && segmentIndex === segments.length - 1)))) return false;
  const sourceNodes = children(source.node), lifted = [...(segment.break ? [segment.break] : []), ...segment.paragraphs],
    first = lifted[0], startIndex = sourceNodes.indexOf(first),
    start = source.pos + 1 + sourceNodes.slice(0, startIndex).reduce((sum, node) => sum + node.nodeSize, 0),
    end = start + lifted.reduce((sum, node) => sum + node.nodeSize, 0),
    remaining = sourceNodes.filter((node) => !lifted.includes(node));
  if (!segment.break && remaining[0] && hasClass(remaining[0], 'scene-break')) remaining.shift();
  replaceChapterContent(tr, fromId, remaining);
  const liveDestination = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === to.chapterId)!,
    result = children(liveDestination.node), targetFirst = target?.break ?? target?.paragraphs[0];
  let at = targetFirst ? result.indexOf(targetFirst) : result.length;
  if (at < 0) at = 0;
  if (!target && blank(result)) { result.length = 0; at = 0; result.push(...segment.paragraphs); }
  else if (target && !target.break) result.splice(at, 0, ...segment.paragraphs, segment.break ?? sceneBreak());
  else {
    const separator = segment.break ?? sceneBreak();
    if (target || !result.at(-1) || !hasClass(result.at(-1)!, 'scene-break')) result.splice(at++, 0, separator);
    result.splice(at, 0, ...segment.paragraphs);
  }
  replaceChapterContent(tr, to.chapterId, result);
  if (segment.id && fromId !== to.chapterId) {
    const note = (data.sections[fromId] ?? []).find((note) => note.id === segment.id);
    data.sections[fromId] = (data.sections[fromId] ?? []).filter((note) => note.id !== segment.id);
    if (note) (data.sections[to.chapterId] ??= []).push(note);
  }
  for (const id of new Set([fromId, to.chapterId]))
    data.sections[id] = orderSectionNotes(sectionsFrom(tr.doc).find((section) => section.node.attrs.id === id)!.node, data.sections[id] ?? []);
  repointSectionStickies(data.metadata, segment.paragraphs, to.chapterId);
  const finalDestination = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === to.chapterId)!;
  let offset = 0;
  finalDestination.node.forEach((node, pos) => { if (node.attrs.pid === segment.paragraphs[0]?.attrs.pid) offset = pos; });
  const openingSize = segment.break?.nodeSize ?? 0;
  tr.setMeta('relocate', { start: start + openingSize, end, target: finalDestination.pos + 1 + offset });
  return true;
}
