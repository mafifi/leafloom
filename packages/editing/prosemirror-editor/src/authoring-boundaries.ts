import type { Node } from 'prosemirror-model';
export function hasBlockClass(node: Node | null | undefined, name: string): boolean {
  return String(node?.attrs.class ?? '')
    .split(/\s+/)
    .includes(name);
}
/** Source space-safe deletion keeps the preceding styled space and consumes its following seam. */
export function deletionRange(doc: Node, from: number, to: number): { from: number; to: number } {
  const start = doc.resolve(from),
    end = doc.resolve(to);
  if (!start.sameParent(end) || start.parent.type.name !== 'paragraph') return { from, to };
  // Inline atoms and soft breaks occupy model positions and stop a whitespace seam.
  const before = start.parent.textBetween(0, start.parentOffset, '', () => '\ufffc');
  const after = end.parent.textBetween(
    end.parentOffset,
    end.parent.content.size,
    '',
    () => '\ufffc',
  );
  const spaces = before.endsWith(' ') ? (after.match(/^ +/)?.[0].length ?? 0) : 0;
  return { from, to: to + spaces };
}
