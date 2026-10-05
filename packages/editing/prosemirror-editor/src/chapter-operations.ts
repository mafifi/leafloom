import { ChapterKind, Sticky } from '@leafloom/document-contracts';
import type { ChapterRow } from '@leafloom/editor-contracts';
import type { Context } from '@opentelemetry/api';
import { closeHistory } from 'prosemirror-history';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import { storyEndIndex } from './chapter-labels';
import type { SectionSource } from './core';
import { entries } from './identity';
import { removeChapterMetadata } from './metadata';
import { bookSchema, type PassageInfo } from './model';

const uuid = () => crypto.randomUUID();

export interface ChapterOperationsContext {
  section: (id: string) => Readonly<{ node: PMNode; pos: number; index: number }>;
  metadata: { [x: string]: z.core.util.JSONType; id: string; title: string; author: string };
  state: EditorState;
  supported: (id: string) => boolean;
  dispatch: (tr: Transaction, command?: string, historical?: boolean, parent?: Context) => void;
  sections: readonly Readonly<{ node: PMNode; pos: number; index: number }>[];
  chapters: ChapterRow[];
  makeSection: (
    id: string,
    role: string,
    html: string,
    title: string,
    kind?: string,
    index?: { id: string; path: number[]; signature: string }[],
    sourceStore?: Map<string, SectionSource>,
    legacyIdentity?: boolean,
  ) => PMNode;
  html: (id: string) => string;
  stickies: {
    [x: string]: z.core.util.JSONType;
    id: string;
    chapterId: string;
    text: string;
    resolved: boolean;
  }[];
  passage: (id: string) => PassageInfo | undefined;
  owner: (pos: number) => Readonly<{ node: PMNode; pos: number; index: number }> | undefined;
  canEdit: (id: string) => boolean;
}

export function setChapterKind(
  context: ChapterOperationsContext,
  id: string,
  kind: string,
  options?: { copyrightStarter?: { notice: string; rights: string } },
): void {
  kind = ChapterKind.parse(kind);
  const starter = z
    .strictObject({
      copyrightStarter: z
        .strictObject({
          notice: z.string().min(1).max(10000),
          rights: z.string().min(1).max(10000),
        })
        .optional(),
    })
    .optional()
    .parse(options)?.copyrightStarter;
  const section = context.section(id);
  if (section.node.attrs.role !== 'chapter') throw Error('INVALID_TARGET');
  const metadata = context.metadata,
    previous = z.record(z.string(), z.json()).safeParse(metadata.chapterKinds);
  metadata.chapterKinds = { ...(previous.success ? previous.data : {}), [id]: kind };
  const tr = closeHistory(context.state.tr)
    .setNodeAttribute(section.pos, 'kind', kind)
    .setDocAttribute('metadata', metadata);
  const empty = section.node.content.content.every(
    (node) =>
      node.type.name === 'paragraph' &&
      !String(node.attrs.class)
        .split(/\s+/)
        .some((name) => name === 'ghost' || name === 'scene-break') &&
      node.content.content.every(
        (child) => child.type.name === 'hard_break' || (child.isText && !child.text?.trim()),
      ),
  );
  if (kind === 'copyright' && starter && empty && context.supported(id)) {
    const paragraphs = [starter.notice, starter.rights].map((text) =>
      bookSchema.nodes.paragraph.create({ pid: uuid() }, bookSchema.text(text)),
    );
    tr.replaceWith(section.pos + 1, section.pos + section.node.nodeSize - 1, paragraphs);
  }
  context.dispatch(tr, 'chapter.kind');
}

export function createChapter(
  context: ChapterOperationsContext,
  title: string,
  index?: number,
  options?: { kind: string; copyrightStarter?: { notice: string; rights: string } },
): `${string}-${string}-${string}-${string}-${string}` {
  const entry = z
    .strictObject({
      kind: ChapterKind,
      copyrightStarter: z
        .strictObject({
          notice: z.string().min(1).max(10000),
          rights: z.string().min(1).max(10000),
        })
        .optional(),
    })
    .optional()
    .parse(options);
  title = z.string().parse(title);
  const chapters = context.sections.filter((section) => section.node.attrs.role === 'chapter');
  index ??= storyEndIndex(context.chapters);
  if (!Number.isInteger(index) || index < 0 || index > chapters.length)
    throw Error('INVALID_TARGET');
  const id = uuid(),
    kind = entry?.kind ?? 'chapter',
    emptySection = context.makeSection(id, 'chapter', '<p></p>', title, kind),
    section =
      kind === 'copyright' && entry?.copyrightStarter
        ? emptySection.copy(
            Fragment.fromArray(
              [entry.copyrightStarter.notice, entry.copyrightStarter.rights].map((text) =>
                bookSchema.nodes.paragraph.create({ pid: uuid() }, bookSchema.text(text)),
              ),
            ),
          )
        : emptySection,
    position =
      index < chapters.length
        ? chapters[index].pos
        : chapters.length
          ? chapters.at(-1)!.pos + chapters.at(-1)!.node.nodeSize
          : 0;
  const metadata = context.metadata;
  if (entry)
    metadata.chapterKinds = {
      ...z.record(z.string(), z.json()).catch({}).parse(metadata.chapterKinds),
      [id]: kind,
    };
  context.dispatch(
    closeHistory(context.state.tr).insert(position, section).setDocAttribute('metadata', metadata),
    'chapter.create',
  );
  return id;
}

export function renameChapter(context: ChapterOperationsContext, id: string, title: string): void {
  const s = context.section(id),
    metadata = context.metadata,
    previous = z.record(z.string(), z.json()).safeParse(metadata.chapterTitles);
  metadata.chapterTitles = {
    ...(previous.success ? previous.data : {}),
    [id]: z.string().parse(title),
  };
  context.dispatch(
    closeHistory(context.state.tr)
      .setNodeAttribute(s.pos, 'title', title)
      .setDocAttribute('metadata', metadata),
    'chapter.rename',
  );
}

export function duplicateChapter(
  context: ChapterOperationsContext,
  id: string,
): `${string}-${string}-${string}-${string}-${string}` {
  const source = context.section(id),
    copy = uuid(),
    section = context.makeSection(
      copy,
      'chapter',
      context.html(id),
      source.node.attrs.title + ' copy',
      source.node.attrs.kind,
    );
  context.dispatch(
    closeHistory(context.state.tr).insert(source.pos + source.node.nodeSize, section),
    'chapter.duplicate',
  );
  return copy;
}

export function deleteChapter(context: ChapterOperationsContext, id: string): void {
  const s = context.section(id);
  if (s.node.attrs.role !== 'chapter') throw Error('UNSUPPORTED_TARGET');
  const metadata = context.metadata,
    tr = closeHistory(context.state.tr),
    text = entries(s.node)
      .filter((entry) => !String(entry.node.attrs.class).split(/\s+/).includes('ghost'))
      .map((entry) =>
        entry.node.textBetween(0, entry.node.content.size, '\n', (node) =>
          node.type.name === 'hard_break' ? '\n' : '',
        ),
      )
      .join('\n')
      .trim(),
    chapter = context.chapters.find((chapter) => chapter.id === id)!;
  if (text) {
    const record = {
      id: uuid(),
      html: context.html(id),
      text: text.slice(0, 2000),
      chapterId: null,
      chapterLabel:
        chapter.kind === 'chapter' ? `deleted Chapter ${chapter.number}` : chapter.label,
      date: new Date().toISOString(),
      stickies: context.stickies.filter((sticky) => sticky.chapterId === id),
    };
    tr.setDocAttribute('darlings', [record, ...context.state.doc.attrs.darlings]);
  }
  removeChapterMetadata(metadata, id);
  context.dispatch(
    tr.delete(s.pos, s.pos + s.node.nodeSize).setDocAttribute('metadata', metadata),
    'chapter.delete',
  );
}

export function reorderChapter(context: ChapterOperationsContext, id: string, index: number): void {
  const s = context.section(id),
    chapters = context.sections.filter((s) => s.node.attrs.role === 'chapter');
  if (!Number.isInteger(index) || index < 0 || index >= chapters.length)
    throw Error('INVALID_TARGET');
  if (chapters[index].node.attrs.id === id) return;
  const tr = closeHistory(context.state.tr).delete(s.pos, s.pos + s.node.nodeSize);
  let target = 0;
  for (let i = 0; i < index; i++) target += tr.doc.child(i).nodeSize;
  tr.insert(target, s.node).setMeta('relocate', {
    start: s.pos,
    end: s.pos + s.node.nodeSize,
    target,
  });
  context.dispatch(tr, 'chapter.reorder');
}

export function movePassage(
  context: ChapterOperationsContext,
  id: string,
  targetId: string,
  index?: number,
): void {
  const p = context.passage(id),
    source = p && context.section(p.chapterId),
    target = context.section(targetId);
  index ??= target.node.childCount;
  if (
    !p ||
    p.path.length !== 2 ||
    !source ||
    source.node.attrs.role !== 'chapter' ||
    target.node.attrs.role !== 'chapter' ||
    !context.supported(targetId) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > target.node.childCount
  )
    throw Error('UNSUPPORTED_MOVE');
  const tr = closeHistory(context.state.tr).delete(p.pos, p.pos + p.node.nodeSize);
  let at = 0;
  tr.doc.forEach((n, pos) => {
    if (n.attrs.id === targetId) {
      at = pos + 1;
      for (let i = 0; i < Math.min(index, n.childCount); i++) at += n.child(i).nodeSize;
    }
  });
  tr.insert(at, p.node).setMeta('relocate', {
    start: p.pos,
    end: p.pos + p.node.nodeSize,
    target: at,
  });
  context.dispatch(tr, 'passage.move');
}

export function moveSelection(
  context: ChapterOperationsContext,
  targetId: string,
  offset: number,
): void {
  const { from, to, empty } = context.state.selection,
    source = context.owner(from),
    sourceEnd = context.owner(to),
    target = context.section(targetId);
  if (empty) return;
  if (
    !source ||
    source.node.attrs.id !== sourceEnd?.node.attrs.id ||
    source.node.attrs.role !== 'chapter' ||
    target.node.attrs.role !== 'chapter' ||
    !context.canEdit(source.node.attrs.id) ||
    !context.canEdit(targetId) ||
    !Number.isInteger(offset) ||
    offset < 1 ||
    offset > target.node.content.size - 1
  )
    throw Error('UNSUPPORTED_MOVE');
  const destination = target.pos + 1 + offset;
  if (destination >= from && destination <= to) return;
  const slice = context.state.doc.slice(from, to),
    tr = closeHistory(context.state.tr).delete(from, to),
    at = tr.mapping.map(destination),
    metadata = context.metadata,
    selected = new Set<string>();
  slice.content.descendants((node) => {
    if (node.type.name === 'placeholder') selected.add(node.attrs.sid);
  });
  tr.replaceRange(at, at, slice).setMeta('relocate', {
    start: from,
    end: to,
    target: at,
    inline: true,
  });
  if (selected.size) {
    const parsed = z.array(Sticky).safeParse(metadata.stickies);
    if (parsed.success)
      metadata.stickies = parsed.data.map((sticky) =>
        selected.has(sticky.id) ? { ...sticky, chapterId: targetId } : sticky,
      );
    tr.setDocAttribute('metadata', metadata);
  }
  const end = tr.mapping.maps.at(-1)?.map(at, 1) ?? at;
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size - 1))));
  context.dispatch(tr, 'author.drag.move');
}
