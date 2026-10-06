import { z } from 'zod';
import { storyKinds } from '@leafloom/document-contracts';
import type { ChapterRow, OutlineCard, OutlineSceneMeasurement, WalkingOutlineNote } from '@leafloom/editor-contracts';
import type { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { chapterSegments, hasClass, sectionId, type SectionNote } from './outline-segments';
import { sectionsFrom } from './model';
import { partTitle } from './chapter-labels';
import { countNodeWords } from './word-count';
export const sectionNotes = (metadata: unknown) => z.record(z.string(), z.array(z.object({ id: z.string(), text: z.string() }).catchall(z.json()))).parse((metadata as Record<string, unknown>).sectionNotes ?? {});
export const chapterNotes = (metadata: unknown) => z.record(z.string(), z.string()).parse((metadata as Record<string, unknown>).chapterNotes ?? {});
export const looseNotes = (metadata: unknown) => z.array(z.object({ id: z.string(), text: z.string() }).catchall(z.json())).parse((metadata as Record<string, unknown>).looseCards ?? []);
export function nodeHasFlag(node: PMNode) {
  let flag = node.type.name === 'placeholder';
  node.descendants((child) => { if (child.type.name === 'placeholder') flag = true; });
  return flag;
}
const firstLine = (nodes: PMNode[]) => nodes.filter((node) => !hasClass(node, 'ghost')).map((node) => node.textContent.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
export const quotedExcerpt = (text: string) => text ? '“' + (text.length > 220 ? text.slice(0, 220).trim() + '…' : text) + '”' : '';
const wordsIn = (nodes: PMNode[]) => nodes.filter((node) => !hasClass(node, 'ghost')).reduce((sum, node) => sum + countNodeWords(node), 0);
export function proseOutlineCards(doc: PMNode, rows: ChapterRow[]): OutlineCard[] {
  const metadata = doc.attrs.metadata, notes = sectionNotes(metadata), chapters = chapterNotes(metadata), result: OutlineCard[] = [],
    solo = rows.filter((row) => storyKinds.some((kind) => kind === row.kind)).length === 1;
  for (const row of rows) {
    const owner = sectionsFrom(doc).find((section) => section.node.attrs.id === row.id)!;
    if (row.kind === 'part') {
      result.push({ key: 'part:' + row.id, kind: 'part', chapterId: row.id, label: row.label + (partTitle(owner.node) ? ' · ' + partTitle(owner.node) : ''), note: '', excerpt: '', words: 0, written: false, virtual: false, flag: false, first: true, last: true });
      continue;
    }
    if (!storyKinds.some((kind) => kind === row.kind)) continue;
    const segments = chapterSegments(owner.node, notes[row.id] ?? []), opening = segments[0] && !segments[0].id ? segments[0] : null,
      chapter: OutlineCard = { key: 'chapter:' + row.id, kind: 'chapter', chapterId: row.id, label: solo ? 'The story' : row.kind === 'chapter' ? String(row.number) : row.label,
        segmentIndex: opening ? 0 : -1, note: chapters[row.id] ?? '', excerpt: quotedExcerpt(firstLine(opening?.paragraphs ?? [])), words: wordsIn(Array.from(owner.node.content.content)), written: false, virtual: false,
        flag: nodeHasFlag(owner.node), first: true, last: false, passageId: opening?.paragraphs[0]?.attrs.pid },
      run = [chapter];
    let letter = 0;
    for (const [index, segment] of segments.entries()) {
      if (segment === opening) continue;
      const words = wordsIn(segment.paragraphs);
      run.push({ key: 'segment:' + row.id + ':' + (segment.paragraphs[0]?.attrs.pid ?? segment.break?.attrs.pid ?? index), kind: 'section', chapterId: row.id, segmentIndex: index,
        ...(segment.id ? { sectionId: segment.id } : {}), label: String.fromCharCode(65 + letter++ % 26), note: notes[row.id]?.find((note) => note.id === segment.id)?.text ?? '',
        excerpt: quotedExcerpt(firstLine(segment.paragraphs)), words, written: words > 0, ghost: Boolean(segment.paragraphs[0] && hasClass(segment.paragraphs[0], 'ghost')), virtual: false, flag: segment.paragraphs.some(nodeHasFlag), first: false, last: false,
        passageId: segment.paragraphs[0]?.attrs.pid });
    }
    const onPage = new Set(segments.map((segment) => segment.id));
    for (const note of notes[row.id] ?? []) if (!onPage.has(note.id)) run.push({ key: 'virtual:' + note.id, kind: 'section', chapterId: row.id, segmentIndex: -1, sectionId: note.id,
      label: String.fromCharCode(65 + letter++ % 26), note: note.text, excerpt: '', words: 0, written: false, virtual: true, flag: false, first: false, last: false });
    run[run.length - 1].last = true;
    result.push(...run);
  }
  return result;
}
export function looseOutlineCards(doc: PMNode): OutlineCard[] {
  return looseNotes(doc.attrs.metadata).map((note) => ({ key: 'loose:' + note.id, kind: 'loose', chapterId: '', looseId: note.id, label: '', note: note.text, excerpt: '', words: 0, written: false, virtual: false, flag: false, first: false, last: false }));
}
export type SceneSegment = { chapterId: string; nodes: PMNode[]; passageId: string; index: number; sceneId: string | null };
export function sceneSegments(doc: PMNode): SceneSegment[] {
  const notes = z.record(z.string(), z.string()).parse(doc.attrs.metadata.sceneNotes ?? {}), result: SceneSegment[] = [], claimed = new Set<string>();
  for (const chapter of sectionsFrom(doc)) {
    if (chapter.node.attrs.role !== 'chapter') continue;
    let current: SceneSegment | null = null;
    chapter.node.forEach((node) => {
      if (node.attrs.screenplay === 'scene-heading') {
        const id = String(node.attrs.data?.['data-scene-id'] ?? '');
        current = { chapterId: chapter.node.attrs.id, nodes: [], passageId: node.attrs.pid, index: result.length, sceneId: id && id in notes && !claimed.has(id) ? id : null };
        if (current.sceneId) claimed.add(current.sceneId);
        result.push(current);
      }
      if (current) current.nodes.push(node);
    });
  }
  return result;
}
export function sceneOutlineCards(doc: PMNode, measurements: ReadonlyMap<string, OutlineSceneMeasurement>): OutlineCard[] {
  const notes = z.record(z.string(), z.string()).parse(doc.attrs.metadata.sceneNotes ?? {});
  return sceneSegments(doc).map((scene) => {
    const cast = [...new Set(scene.nodes.filter((node) => node.attrs.screenplay === 'character').map((node) => node.textContent.replace(/\(.*?\)/g, '').replace(/\^$/, '').trim().toUpperCase()).filter(Boolean))],
      action = scene.nodes.slice(1).find((node) => (node.attrs.screenplay ?? 'action') === 'action' && node.textContent.trim()),
      measured = scene.nodes.map((node) => measurements.get(node.attrs.pid)),
      lines = measured.every(Boolean) ? measured.reduce((sum, line) => sum + line!.lines + line!.before, 0) : null;
    return { key: 'scene:' + scene.passageId, kind: 'scene', chapterId: scene.chapterId, passageId: scene.passageId, sceneIndex: scene.index,
      ...(scene.sceneId ? { sceneId: scene.sceneId } : {}), label: String(scene.index + 1), slug: scene.nodes[0].textContent.trim(), cast,
      eighths: lines === null ? null : Math.max(1, Math.round(lines / 54 * 8)), note: scene.sceneId ? notes[scene.sceneId] : '', excerpt: quotedExcerpt(action?.textContent.replace(/\s+/g, ' ').trim() ?? ''),
      words: wordsIn(scene.nodes), written: true, virtual: false, flag: scene.nodes.some(nodeHasFlag), first: false, last: false };
  });
}
export function walkingOutlineNote(state: EditorState): WalkingOutlineNote | null {
  if (state.doc.attrs.metadata.format === 'screenplay') return null;
  const point = state.selection.$from, pid = point.parent.attrs.pid;
  if (!pid || hasClass(point.parent, 'ghost') || hasClass(point.parent, 'scene-break')) return null;
  // A walking note belongs to the caret's own chapter. Other chapter nodes
  // are immutable and need no segmentation during this input projection.
  const owner = point.depth >= 1 ? point.node(1) : null;
  if (!owner || owner.type.name !== 'section' || owner.attrs.role !== 'chapter') return null;
  const notes = sectionNotes(state.doc.attrs.metadata)[owner.attrs.id] ?? [];
  if (!notes.length) return null;
  for (const segment of chapterSegments(owner, notes)) {
    if (!segment.id || !segment.paragraphs.some((node) => node.attrs.pid === pid) || segment.paragraphs.some((node) => hasClass(node, 'ghost'))) continue;
    const note: SectionNote | undefined = notes.find((note) => note.id === segment.id);
    if (note?.text && !note.dismissed) return { chapterId: owner.attrs.id, sectionId: segment.id, passageId: pid, text: note.text };
  }
  return null;
}
