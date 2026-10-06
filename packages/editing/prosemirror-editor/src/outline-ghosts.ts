import type { Transaction } from 'prosemirror-state';
import { bookSchema, sectionsFrom } from './model';
import { hasClass, replaceChapterContent, sceneBreak, sectionId } from './outline-segments';
/** Reconcile plans in place. Authored sections and existing ghost positions are stable. */
export function syncOutlineGhosts(tr: Transaction, id: string, list: { id: string; text: string }[]) {
  const section = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === id);
  if (!section) return;
  const original = Array.from(section.node.content.content), children = [...original],
    notes = new Map(list.map((note) => [note.id, note]));
  for (const ghost of original.filter((node) => hasClass(node, 'ghost') && sectionId(node))) {
    const index = children.indexOf(ghost), note = notes.get(sectionId(ghost));
    if (note?.text) {
      if (ghost.textContent !== note.text) children[index] = ghost.type.create(ghost.attrs, bookSchema.text(note.text), ghost.marks);
      continue;
    }
    const previous = children[index - 1], next = children[index + 1];
    if (previous && hasClass(previous, 'scene-break') && (!next || hasClass(next, 'scene-break')))
      children.splice(index - 1, 2);
    else if (!previous && next && hasClass(next, 'scene-break')) children.splice(index, 2);
    else children.splice(index, 1);
  }
  for (const [index, note] of list.entries()) {
    if (!note.text || children.some((node) => sectionId(node) === note.id)) continue;
    let before = -1;
    for (let next = index + 1; next < list.length && before < 0; next++) {
      before = children.findIndex((node) => sectionId(node) === list[next].id);
      if (before >= 0) while (before > 0 && !hasClass(children[before], 'scene-break')) before--;
    }
    const ghost = bookSchema.nodes.paragraph.create(
      { class: 'ghost', data: { 'data-sec-id': note.id }, pid: crypto.randomUUID() }, bookSchema.text(note.text),
    );
    if (before >= 0) {
      if (hasClass(children[before], 'scene-break')) children.splice(before, 0, sceneBreak(note.id), ghost);
      else children.splice(before, 0, ghost, sceneBreak(note.id));
    } else {
      if (children.some((node) => node.textContent.trim()) && !hasClass(children.at(-1)!, 'scene-break')) children.push(sceneBreak(note.id));
      children.push(ghost);
    }
  }
  if (children.length === original.length && children.every((node, index) => node.eq(original[index]))) return;
  replaceChapterContent(tr, id, children);
}
