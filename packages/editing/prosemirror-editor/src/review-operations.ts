import type { ChapterRow, Resolution, ReviewRow } from '@leafloom/editor-contracts';
import { Input, type CoreEvent, type ReviewInput } from '@leafloom/editor-contracts';
import { Reference, ReviewOutput, type ReviewItemValue } from '@leafloom/review-contracts';
import type { Context } from '@opentelemetry/api';
import { closeHistory } from 'prosemirror-history';
import { Fragment } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import { runText, runs } from './identity';
import { bookSchema, type Location, type PassageInfo } from './model';

const uuid = () => crypto.randomUUID();

export interface ReviewOperationsContext {
  state: EditorState;
  passages: (sectionId?: string) => PassageInfo[];
  capture: (
    id: string,
    from: number,
    to: number,
  ) => {
    id: string;
    chapterId: string;
    passageId: string;
    from: number;
    to: number;
    version: string;
    expected: (
      | {
          kind: 'text';
          text: string;
          marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
        }
      | { kind: 'break' }
      | {
          kind: 'atom';
          name: 'placeholder' | 'darling_anchor';
          id: string;
          attributes: Record<string, z.core.util.JSONType>;
        }
    )[];
    text: string;
  };
  segments: (loc: Location) => { chapterId: string; passageId: string; from: number; to: number }[];
  passage: (id: string) => PassageInfo | undefined;
  version: string;
  refs: Map<
    string,
    {
      id: string;
      chapterId: string;
      passageId: string;
      from: number;
      to: number;
      version: string;
      expected: (
        | {
            kind: 'text';
            text: string;
            marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
          }
        | { kind: 'break' }
        | {
            kind: 'atom';
            name: 'placeholder' | 'darling_anchor';
            id: string;
            attributes: Record<string, z.core.util.JSONType>;
          }
      )[];
      text: string;
    }
  >;
  locations: Map<string, Location>;
  remember: () => void;
  content: (
    loc: Location,
  ) => (
    | {
        kind: 'text';
        text: string;
        marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
      }
    | { kind: 'break' }
    | {
        kind: 'atom';
        name: 'placeholder' | 'darling_anchor';
        id: string;
        attributes: Record<string, z.core.util.JSONType>;
      }
  )[];
  revision: number;
  resolve: (id: string) => Resolution;
  chapters: ChapterRow[];
  requests: Map<
    string,
    {
      requestId: string;
      bookId: string;
      revision: number;
      category: 'voice' | 'character' | 'structure';
      extracts: {
        reference: {
          id: string;
          chapterId: string;
          passageId: string;
          from: number;
          to: number;
          version: string;
          expected: (
            | {
                kind: 'text';
                text: string;
                marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
              }
            | { kind: 'break' }
            | {
                kind: 'atom';
                name: 'placeholder' | 'darling_anchor';
                id: string;
                attributes: Record<string, z.core.util.JSONType>;
              }
          )[];
          text: string;
        };
        currentSegments: { chapterId: string; passageId: string; from: number; to: number }[];
        version: string;
        chapterOrder: number;
        passageKind: string;
        runs: (
          | {
              kind: 'text';
              text: string;
              marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
            }
          | { kind: 'break' }
          | {
              kind: 'atom';
              name: 'placeholder' | 'darling_anchor';
              id: string;
              attributes: Record<string, z.core.util.JSONType>;
            }
        )[];
        text: string;
      }[];
    }
  >;
  items: Map<string, { item: ReviewItemValue; reviewId: string; rejected: boolean }>;
  listeners: Set<(e: CoreEvent) => void>;
  dispatch: (tr: Transaction, command?: string, historical?: boolean, parent?: Context) => void;
}

export function captureSelection(context: ReviewOperationsContext): {
  id: string;
  chapterId: string;
  passageId: string;
  from: number;
  to: number;
  version: string;
  expected: (
    | {
        kind: 'text';
        text: string;
        marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
      }
    | { kind: 'break' }
    | {
        kind: 'atom';
        name: 'placeholder' | 'darling_anchor';
        id: string;
        attributes: Record<string, z.core.util.JSONType>;
      }
  )[];
  text: string;
} {
  const { from, to } = context.state.selection,
    p = context.passages().find((p) => from >= p.pos + 1 && to <= p.pos + 1 + p.size);
  if (!p || from === to) throw Error('Select text within a paragraph');
  return context.capture(p.id, from - p.pos - 1, to - p.pos - 1);
}

export function segments(
  context: ReviewOperationsContext,
  loc: Location,
): { chapterId: string; passageId: string; from: number; to: number }[] {
  if (loc.deleted || loc.unresolved) return [];
  const passages = context.passages();
  return loc.parts.flatMap((part) => {
    let from = 0,
      to = passages.length;
    while (from < to) {
      const middle = (from + to) >>> 1,
        passage = passages[middle];
      if (passage.pos + 1 + passage.size <= part.from) from = middle + 1;
      else to = middle;
    }
    const result = [];
    for (let index = from; index < passages.length; index++) {
      const p = passages[index];
      if (p.pos + 1 >= part.to) break;
      result.push({
        chapterId: p.chapterId,
        passageId: p.id,
        from: Math.max(0, part.from - p.pos - 1),
        to: Math.min(p.size, part.to - p.pos - 1),
      });
    }
    return result;
  });
}

export function content(
  context: ReviewOperationsContext,
  loc: Location,
): (
  | {
      kind: 'text';
      text: string;
      marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
    }
  | { kind: 'break' }
  | {
      kind: 'atom';
      name: 'placeholder' | 'darling_anchor';
      id: string;
      attributes: Record<string, z.core.util.JSONType>;
    }
)[] {
  let fragment = Fragment.empty;
  for (const s of context.segments(loc)) {
    const p = context.passage(s.passageId)!;
    fragment = fragment.append(p.node.content.cut(s.from, s.to));
  }
  return runs(fragment);
}

export function capture(
  context: ReviewOperationsContext,
  id: string,
  from: number,
  to: number,
): {
  id: string;
  chapterId: string;
  passageId: string;
  from: number;
  to: number;
  version: string;
  expected: (
    | {
        kind: 'text';
        text: string;
        marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
      }
    | { kind: 'break' }
    | {
        kind: 'atom';
        name: 'placeholder' | 'darling_anchor';
        id: string;
        attributes: Record<string, z.core.util.JSONType>;
      }
  )[];
  text: string;
} {
  const p = context.passage(id);
  if (
    !p ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to <= from ||
    to > p.size
  )
    throw Error('INVALID_REFERENCE');
  const expected = runs(p.node.content.cut(from, to));
  const ref = Reference.parse({
    id: uuid(),
    chapterId: p.chapterId,
    passageId: id,
    from,
    to,
    version: context.version,
    expected,
    text: runText(expected),
  });
  context.refs.set(ref.id, ref);
  context.locations.set(ref.id, {
    parts: [{ from: p.pos + 1 + from, to: p.pos + 1 + to }],
    deleted: false,
    unresolved: false,
  });
  context.remember();
  return structuredClone(ref);
}

export function resolve(context: ReviewOperationsContext, id: string): Resolution {
  const ref = context.refs.get(id),
    loc = context.locations.get(id);
  if (!ref || !loc || loc.unresolved) return { status: 'unresolved', segments: [], text: '' };
  if (loc.deleted) return { status: 'deleted', segments: [], text: '' };
  const content = context.content(loc);
  return {
    status: JSON.stringify(content) === JSON.stringify(ref.expected) ? 'current' : 'changed',
    segments: context.segments(loc),
    text: runText(content),
  };
}

export function extract(
  context: ReviewOperationsContext,
  ids: string[],
  category: ReviewInput['category'],
): {
  requestId: string;
  bookId: string;
  revision: number;
  category: 'voice' | 'character' | 'structure';
  extracts: {
    reference: {
      id: string;
      chapterId: string;
      passageId: string;
      from: number;
      to: number;
      version: string;
      expected: (
        | {
            kind: 'text';
            text: string;
            marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
          }
        | { kind: 'break' }
        | {
            kind: 'atom';
            name: 'placeholder' | 'darling_anchor';
            id: string;
            attributes: Record<string, z.core.util.JSONType>;
          }
      )[];
      text: string;
    };
    currentSegments: { chapterId: string; passageId: string; from: number; to: number }[];
    version: string;
    chapterOrder: number;
    passageKind: string;
    runs: (
      | {
          kind: 'text';
          text: string;
          marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
        }
      | { kind: 'break' }
      | {
          kind: 'atom';
          name: 'placeholder' | 'darling_anchor';
          id: string;
          attributes: Record<string, z.core.util.JSONType>;
        }
    )[];
    text: string;
  }[];
} {
  const input = Input.parse({
    requestId: uuid(),
    bookId: context.state.doc.attrs.metadata.id,
    revision: context.revision,
    category,
    extracts: ids.map((id) => {
      const ref = context.refs.get(id),
        loc = context.locations.get(id);
      if (!ref || !loc || context.resolve(id).status !== 'current') throw Error('STALE');
      const segments = context.segments(loc),
        p = context.passage(segments[0].passageId)!;
      return {
        reference: ref,
        currentSegments: segments,
        version: context.version,
        chapterOrder: context.chapters.findIndex((c) => c.id === p.chapterId),
        passageKind: p.kind,
        runs: context.content(loc),
        text: runText(context.content(loc)),
      };
    }),
  });
  context.requests.set(input.requestId, input);
  return structuredClone(input);
}

export function receive(context: ReviewOperationsContext, raw: unknown): void {
  const data = ReviewOutput.parse(raw),
    request = context.requests.get(data.requestId);
  if (!request) throw Error('UNKNOWN_REQUEST');
  const allowed = new Set(request.extracts.map((e) => e.reference.id)),
    ids = new Set<string>();
  for (const item of data.items) {
    if (
      ids.has(item.id) ||
      context.items.has(item.id) ||
      item.references.some((id) => !allowed.has(id))
    )
      throw Error('INVALID_REVIEW');
    ids.add(item.id);
  }
  for (const item of data.items)
    context.items.set(item.id, { item, reviewId: data.reviewId, rejected: false });
  context.revision++;
  for (const fn of context.listeners)
    fn({ kind: 'changed', revision: context.revision, command: 'review.attach' });
}

export function reviewRows(context: ReviewOperationsContext): ReviewRow[] {
  return structuredClone(
    Array.from(context.items.values(), (row) => ({
      ...row.item,
      state: row.rejected
        ? 'rejected'
        : (context.state.doc.attrs.accepted as string[]).includes(row.item.id)
          ? 'accepted'
          : 'pending',
      resolutions: row.item.references.map((id) => context.resolve(id)),
    })),
  );
}

export function accept(
  context: ReviewOperationsContext,
  id: string,
): { ok: boolean; code: string } | { ok: boolean; code?: undefined } {
  const row = context.items.get(id);
  if (!row || row.item.kind !== 'suggestion') return { ok: false, code: 'NOT_FOUND' };
  if (row.rejected) return { ok: false, code: 'REJECTED' };
  if ((context.state.doc.attrs.accepted as string[]).includes(id)) return { ok: true };
  const refid = row.item.references[0],
    loc = context.locations.get(refid),
    resolution = context.resolve(refid);
  if (!loc || resolution.status !== 'current') return { ok: false, code: 'STALE' };
  if (resolution.segments.length !== 1) return { ok: false, code: 'UNSUPPORTED_TARGET' };
  const { from, to } = loc.parts[0],
    content = context.state.doc.slice(from, to).content.content;
  if (content.some((n) => !n.isText || !n.sameMarkup(content[0])))
    return { ok: false, code: 'UNSUPPORTED_TARGET' };
  const tr = closeHistory(context.state.tr);
  if (row.item.replacement)
    tr.replaceWith(from, to, bookSchema.text(row.item.replacement, content[0]?.marks));
  else tr.delete(from, to);
  tr.setDocAttribute('accepted', [...context.state.doc.attrs.accepted, id]);
  context.dispatch(tr, 'review.accept');
  return { ok: true };
}

export function reject(context: ReviewOperationsContext, id: string): void {
  const row = context.items.get(id);
  if (!row) throw Error('NOT_FOUND');
  if ((context.state.doc.attrs.accepted as string[]).includes(id)) throw Error('ACCEPTED');
  if (!row.rejected) {
    row.rejected = true;
    context.revision++;
    for (const fn of context.listeners)
      fn({ kind: 'changed', revision: context.revision, command: 'review.reject' });
  }
}
