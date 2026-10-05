import { Sticky } from '@leafloom/document-contracts';
import type { ChapterRow, RestoreOutcome } from '@leafloom/editor-contracts';
import type { Context } from '@opentelemetry/api';
import { closeHistory } from 'prosemirror-history';
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import { exportHTML, schema as htmlSchema } from './codec';
import type { SectionSource } from './core';
import type { DarlingValue } from './darlings';
import { locateDarlingContext, parseRestorableDarling } from './darlings';
import { baseNode } from './fidelity';
import { bookSchema, type Location, type PassageInfo } from './model';

const uuid = () => crypto.randomUUID();

export interface DarlingOperationsContext {
  resetEnter: () => void;
  state: EditorState;
  owner: (pos: number) => Readonly<{ node: PMNode; pos: number; index: number }> | undefined;
  supported: (id: string) => boolean;
  document: Document;
  locations: Map<string, Location>;
  trustedBookmarks: Set<string>;
  chapters: ChapterRow[];
  stickies: {
    [x: string]: z.core.util.JSONType;
    id: string;
    chapterId: string;
    text: string;
    resolved: boolean;
  }[];
  dispatch: (tr: Transaction, command?: string, historical?: boolean, parent?: Context) => void;
  darlings: DarlingValue[];
  section: (id: string) => Readonly<{ node: PMNode; pos: number; index: number }>;
  sections: readonly Readonly<{ node: PMNode; pos: number; index: number }>[];
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
  passages: (sectionId?: string) => PassageInfo[];
}

export function archive(context: DarlingOperationsContext): void {
  context.resetEnter();
  const { from, to, $from, $to } = context.state.selection,
    owner = context.owner(from),
    endOwner = context.owner(to);
  if (
    from === to ||
    !owner ||
    owner.node.attrs.role !== 'chapter' ||
    owner.node.attrs.id !== endOwner?.node.attrs.id ||
    !$from.parent.isTextblock ||
    !$to.parent.isTextblock
  )
    throw Error('UNSUPPORTED_TARGET');
  if (!context.supported(owner.node.attrs.id)) throw Error('UNSUPPORTED_CONTENT');
  const slice = context.state.doc.slice(from, to),
    id = uuid(),
    blocks = Array.from(slice.content.content, (node) => baseNode(node));
  let html = exportHTML(
    context.document,
    htmlSchema.nodes.doc.create(
      null,
      slice.openStart ? blocks : htmlSchema.nodes.paragraph.create(null, blocks),
    ),
  );
  const selectedStickyIds = new Set<string>();
  slice.content.descendants((node) => {
    if (node.type.name === 'placeholder') selectedStickyIds.add(node.attrs.sid);
  });
  const prefix = context.state.doc.textBetween(owner.pos + 1, from, '', (node) =>
      node.type.name === 'placeholder' ? '⚑' : '',
    ),
    suffix = context.state.doc.textBetween(to, owner.pos + owner.node.nodeSize - 1, '', (node) =>
      node.type.name === 'placeholder' ? '⚑' : '',
    );
  const references = Array.from(context.locations, ([referenceId, location]) => ({
    id: referenceId,
    parts: location.parts,
  }))
    .filter(
      (location) =>
        location.parts.length && location.parts.every((part) => part.from >= from && part.to <= to),
    )
    .map((location) => ({
      id: location.id,
      parts: location.parts.map((part) => ({ from: part.from - from, to: part.to - from })),
    }));
  const tr = closeHistory(context.state.tr).deleteSelection(),
    selection = tr.selection;
  let restorePosition = tr.selection.from,
    blockRestore = false;
  if (
    selection.$from.parent.type.name === 'paragraph' &&
    !selection.$from.parent.textContent.trim() &&
    selection.$from.parent.content.content.every((node) => node.type.name === 'hard_break')
  ) {
    const section = selection.$from.node(selection.$from.depth - 1);
    if (section.type.name === 'section' && section.childCount > 1) {
      const start = selection.$from.before(),
        previous = tr.doc.resolve(start).nodeBefore;
      tr.delete(start, start + selection.$from.parent.nodeSize);
      restorePosition = start;
      blockRestore = true;
      tr.setSelection(
        TextSelection.near(tr.doc.resolve(previous ? start - 1 : start), previous ? -1 : 1),
      );
    }
  }
  if (!blockRestore && $from.sameParent($to)) {
    const holder = context.document.createElement('div');
    holder.innerHTML = html;
    html = holder.firstElementChild?.innerHTML ?? html;
  }
  const savedSlice = blockRestore ? new Slice(slice.content, 0, 0) : slice;
  context.trustedBookmarks.add(id);
  const record = {
    id,
    html,
    text: slice.content.textBetween(0, slice.content.size, '\n', '⚑'),
    chapterId: owner.node.attrs.id,
    chapterLabel:
      context.chapters.find((chapter) => chapter.id === owner.node.attrs.id)?.label ??
      owner.node.attrs.title,
    date: new Date().toISOString(),
    anchorPrefix: prefix.slice(-60),
    anchorSuffix: suffix.slice(0, 60),
    bookmark: { position: restorePosition, ...(blockRestore ? { block: true } : {}) },
    stickies: context.stickies.filter((sticky) => selectedStickyIds.has(sticky.id)),
    references,
    slice: {
      content: savedSlice.content.toJSON(),
      openStart: savedSlice.openStart,
      openEnd: savedSlice.openEnd,
    },
  };
  context.dispatch(
    tr.setDocAttribute('darlings', [record, ...context.state.doc.attrs.darlings]),
    'darling.archive',
  );
}

export function restore(context: DarlingOperationsContext, id: string): RestoreOutcome {
  context.resetEnter();
  const record = context.darlings.find((darling) => darling.id === id);
  if (!record) throw Error('NOT_FOUND');
  const bookmark = z
    .strictObject({ position: z.number().int().nonnegative(), block: z.boolean().optional() })
    .safeParse(record.bookmark);
  let at: number | undefined,
    replaceTo: number | undefined,
    location: RestoreOutcome['location'] = 'context';
  const anchors: number[] = [];
  context.state.doc.descendants((node, position) => {
    if (node.type.name === 'darling_anchor' && node.attrs.did === id) anchors.push(position);
  });
  if (anchors.length) {
    at = anchors[0];
    replaceTo = at + 1;
    location = 'anchor';
  }
  let section =
    record.chapterId && context.chapters.some((chapter) => chapter.id === record.chapterId)
      ? context.section(record.chapterId)
      : undefined;
  if (at === undefined && section && bookmark.success && context.trustedBookmarks.has(id)) {
    const point = bookmark.data.position;
    if (
      point >= section.pos + 1 &&
      point <= section.pos + section.node.nodeSize - 1 &&
      (bookmark.data.block
        ? context.state.doc.resolve(point).parent.type.name === 'section'
        : context.state.doc.resolve(point).parent.isTextblock)
    ) {
      at = point;
      location = 'bookmark';
    }
  }
  if (at === undefined && section && (record.anchorPrefix != null || record.anchorSuffix != null)) {
    const prefix = z.string().nullish().parse(record.anchorPrefix) ?? '',
      suffix = z.string().nullish().parse(record.anchorSuffix) ?? '';
    at = locateDarlingContext(section, prefix, suffix) ?? undefined;
    location = 'context';
  }
  const { model, slice } = parseRestorableDarling(context.document, record);
  let tr = closeHistory(context.state.tr),
    created: string | undefined,
    caret: number | undefined,
    revealAt: number | undefined;
  if (at === undefined) {
    location = 'fallback';
    section ??= context.sections.filter((section) => section.node.attrs.role === 'chapter').at(-1);
    if (!section) {
      created = uuid();
      const node = context.makeSection(created, 'chapter', '<p></p>', '', 'chapter');
      tr.insert(0, node);
      section = { node, pos: 0, index: 0 };
    }
    if (!context.supported(section.node.attrs.id)) throw Error('UNSUPPORTED_CONTENT');
    at = section.pos + section.node.nodeSize - 1;
    const content = Fragment.fromArray(
      Array.from(model.content.content, (node) => bookSchema.nodeFromJSON(node.toJSON())),
    );
    if (
      section.node.childCount === 1 &&
      !section.node.child(0).textContent.trim() &&
      section.node.child(0).content.content.every((node) => node.type.name === 'hard_break')
    )
      tr.replaceWith(section.pos + 1, section.pos + section.node.nodeSize - 1, content);
    else tr.insert(at, content);
    caret = tr.mapping.maps.at(-1)?.map(at, 1);
  } else {
    section = context.owner(at);
    if (!section || !context.supported(section.node.attrs.id)) throw Error('UNSUPPORTED_CONTENT');
    if (location === 'context' && record.slice === undefined && /<p[\s>]/i.test(record.html)) {
      const point = context.state.doc.resolve(at),
        after = point.after();
      revealAt = after + 1;
      tr.insert(
        after,
        Fragment.fromArray(
          Array.from(model.content.content, (node) => bookSchema.nodeFromJSON(node.toJSON())),
        ),
      );
      caret = tr.mapping.maps.at(-1)?.map(after, 1);
    } else {
      if (bookmark.success && bookmark.data.block) revealAt = at + 1;
      tr.replace(at, replaceTo ?? at, slice);
      caret = tr.mapping.maps.at(-1)?.map(at, 1);
    }
  }
  if (caret !== undefined)
    tr.setSelection(
      TextSelection.near(tr.doc.resolve(Math.max(0, Math.min(caret, tr.doc.content.size))), -1),
    );
  const restoredStickies = z
      .array(Sticky)
      .parse(record.stickies ?? [])
      .map((sticky) => ({ ...sticky, chapterId: String(section!.node.attrs.id) })),
    metadata = {
      ...context.state.doc.attrs.metadata,
      stickies: [
        ...context.stickies,
        ...restoredStickies.filter(
          (sticky) => !context.stickies.some((existing) => existing.id === sticky.id),
        ),
      ],
    };
  tr.setDocAttribute('metadata', metadata).setDocAttribute(
    'darlings',
    (context.state.doc.attrs.darlings as unknown[]).filter(
      (darling) =>
        !(darling && typeof darling === 'object' && 'id' in darling && darling.id === id),
    ),
  );
  if ((location === 'bookmark' || location === 'anchor') && record.references) {
    const references = z
      .array(
        z.strictObject({
          id: z.string(),
          parts: z.array(
            z.strictObject({
              from: z.number().int().nonnegative(),
              to: z.number().int().nonnegative(),
            }),
          ),
        }),
      )
      .parse(record.references);
    tr.setMeta(
      'restoreReferences',
      references.map((reference) => ({
        id: reference.id,
        parts: reference.parts.map((part) => ({
          from: at! + (bookmark.success && bookmark.data.block ? 1 : 0) + part.from,
          to: at! + (bookmark.success && bookmark.data.block ? 1 : 0) + part.to,
        })),
      })),
    );
  }
  context.dispatch(tr, 'darling.restore');
  return {
    location,
    chapterId: created ?? String(section.node.attrs.id),
    ...(revealAt === undefined
      ? {}
      : {
          restoredPassageId: context
            .passages(String(section.node.attrs.id))
            .find((p) => revealAt! >= p.pos + 1 && revealAt! <= p.pos + 1 + p.size)?.id,
        }),
    ...(location === 'fallback'
      ? {
          notice:
            'Original spot is gone — restored to the end of ' +
            String(record.chapterLabel ?? 'the manuscript'),
        }
      : {}),
  };
}

export function removeDarling(context: DarlingOperationsContext, id: string): void {
  if (!context.darlings.some((darling) => darling.id === id)) throw Error('NOT_FOUND');
  const anchors: number[] = [];
  context.state.doc.descendants((node, position) => {
    if (node.type.name === 'darling_anchor' && node.attrs.did === id) anchors.push(position);
  });
  const tr = closeHistory(context.state.tr);
  for (const position of anchors.reverse()) tr.delete(position, position + 1);
  tr.setDocAttribute(
    'darlings',
    (context.state.doc.attrs.darlings as unknown[]).filter(
      (darling) =>
        !(darling && typeof darling === 'object' && 'id' in darling && darling.id === id),
    ),
  );
  context.dispatch(tr, 'darling.remove');
}
