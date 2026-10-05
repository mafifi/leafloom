import { Sticky } from '@leafloom/document-contracts';
import type { Annotation } from '@leafloom/editor-contracts';
import { type CoreEvent } from '@leafloom/editor-contracts';
import { type ReviewItemValue } from '@leafloom/review-contracts';
import type { Context } from '@opentelemetry/api';
import { closeHistory } from 'prosemirror-history';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import { runText, runs } from './identity';
import { bookSchema, type PassageInfo } from './model';

const uuid = () => crypto.randomUUID();

export interface AnnotationOperationsContext {
  items: Map<string, { item: ReviewItemValue; reviewId: string; rejected: boolean }>;
  annotationRanges: { value: Annotation; from: number; to: number; expected: string }[];
  passage: (id: string) => PassageInfo | undefined;
  listeners: Set<(e: CoreEvent) => void>;
  revision: number;
  state: EditorState;
  dispatch: (tr: Transaction, command?: string, historical?: boolean, parent?: Context) => void;
  owner: (pos: number) => Readonly<{ node: PMNode; pos: number; index: number }> | undefined;
  requireEditableSelection: () => void;
  stickies: {
    [x: string]: z.core.util.JSONType;
    id: string;
    chapterId: string;
    text: string;
    resolved: boolean;
  }[];
  canEdit: (id: string) => boolean;
}

export function setAnnotations(
  context: AnnotationOperationsContext,
  annotations: Annotation[],
): void {
  const schema = z.array(
    z.strictObject({
      id: z.string().min(1),
      kind: z.enum(['spelling', 'review', 'search']),
      passageId: z.string().min(1),
      from: z.number().int().nonnegative(),
      to: z.number().int().nonnegative(),
      message: z.string().optional(),
    }),
  );
  const parsed = Array.from(
    new Map(
      schema
        .parse(annotations)
        .filter((value) => value.kind !== 'review' || !context.items.has(value.id))
        .map((value) => [
          JSON.stringify([value.id, value.kind, value.passageId, value.from, value.to]),
          value,
        ]),
    ).values(),
  );
  context.annotationRanges = parsed.map((value) => {
    const passage = context.passage(value.passageId);
    if (!passage || value.to <= value.from || value.to > passage.size)
      throw Error('INVALID_ANNOTATION');
    return {
      value,
      from: passage.pos + 1 + value.from,
      to: passage.pos + 1 + value.to,
      expected: runText(runs(passage.node.content.cut(value.from, value.to))),
    };
  });
  for (const listener of context.listeners)
    listener({ kind: 'decoration', revision: context.revision, command: 'annotations' });
}

export function replacePassageText(
  context: AnnotationOperationsContext,
  id: string,
  from: number,
  to: number,
  text: string,
): void {
  const passage = context.passage(id);
  if (
    !passage ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > passage.size
  )
    throw Error('INVALID_SELECTION');
  const begin = passage.pos + 1 + from,
    end = passage.pos + 1 + to,
    marks =
      passage.node.content.cut(from, to).firstChild?.marks ??
      context.state.doc.resolve(begin).marks();
  const tr = closeHistory(context.state.tr);
  if (text) tr.replaceWith(begin, end, bookSchema.text(text, marks));
  else tr.delete(begin, end);
  context.dispatch(tr, 'replace');
}

export function createSticky(context: AnnotationOperationsContext, text: string): string {
  const section = context.owner(context.state.selection.from);
  if (!section || section.node.attrs.role !== 'chapter') throw Error('UNSUPPORTED_CONTENT');
  context.requireEditableSelection();
  const id = uuid(),
    record = Sticky.parse({ id, chapterId: section.node.attrs.id, text, resolved: false }),
    metadata = { ...context.state.doc.attrs.metadata, stickies: [...context.stickies, record] };
  const at = context.state.selection.to,
    tr = closeHistory(context.state.tr).insert(
      at,
      Fragment.fromArray([bookSchema.nodes.placeholder.create({ sid: id }), bookSchema.text(' ')]),
    );
  tr.setSelection(TextSelection.create(tr.doc, at + 2)).setDocAttribute('metadata', metadata);
  context.dispatch(tr, 'sticky.create');
  return id;
}

export function updateSticky(
  context: AnnotationOperationsContext,
  id: string,
  patch: { text?: string; resolved?: boolean },
): void {
  const value = z
    .strictObject({ text: z.string().optional(), resolved: z.boolean().optional() })
    .parse(patch);
  const current = context.stickies.find((sticky) => sticky.id === id);
  if (!current) throw Error('NOT_FOUND');
  if (
    (value.text === undefined || value.text === current.text) &&
    (value.resolved === undefined || value.resolved === current.resolved)
  )
    return;
  context.dispatch(
    closeHistory(context.state.tr).setDocAttribute('metadata', {
      ...context.state.doc.attrs.metadata,
      stickies: context.stickies.map((sticky) =>
        sticky.id === id ? { ...sticky, ...value } : sticky,
      ),
    }),
    'sticky.update',
  );
}

export function removeSticky(context: AnnotationOperationsContext, id: string): void {
  const anchors: { pos: number; size: number }[] = [];
  context.state.doc.descendants((node, pos) => {
    if (node.type.name === 'placeholder' && node.attrs.sid === id)
      anchors.push({ pos, size: node.nodeSize });
  });
  if (!anchors.length && !context.stickies.some((sticky) => sticky.id === id))
    throw Error('NOT_FOUND');
  const tr = closeHistory(context.state.tr);
  for (const anchor of anchors.reverse()) {
    const point = context.state.doc.resolve(anchor.pos),
      before = point.parent.textBetween(0, point.parentOffset),
      after = point.parent.textBetween(point.parentOffset + anchor.size, point.parent.content.size);
    // NEO resolves the flag seam by normalizing only its adjacent NBSPs.
    // Replace equal-length characters so later anchor positions stay valid,
    // and retain each neighbour's authored emphasis.
    const previous = point.nodeBefore,
      following = context.state.doc.resolve(anchor.pos + anchor.size).nodeAfter;
    if (previous?.isText && previous.text?.endsWith('\u00a0'))
      tr.replaceWith(anchor.pos - 1, anchor.pos, bookSchema.text(' ', previous.marks));
    if (following?.isText && following.text?.startsWith('\u00a0'))
      tr.replaceWith(
        anchor.pos + anchor.size,
        anchor.pos + anchor.size + 1,
        bookSchema.text(' ', following.marks),
      );
    const start = anchor.pos;
    let end = anchor.pos + anchor.size;
    if (/\s$/.test(before) && /^\s/.test(after)) end += 1;
    else if (!/\s$/.test(before) && /^ {2}/.test(after)) end += 1;
    tr.delete(start, end);
  }
  tr.setDocAttribute('metadata', {
    ...context.state.doc.attrs.metadata,
    stickies: context.stickies.filter((sticky) => sticky.id !== id),
  });
  context.dispatch(tr, 'sticky.remove');
}

export function selectSticky(
  context: AnnotationOperationsContext,
  id: string,
  after = false,
): boolean {
  let position: number | undefined;
  context.state.doc.descendants((node, pos) => {
    if (node.type.name === 'placeholder' && node.attrs.sid === id) position = pos;
  });
  if (position === undefined) return false;
  const owner = context.owner(position);
  if (!owner || !context.canEdit(owner.node.attrs.id)) return false;
  const next = context.state.doc.nodeAt(position + 1),
    target = after ? position + 1 + (next?.isText ? 1 : 0) : position;
  context.dispatch(
    context.state.tr.setSelection(
      TextSelection.create(context.state.doc, target, after ? target : position + 1),
    ),
    'select',
  );
  return true;
}
