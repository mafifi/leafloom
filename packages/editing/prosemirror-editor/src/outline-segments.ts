import { type Node as PMNode } from 'prosemirror-model';
import { bookSchema, sectionsFrom } from './model';
import type { Transaction } from 'prosemirror-state';
import type { MetadataValue } from '@leafloom/document-contracts';
export type SectionNote = { id: string; text: string; [key: string]: unknown };
export type OutlineSegment = { break: PMNode | null; paragraphs: PMNode[]; id: string | null };
export const hasClass = (node: PMNode, name: string) => String(node.attrs.class ?? '').split(/\s+/).includes(name);
export const sectionId = (node: PMNode) => String(node.attrs.data?.['data-sec-id'] ?? '');
export const sceneBreak = (id?: string) => bookSchema.nodes.paragraph.create(
  { class: 'scene-break', data: id ? { 'data-sec-brk': id } : {}, pid: crypto.randomUUID() },
  bookSchema.text('***'),
);
export function chapterSegments(node: PMNode, notes: SectionNote[]): OutlineSegment[] {
  const segments: OutlineSegment[] = [];
  let current: OutlineSegment = { break: null, paragraphs: [], id: null };
  node.forEach((child) => {
    if (hasClass(child, 'scene-break')) {
      segments.push(current);
      current = { break: child, paragraphs: [], id: null };
    } else current.paragraphs.push(child);
  });
  segments.push(current);
  const known = new Set(notes.map((note) => note.id)), claimed = new Set<string>();
  for (const segment of segments) {
    const owner = segment.paragraphs.find((paragraph) => known.has(sectionId(paragraph)) && !claimed.has(sectionId(paragraph)));
    if (owner) { segment.id = sectionId(owner); claimed.add(segment.id); }
  }
  return segments;
}
export function orderSectionNotes(node: PMNode, notes: SectionNote[]): SectionNote[] {
  const ids = chapterSegments(node, notes).map((segment) => segment.id).filter(Boolean);
  return [...ids.map((id) => notes.find((note) => note.id === id)!), ...notes.filter((note) => !ids.includes(note.id))];
}
export function replaceChapterContent(tr: Transaction, chapterId: string, children: PMNode[]) {
  const chapter = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === chapterId);
  if (!chapter) throw Error('INVALID_OUTLINE_TARGET');
  const desired = children.length ? children : [bookSchema.nodes.paragraph.create({ pid: crypto.randomUUID() })];
  const existing = Array.from(chapter.node.content.content);
  let position = chapter.pos + 1;
  for (const child of desired) {
    const index = existing.findIndex((node) => node === child || (node.attrs.pid && node.attrs.pid === child.attrs.pid));
    if (index < 0) tr.insert(position, child);
    else {
      for (let skip = 0; skip < index; skip++) {
        tr.delete(position, position + existing[0].nodeSize);
        existing.shift();
      }
      const previous = existing.shift()!;
      if (!previous.eq(child)) {
        if (previous.type === child.type && previous.content.eq(child.content))
          tr.setNodeMarkup(position, child.type, child.attrs, child.marks);
        else tr.replaceWith(position, position + previous.nodeSize, child);
      }
    }
    position += child.nodeSize;
  }
  for (const node of existing) tr.delete(position, position + node.nodeSize);
}
export function repointSectionStickies(metadata: MetadataValue, paragraphs: PMNode[], chapterId: string) {
  const ids = new Set<string>();
  for (const paragraph of paragraphs) paragraph.descendants((node) => {
    if (node.attrs.sid) ids.add(String(node.attrs.sid));
    if (node.attrs.data?.['data-sid']) ids.add(String(node.attrs.data['data-sid']));
  });
  if (Array.isArray(metadata.stickies)) metadata.stickies = metadata.stickies.map((sticky) => {
    if (sticky && typeof sticky === 'object' && !Array.isArray(sticky) && ids.has(String(sticky.id)))
      return { ...sticky, chapterId };
    return sticky;
  });
}
