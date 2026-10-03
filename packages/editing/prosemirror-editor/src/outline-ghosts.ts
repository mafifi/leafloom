import { Fragment } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { bookSchema, sectionsFrom } from './model';
const uuid = () => crypto.randomUUID();
export function syncOutlineGhosts(
  tr: Transaction,
  id: string,
  list: { id: string; text: string }[],
) {
  const section = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === id);
  if (!section) return;
  const original = Array.from(section.node.content.content),
    ghosts = new Map(
      original
        .filter(
          (node) =>
            String(node.attrs.class).split(/\s+/).includes('ghost') &&
            node.attrs.data?.['data-sec-id'],
        )
        .map((node) => [String(node.attrs.data['data-sec-id']), node]),
    );
  const children = original.filter(
    (node) =>
      !ghosts.has(String(node.attrs.data?.['data-sec-id'] ?? '')) &&
      !ghosts.has(String(node.attrs.data?.['data-sec-brk'] ?? '')),
  );
  for (const note of list) {
    if (
      !note.text ||
      children.some(
        (node) =>
          node.attrs.data?.['data-sec-id'] === note.id &&
          !String(node.attrs.class).split(/\s+/).includes('ghost'),
      )
    )
      continue;
    const hasContent = children.some((node) => node.textContent.trim());
    if (hasContent && !String(children.at(-1)?.attrs.class).split(/\s+/).includes('scene-break'))
      children.push(
        original.find(
          (node) =>
            node.attrs.data?.['data-sec-brk'] === note.id &&
            String(node.attrs.class).split(/\s+/).includes('scene-break'),
        ) ??
          bookSchema.nodes.paragraph.create(
            { class: 'scene-break', data: { 'data-sec-brk': note.id }, pid: uuid() },
            bookSchema.text('***'),
          ),
      );
    const previous = ghosts.get(note.id);
    children.push(
      bookSchema.nodes.paragraph.create(
        {
          ...previous?.attrs,
          class: 'ghost',
          data: { ...previous?.attrs.data, 'data-sec-id': note.id },
          pid: previous?.attrs.pid ?? uuid(),
        },
        bookSchema.text(note.text),
      ),
    );
  }
  const content = Fragment.fromArray(
    children.length ? children : [bookSchema.nodes.paragraph.create({ pid: uuid() })],
  );
  if (content.eq(section.node.content)) return;
  const removals: { from: number; to: number }[] = [];
  section.node.forEach((node, offset) => {
    if (
      ghosts.has(String(node.attrs.data?.['data-sec-id'] ?? '')) ||
      ghosts.has(String(node.attrs.data?.['data-sec-brk'] ?? ''))
    )
      removals.push({
        from: section.pos + 1 + offset,
        to: section.pos + 1 + offset + node.nodeSize,
      });
  });
  for (const removal of removals.reverse()) tr.delete(removal.from, removal.to);
  const remaining = sectionsFrom(tr.doc).find((section) => section.node.attrs.id === id)!;
  let keptCount = 0;
  for (const child of original)
    if (
      !ghosts.has(String(child.attrs.data?.['data-sec-id'] ?? '')) &&
      !ghosts.has(String(child.attrs.data?.['data-sec-brk'] ?? ''))
    )
      keptCount++;
  const additions = children.slice(keptCount);
  if (additions.length)
    tr.insert(remaining.pos + remaining.node.nodeSize - 1, Fragment.fromArray(additions));
}
