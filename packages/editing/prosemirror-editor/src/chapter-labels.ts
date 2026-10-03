import type { ChapterRow, ContentsRow } from '@leafloom/editor-contracts';
import { storyKinds } from '@leafloom/document-contracts';
import type { Node as PMNode } from 'prosemirror-model';
import type { Section } from './model';
export const roman = (number: number) => {
  let remaining = number,
    label = '';
  for (const [value, symbol] of [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ] as const)
    while (remaining >= value) {
      label += symbol;
      remaining -= value;
    }
  return label;
};
export function projectChapters(
  sections: readonly Section[],
  restartNumbering: boolean,
): ChapterRow[] {
  let chapterNumber = 0,
    partNumber = 0;
  return sections
    .filter((section) => section.node.attrs.role === 'chapter')
    .map((section) => {
      const id = String(section.node.attrs.id),
        title = String(section.node.attrs.title),
        kind = String(section.node.attrs.kind);
      let number: number | null = null,
        label: string;
      if (kind === 'part') {
        number = ++partNumber;
        label = 'Part ' + roman(number);
        if (restartNumbering) chapterNumber = 0;
      } else if (kind === 'chapter') {
        number = ++chapterNumber;
        label = 'Chapter ' + number;
      } else
        label =
          kind === 'unnumbered'
            ? title.trim() || 'Untitled'
            : kind === 'about'
              ? 'About the Author'
              : kind.charAt(0).toUpperCase() + kind.slice(1);
      return { id, title, kind, number, label };
    });
}
export function projectContents(
  chapters: readonly ChapterRow[],
  nodeFor: (id: string) => PMNode,
  customChapterTitles = false,
): ContentsRow[] {
  const story = chapters.filter(
      (chapter) => storyKinds.some((kind) => kind === chapter.kind) || chapter.kind === 'part',
    ),
    solo = story.length === 1 && story[0].kind === 'chapter' ? story[0].id : null,
    rows: ContentsRow[] = [];
  let inPart = false;
  for (const chapter of chapters) {
    if (chapter.kind === 'part') inPart = true;
    else if (['epilogue', 'acknowledgments', 'about'].includes(chapter.kind)) inPart = false;
    if (
      ['copyright', 'dedication', 'epigraph', 'contents'].includes(chapter.kind) ||
      chapter.id === solo
    )
      continue;
    const isStory = storyKinds.some((kind) => kind === chapter.kind),
      title = chapter.title.trim();
    let label = isStory
      ? chapter.kind === 'unnumbered'
        ? title || chapter.label
        : title
          ? customChapterTitles
            ? title
            : chapter.label + ' — ' + title
          : chapter.label
      : chapter.label;
    if (chapter.kind === 'part') {
      const title = partTitle(nodeFor(chapter.id));
      if (title) label += ': ' + title;
    }
    rows.push({
      chapterId: chapter.id,
      label,
      type: chapter.kind === 'part' ? 'part' : isStory ? 'chapter' : 'page',
      level: inPart && chapter.kind !== 'part' ? 1 : 0,
    });
  }
  return rows;
}

export function storyEndIndex(chapters: readonly ChapterRow[]): number {
  const last = chapters.map((chapter) => chapter.kind).lastIndexOf('chapter');
  if (last >= 0) return last + 1;
  let at = chapters.length;
  while (at > 0 && ['epilogue', 'acknowledgments', 'about'].includes(chapters[at - 1].kind)) at--;
  return at;
}

/** A Part takes its title from the first prose line, before its quotation. */
export function partTitle(node: PMNode): string {
  const ghostIds = new Set<string>();
  node.descendants((child) => {
    if (
      String(child.attrs.class).split(/\s+/).includes('ghost') &&
      child.attrs.data?.['data-sec-id']
    )
      ghostIds.add(String(child.attrs.data['data-sec-id']));
  });
  const paragraphs: { node: PMNode; text: string }[] = [];
  node.descendants((child) => {
    if (child.type.name !== 'paragraph') return;
    const classes = String(child.attrs.class).split(/\s+/);
    if (classes.includes('ghost') || ghostIds.has(String(child.attrs.data?.['data-sec-brk'] ?? '')))
      return false;
    const text = child
      .textBetween(0, child.content.size, '\n', (leaf) =>
        leaf.type.name === 'hard_break' ? '\n' : '',
      )
      .replace(/\u00a0/g, ' ')
      .trim();
    if (text || classes.includes('scene-break')) paragraphs.push({ node: child, text });
    return false;
  });
  const first = paragraphs[0];
  return !first ||
    String(first.node.attrs.class).split(/\s+/).includes('scene-break') ||
    /^(?:[—–]|--?\s)/.test(first.text)
    ? ''
    : first.text;
}
