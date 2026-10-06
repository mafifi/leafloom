import { z } from 'zod';
import type { OutlineCardTarget } from '@leafloom/editor-contracts';
import type { Transaction } from 'prosemirror-state';
import { bookSchema, sectionsFrom } from './model';
import { sceneSegments, type SceneSegment } from './outline-card-projection';
import { replaceChapterContent, repointSectionStickies } from './outline-segments';
import type { OutlineData } from './outline-moves';
export function resolveScene(tr: Transaction, target: OutlineCardTarget): SceneSegment {
  const scenes = sceneSegments(tr.doc), scene = target.passageId ? scenes.find((scene) => scene.passageId === target.passageId) : scenes[target.sceneIndex ?? -1];
  if (!scene) throw Error('INVALID_OUTLINE_TARGET');
  return scene;
}
export function saveSceneCard(tr: Transaction, data: OutlineData, target: OutlineCardTarget, text: string, slug?: string) {
  const scene = resolveScene(tr, target), owner = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === scene.chapterId)!,
    notes = z.record(z.string(), z.string()).parse(data.metadata.sceneNotes ?? {}), first = scene.nodes[0];
  let node = first;
  if (slug !== undefined) {
    const value = slug.replace(/\s[–—]\s/g, ' - ');
    if (value !== first.textContent) node = node.type.create(node.attrs, value ? bookSchema.text(value) : undefined, node.marks);
  }
  let id = scene.sceneId;
  if (text !== (id ? notes[id] : '') && (id || text)) {
    id ??= crypto.randomUUID();
    notes[id] = text;
    node = node.type.create({ ...node.attrs, data: { ...node.attrs.data, 'data-scene-id': id } }, node.content, node.marks);
  }
  const children = Array.from(owner.node.content.content).map((child) => child === first ? node : child);
  replaceChapterContent(tr, scene.chapterId, children);
  data.metadata.sceneNotes = notes;
}
export function insertSceneCard(tr: Transaction, data: OutlineData, after: number, text: string, slug: string): OutlineCardTarget {
  const scenes = sceneSegments(tr.doc), scene = scenes[after], first = scenes[0],
    owner = scene ? sectionsFrom(tr.doc).find((section) => section.node.attrs.id === scene.chapterId)!
      : after < 0 && first ? sectionsFrom(tr.doc).find((section) => section.node.attrs.id === first.chapterId)!
      : sectionsFrom(tr.doc).filter((section) => section.node.attrs.role === 'chapter').at(-1);
  if (!owner) throw Error('INVALID_OUTLINE_TARGET');
  const children = Array.from(owner.node.content.content), id = text ? crypto.randomUUID() : null,
    pid = crypto.randomUUID(), normalized = slug.replace(/\s[–—]\s/g, ' - '),
    heading = bookSchema.nodes.paragraph.create({ pid, class: 'sp-heading', screenplay: 'scene-heading', data: id ? { 'data-scene-id': id } : {} }, normalized ? bookSchema.text(normalized) : undefined),
    action = bookSchema.nodes.paragraph.create({ pid: crypto.randomUUID(), screenplay: 'action' });
  let at = scene ? children.indexOf(scene.nodes.at(-1)!) + 1 : first && after < 0 ? children.indexOf(first.nodes[0]) : children.length;
  if (!scene && !(first && after < 0) && children.length > 1 && !children.at(-1)!.textContent.trim() && (children.at(-1)!.attrs.screenplay ?? 'action') === 'action') { children.pop(); at--; }
  children.splice(at, 0, heading, action);
  replaceChapterContent(tr, owner.node.attrs.id, children);
  if (id) data.metadata.sceneNotes = { ...z.record(z.string(), z.string()).parse(data.metadata.sceneNotes ?? {}), [id]: text };
  return { kind: 'scene', chapterId: owner.node.attrs.id, passageId: pid };
}
export function moveSceneCard(tr: Transaction, data: OutlineData, source: OutlineCardTarget, before: number): boolean {
  const scene = resolveScene(tr, source), scenes = sceneSegments(tr.doc), target = scenes[before];
  if (before === scene.index || before === scene.index + 1) return false;
  const from = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === scene.chapterId)!,
    oldChildren = Array.from(from.node.content.content), offset = oldChildren.slice(0, oldChildren.indexOf(scene.nodes[0])).reduce((sum, node) => sum + node.nodeSize, 0),
    start = from.pos + 1 + offset, end = start + scene.nodes.reduce((sum, node) => sum + node.nodeSize, 0);
  replaceChapterContent(tr, scene.chapterId, oldChildren.filter((node) => !scene.nodes.includes(node)));
  const receiverId = target?.chapterId ?? sectionsFrom(tr.doc).filter((section) => section.node.attrs.role === 'chapter').at(-1)!.node.attrs.id,
    receiver = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === receiverId)!, nodes = Array.from(receiver.node.content.content);
  const at = target ? nodes.findIndex((node) => node.attrs.pid === target.passageId) : nodes.length;
  nodes.splice(at < 0 ? nodes.length : at, 0, ...scene.nodes);
  replaceChapterContent(tr, receiverId, nodes);
  repointSectionStickies(data.metadata, scene.nodes, receiverId);
  const current = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === receiverId)!;
  let position = current.pos + 1;
  current.node.forEach((node, offset) => { if (node.attrs.pid === scene.passageId) position = current.pos + 1 + offset; });
  tr.setMeta('relocate', { start, end, target: position });
  return true;
}
