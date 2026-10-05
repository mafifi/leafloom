import { storyKinds } from '@leafloom/document-contracts';
import type { Context } from '@opentelemetry/api';
import { joinBackward, joinForward, splitBlock } from 'prosemirror-commands';
import { closeHistory } from 'prosemirror-history';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import { deletionRange, hasBlockClass } from './authoring-boundaries';
import type { SectionSource } from './core';
import { removeChapterMetadata } from './metadata';
import { bookSchema } from './model';

const uuid = () => crypto.randomUUID();

export interface ParagraphOperationsContext {
  state: EditorState;
  owner: (pos: number) => Readonly<{ node: PMNode; pos: number; index: number }> | undefined;
  canEditSelection: () => boolean;
  resetEnter: () => void;
  dispatch: (tr: Transaction, command?: string, historical?: boolean, parent?: Context) => void;
  enterSequence: { stage: 1 | 2; sectionId: string; tailId: string; time: number } | null;
  sources: Map<string, SectionSource>;
  sections: readonly Readonly<{ node: PMNode; pos: number; index: number }>[];
  metadata: { [x: string]: z.core.util.JSONType; id: string; title: string; author: string };
  supported: (id: string) => boolean;
}

export function enter(context: ParagraphOperationsContext, shift = false, plain = false): boolean {
  const { $from, $to, empty } = context.state.selection,
    owner = context.owner($from.pos);
  if (!owner || !context.canEditSelection()) return false;
  const node = $from.parent,
    activeMarks = context.state.storedMarks ?? $from.marks();
  if (plain) {
    context.resetEnter();
    if (shift) {
      context.dispatch(
        closeHistory(context.state.tr)
          .replaceSelectionWith(bookSchema.nodes.hard_break.create())
          .setStoredMarks(context.state.storedMarks ?? $from.marks()),
        'author.linebreak',
      );
      return true;
    }
    return splitBlock(context.state, (tr) =>
      context.dispatch(
        closeHistory(tr).setStoredMarks(
          tr.selection.$from.parent.type.allowedMarks(
            context.state.storedMarks ??
              (tr.selection.$from.parent.content.size ? tr.selection.$from.marks() : activeMarks),
          ),
        ),
        'author.enter',
      ),
    );
  }
  if (owner.node.attrs.role !== 'chapter' && shift) {
    context.resetEnter();
    context.dispatch(
      closeHistory(context.state.tr)
        .replaceSelectionWith(bookSchema.nodes.hard_break.create())
        .setStoredMarks(context.state.storedMarks ?? $from.marks()),
      'author.linebreak',
    );
    return true;
  }
  if (node.type.name !== 'paragraph' || !$from.sameParent($to)) {
    context.resetEnter();
    return splitBlock(context.state, (tr) => context.dispatch(closeHistory(tr), 'author.enter'));
  }
  const classes = String(node.attrs.class).split(/\s+/),
    poetry = classes.includes('poetry');
  if (classes.includes('scene-break')) {
    context.resetEnter();
    return true;
  }
  const start = $from.before(),
    offset = $from.parentOffset;
  const sequence = context.enterSequence;
  if (
    !shift &&
    !poetry &&
    empty &&
    sequence &&
    sequence.sectionId === owner.node.attrs.id &&
    sequence.tailId === node.attrs.pid &&
    offset === 0 &&
    storyKinds.includes(owner.node.attrs.kind)
  ) {
    if (sequence.stage === 1) {
      const scene = bookSchema.nodes.paragraph.create(
        { class: 'scene-break' },
        bookSchema.text('***'),
      );
      const previous = context.state.doc.resolve(start).nodeBefore;
      const tr = context.state.tr.setTime(sequence.time);
      if (previous?.type.name === 'paragraph' && !previous.textContent.trim())
        tr.replaceWith(start - previous.nodeSize, start, scene);
      else tr.insert(start, scene);
      tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(start, 1) + 1));
      context.dispatch(tr, 'author.scene');
      context.enterSequence = { ...sequence, stage: 2 };
      return true;
    }
    const previous = context.state.doc.resolve(start).nodeBefore;
    if (previous && hasBlockClass(previous, 'scene-break')) {
      const id = uuid(),
        tr = closeHistory(context.state.tr);
      let at = start - previous.nodeSize;
      if (at === owner.pos + 1) {
        const shell = bookSchema.nodes.paragraph.create({ pid: uuid() });
        tr.replaceWith(at, start, shell);
        at += shell.nodeSize;
      } else tr.delete(at, start);
      tr.split(at, 1, [
        {
          type: bookSchema.nodes.section,
          attrs: { id, role: 'chapter', title: '', kind: 'chapter' },
        },
      ]);
      context.sources.set(id, {
        html: '<p></p>',
        initial: Fragment.empty,
        supported: true,
        title: '',
        kind: 'chapter',
      });
      tr.setSelection(TextSelection.create(tr.doc, at + 3));
      context.dispatch(tr, 'author.chapter');
      context.resetEnter();
      return true;
    }
  }
  context.resetEnter();
  if (
    poetry &&
    !shift &&
    !node.textContent &&
    node.content.content.every((n) => n.type.name === 'hard_break')
  ) {
    const tr = closeHistory(context.state.tr).setNodeMarkup(start, undefined, {
      ...node.attrs,
      class: classes.filter((c) => c !== 'poetry').join(' '),
    });
    tr.removeMark(start + 1, start + 1 + node.content.size, bookSchema.marks.italic);
    tr.setStoredMarks([]);
    context.dispatch(tr, 'author.poetry.exit');
    return true;
  }
  const tr = closeHistory(context.state.tr);
  const makePoetry = shift;
  if (shift && offset === 0 && !poetry && empty) {
    tr.setNodeMarkup(start, undefined, {
      ...node.attrs,
      class: [...classes.filter(Boolean), 'poetry'].join(' '),
    });
    tr.addMark(start + 1, start + 1 + node.content.size, bookSchema.marks.italic.create());
    tr.setStoredMarks([bookSchema.marks.italic.create()]);
    context.dispatch(tr, 'author.poetry');
    return true;
  }
  const tailClass = makePoetry
    ? [...classes.filter((c) => c && c !== 'poetry'), 'poetry'].join(' ')
    : classes.filter((c) => c !== 'poetry').join(' ');
  tr.deleteSelection();
  const splitAt = tr.selection.from;
  tr.split(splitAt, 1, [
    { type: node.type, attrs: { ...node.attrs, pid: null, class: tailClass } },
  ]);
  const tailStart = splitAt + 1,
    right = tr.doc.nodeAt(tailStart)!;
  if (makePoetry && !poetry)
    tr.addMark(tailStart + 1, tailStart + 1 + right.content.size, bookSchema.marks.italic.create());
  else if (poetry && !makePoetry)
    tr.removeMark(tailStart + 1, tailStart + 1 + right.content.size, bookSchema.marks.italic);
  tr.setSelection(TextSelection.create(tr.doc, tailStart + 1));
  const tailVisible = right
    .textBetween(0, right.content.size, '', (node) => (node.type.name === 'placeholder' ? '⚑' : ''))
    .trim();
  tr.setStoredMarks(
    makePoetry
      ? poetry && (tailVisible || activeMarks.some((mark) => mark.type.name === 'italic'))
        ? activeMarks
        : [bookSchema.marks.italic.create()]
      : poetry
        ? []
        : (context.state.storedMarks ??
          (right.content.size ? tr.selection.$from.marks() : activeMarks)),
  );
  context.dispatch(tr, 'author.enter');
  if (
    !shift &&
    !poetry &&
    owner.node.attrs.role === 'chapter' &&
    storyKinds.includes(owner.node.attrs.kind)
  )
    context.enterSequence = {
      stage: 1,
      sectionId: owner.node.attrs.id,
      tailId: context.state.doc.nodeAt(tailStart)!.attrs.pid,
      time: tr.time,
    };
  return true;
}

export function backspace(context: ParagraphOperationsContext): boolean {
  context.resetEnter();
  if (!context.canEditSelection()) return false;
  const { $from, $to, from, to, empty } = context.state.selection;
  if (!empty) {
    const range = deletionRange(context.state.doc, from, to);
    context.dispatch(
      closeHistory(context.state.tr).delete(range.from, range.to),
      'author.delete.selection',
    );
    return true;
  }
  if ($from.parentOffset !== 0) {
    const previous = $from.nodeBefore;
    if (!previous) return false;
    const length = previous.isText
      ? (Array.from(
          new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(previous.text!),
        ).at(-1)?.segment.length ?? 1)
      : previous.nodeSize;
    const range = deletionRange(context.state.doc, from - length, from);
    context.dispatch(context.state.tr.delete(range.from, range.to), 'author.backspace');
    return true;
  }
  if (
    $from.parent.type.name === 'paragraph' &&
    String($from.parent.attrs.class).split(/\s+/).includes('poetry')
  ) {
    const start = $from.before(),
      tr = closeHistory(context.state.tr)
        .setNodeMarkup(start, undefined, {
          ...$from.parent.attrs,
          class: String($from.parent.attrs.class)
            .split(/\s+/)
            .filter((c) => c !== 'poetry')
            .join(' '),
        })
        .removeMark(start + 1, start + 1 + $from.parent.content.size, bookSchema.marks.italic)
        .setStoredMarks([]);
    context.dispatch(tr, 'author.poetry.exit');
    return true;
  }
  const owner = context.owner($from.pos);
  if (owner && $from.before() === owner.pos + 1) {
    if (owner.node.attrs.role !== 'chapter') return true;
    const chapters = context.sections.filter((section) => section.node.attrs.role === 'chapter'),
      index = chapters.findIndex((section) => section.node.attrs.id === owner.node.attrs.id);
    if (
      !owner.node
        .textBetween(0, owner.node.content.size, '\n', (node) =>
          node.type.name === 'placeholder' ? '⚑' : '\n',
        )
        .trim() &&
      chapters.length > 1
    ) {
      const target = index > 0 ? chapters[index - 1] : chapters[1],
        tr = closeHistory(context.state.tr).delete(owner.pos, owner.pos + owner.node.nodeSize);
      const metadata = context.metadata;
      removeChapterMetadata(metadata, owner.node.attrs.id);
      tr.setDocAttribute('metadata', metadata);
      const mapped = tr.mapping.map(target.pos),
        position = index > 0 ? mapped + target.node.nodeSize - 2 : mapped + 2;
      tr.setSelection(TextSelection.create(tr.doc, position));
      context.dispatch(tr, 'chapter.empty.delete');
      return true;
    }
    if (index === 0) return true;
    const previous = chapters[index - 1];
    if (
      !previous.node
        .textBetween(0, previous.node.content.size, '\n', (node) =>
          node.type.name === 'placeholder' ? '⚑' : '\n',
        )
        .trim() &&
      previous.node.attrs.kind !== 'contents'
    ) {
      const metadata = context.metadata;
      removeChapterMetadata(metadata, previous.node.attrs.id);
      const tr = closeHistory(context.state.tr)
        .delete(previous.pos, previous.pos + previous.node.nodeSize)
        .setDocAttribute('metadata', metadata);
      tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map($from.pos)));
      context.dispatch(tr, 'chapter.empty.delete');
      return true;
    }
    if (
      !storyKinds.includes(previous.node.attrs.kind) ||
      !storyKinds.includes(owner.node.attrs.kind) ||
      !context.supported(previous.node.attrs.id)
    )
      return true;
    const tr = closeHistory(context.state.tr).join(owner.pos),
      metadata = structuredClone(context.state.doc.attrs.metadata),
      oldId = owner.node.attrs.id,
      newId = previous.node.attrs.id;
    const sectionNotes = z.record(z.string(), z.array(z.json())).safeParse(metadata.sectionNotes);
    if (sectionNotes.success && sectionNotes.data[oldId]) {
      sectionNotes.data[newId] = [...(sectionNotes.data[newId] ?? []), ...sectionNotes.data[oldId]];
      delete sectionNotes.data[oldId];
      metadata.sectionNotes = sectionNotes.data;
    }
    for (const key of ['chapterTitles', 'chapterKinds', 'chapterNotes']) {
      const map = z.record(z.string(), z.json()).safeParse(metadata[key]);
      if (map.success) {
        delete map.data[oldId];
        metadata[key] = map.data;
      }
    }
    const stickies = z
      .array(z.object({ chapterId: z.string() }).catchall(z.json()))
      .safeParse(metadata.stickies);
    if (stickies.success)
      metadata.stickies = stickies.data.map((sticky) =>
        sticky.chapterId === oldId ? { ...sticky, chapterId: newId } : sticky,
      );
    const darlings = z
      .array(z.object({ chapterId: z.string().nullish() }).catchall(z.json()))
      .parse(context.state.doc.attrs.darlings)
      .map((darling) => (darling.chapterId === oldId ? { ...darling, chapterId: newId } : darling));
    tr.setDocAttribute('metadata', metadata)
      .setDocAttribute('darlings', darlings)
      .setSelection(TextSelection.create(tr.doc, tr.mapping.map($from.pos)));
    context.dispatch(tr, 'chapter.merge');
    return true;
  }
  const before = context.state.doc.resolve($from.before()).nodeBefore;
  if (before && hasBlockClass(before, 'scene-break')) {
    context.dispatch(
      closeHistory(context.state.tr).delete($from.before() - before.nodeSize, $from.before()),
      'author.scene.delete',
    );
    return true;
  }
  return joinBackward(context.state, (tr) => context.dispatch(closeHistory(tr), 'author.join'));
}

export function deleteForward(context: ParagraphOperationsContext): boolean {
  context.resetEnter();
  if (!context.canEditSelection()) return false;
  const { $from, empty } = context.state.selection;
  if (!empty) {
    const { from, to } = context.state.selection,
      range = deletionRange(context.state.doc, from, to);
    context.dispatch(
      closeHistory(context.state.tr).delete(range.from, range.to),
      'author.delete.selection',
    );
    return true;
  }
  if ($from.parentOffset !== $from.parent.content.size) {
    const next = $from.nodeAfter;
    if (!next) return false;
    const length = next.isText
      ? (Array.from(
          new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(next.text!),
        )[0]?.segment.length ?? 1)
      : next.nodeSize;
    const range = deletionRange(context.state.doc, $from.pos, $from.pos + length);
    context.dispatch(context.state.tr.delete(range.from, range.to), 'author.delete');
    return true;
  }
  const after = context.state.doc.resolve($from.after()).nodeAfter;
  if (after && hasBlockClass(after, 'scene-break')) {
    context.dispatch(
      closeHistory(context.state.tr).delete($from.after(), $from.after() + after.nodeSize),
      'author.scene.delete',
    );
    return true;
  }
  const owner = context.owner($from.pos);
  if (owner && $from.after() === owner.pos + owner.node.nodeSize - 1) return true;
  return joinForward(context.state, (tr) => context.dispatch(closeHistory(tr), 'author.join'));
}
