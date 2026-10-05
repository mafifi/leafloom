import type {
  Annotation,
  ChapterRow,
  DocumentSnapshotValue,
  EditorSelection,
  ExternalReconcileOptions,
  ExternalReconcileOutcome,
  MetadataField,
} from '@leafloom/editor-contracts';
import { Checkpoint, type CheckpointValue, type CoreEvent } from '@leafloom/editor-contracts';
import { type ReviewItemValue } from '@leafloom/review-contracts';
import type { Context } from '@opentelemetry/api';
import { undoDepth } from 'prosemirror-history';
import { type Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { z } from 'zod';
import { exportHTML, schema as htmlSchema } from './codec';
import type { SectionSource } from './core';
import { planExternal } from './external-reconciliation';
import { baseNode } from './fidelity';
import { entries, signature } from './identity';
import { bookSchema, type Location, type Part, type PassageInfo } from './model';
import { ReferenceHistory } from './reference-history';
import type { CompositionTelemetry } from './telemetry';

const uuid = () => crypto.randomUUID();

export interface CheckpointOperationsContext {
  checkpoint: (carrier?: string) => CheckpointValue;
  sources: Map<string, SectionSource>;
  passages: (sectionId?: string) => PassageInfo[];
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
  sections: readonly Readonly<{ node: PMNode; pos: number; index: number }>[];
  supported: (id: string) => boolean;
  section: (id: string) => Readonly<{ node: PMNode; pos: number; index: number }>;
  html: (id: string) => string;
  state: EditorState;
  revision: number;
  document: Document;
  finishMetadataField: (field?: MetadataField) => void;
  selection: EditorSelection | null;
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
  items: Map<string, { item: ReviewItemValue; reviewId: string; rejected: boolean }>;
  locations: Map<string, Location>;
  passage: (id: string) => PassageInfo | undefined;
  annotationRanges: { value: Annotation; from: number; to: number; expected: string }[];
  words: number;
  wordCount: () => number;
  referenceHistory: ReferenceHistory;
  remember: () => void;
  version: string;
  restoreSelection: (value: unknown) => boolean;
  breakTyping: boolean;
  listeners: Set<(e: CoreEvent) => void>;
  telemetry: CompositionTelemetry | undefined;
  commandParent: Context | undefined;
  snapshots: number;
  chapters: ChapterRow[];
  originalIds: Set<string>;
  segments: (loc: Location) => { chapterId: string; passageId: string; from: number; to: number }[];
}

export function reconcileExternal(
  context: CheckpointOperationsContext,
  baseline: DocumentSnapshotValue,
  incoming: DocumentSnapshotValue,
  options: ExternalReconcileOptions,
): ExternalReconcileOutcome {
  const local = context.checkpoint(),
    plan = planExternal(baseline, local, incoming, options),
    staged = new Map(context.sources),
    aliases = new Map<string, { chapterId: string; passageId: string }>(),
    incomingChapters = new Map(incoming.book.chapters.map((chapter) => [chapter.id, chapter])),
    oldPassages = new Map(context.passages().map((passage) => [passage.id, passage])),
    compile = (
      id: string,
      role: string,
      html: string,
      title = '',
      kind = 'chapter',
      index?: { id: string; path: number[]; signature: string }[],
      originId = id,
    ) => {
      let section = context.makeSection(
        id,
        role,
        html,
        title,
        kind,
        index,
        staged,
        incoming.book.formatVersion !== 'leafloom-manuscript/v2',
      );
      const old = context.sections.find((section) => section.node.attrs.id === id),
        oldBlocks = old && context.supported(id) ? entries(old.node) : [],
        transform = EditorState.create({ doc: section }).tr;
      for (const entry of entries(section)) {
        const same = oldBlocks.find(
            (candidate) =>
              JSON.stringify(candidate.path) === JSON.stringify(entry.path) &&
              signature(candidate.node) === signature(entry.node),
          ),
          savedId = entry.node.attrs.pid,
          passageId = originId !== id ? uuid() : (same?.node.attrs.pid ?? savedId);
        if (savedId) aliases.set(originId + ':' + savedId, { chapterId: id, passageId });
        if (passageId !== savedId) transform.setNodeAttribute(entry.pos, 'pid', passageId);
      }
      section = transform.doc;
      const source = staged.get(id)!;
      staged.set(id, { ...source, initial: section.content });
      return section;
    },
    chapters = plan.chapters.map((chapter) => {
      if (chapter.origin === 'local') {
        const node = context.section(chapter.originId).node;
        return node.type.create(
          { ...node.attrs, title: chapter.title, kind: chapter.kind },
          node.content,
        );
      }
      const remote = incomingChapters.get(chapter.originId);
      if (!remote) throw Error('INVALID_CHAPTER');
      return compile(
        chapter.id,
        'chapter',
        remote.html,
        chapter.title,
        chapter.kind,
        'passages' in remote ? remote.passages : undefined,
        chapter.originId,
      );
    });
  for (const [id, role, html] of [
    ['notes', 'notes', plan.notes],
    ['outline', 'outline', plan.outline],
  ])
    chapters.push(html === context.html(id) ? context.section(id).node : compile(id, role, html));
  const archive = plan.archive.map((id) => ({
      id: uuid(),
      html: context.html(id),
      text: context
        .section(id)
        .node.textBetween(0, context.section(id).node.content.size, '\n\n', (node) =>
          node.type.name === 'placeholder' ? '⚑' : '',
        )
        .slice(0, 2000),
      chapterId: id,
      chapterLabel:
        options.chapterLabels[id] ??
        'Chapter ' + (local.book.chapters.findIndex((chapter) => chapter.id === id) + 1),
      date: options.date,
    })),
    darlings = [...archive, ...plan.darlings],
    selectedReviews = plan.reviews,
    reviewChanged =
      JSON.stringify(local.reviews.references) !==
        JSON.stringify(selectedReviews?.references ?? []) ||
      JSON.stringify(local.reviews.items) !== JSON.stringify(selectedReviews?.items ?? []),
    next = bookSchema.nodes.doc.create(
      { ...context.state.doc.attrs, metadata: plan.metadata, darlings },
      chapters,
    ),
    changed = !next.eq(context.state.doc) || reviewChanged,
    historyReset = changed && (plan.restructured || plan.conflicts.length > 0),
    outcome = {
      changed,
      adoptedChapterIds: plan.adopted,
      archivedDarlingIds: archive.map((value) => value.id),
      conflictChapterIds: plan.conflicts,
      structureChanged: plan.restructured || plan.conflicts.length > 0,
      historyReset,
    };
  if (!changed) return outcome;
  const nextVersion = uuid();
  // Validate the staged portable envelope before any master state, history or provenance mutation.
  Checkpoint.parse({
    book: {
      formatVersion: 'leafloom-manuscript/v2',
      mode: plan.metadata.format === 'screenplay' ? 'screenplay' : 'prose',
      revision: Math.max(context.revision, incoming.book.revision) + 1,
      version: nextVersion,
      metadata: plan.metadata,
      darlings,
      chapters: chapters
        .filter((section) => section.attrs.role === 'chapter')
        .map((section) => {
          const source = staged.get(section.attrs.id)!;
          const html =
            !source.supported || section.content.eq(source.initial)
              ? source.html
              : exportHTML(
                  context.document,
                  htmlSchema.nodes.doc.create(
                    null,
                    Array.from(section.content.content, (node) => baseNode(node)),
                  ),
                );
          return {
            id: section.attrs.id,
            html,
            version: nextVersion,
            passages: entries(section).map((entry) => ({
              id: entry.node.attrs.pid,
              path: entry.path,
              signature: signature(entry.node),
            })),
          };
        }),
    },
    reviews: { ...(selectedReviews ?? local.reviews), version: nextVersion },
    notes: plan.notes,
    outline: plan.outline,
  });
  context.finishMetadataField();
  const caret = context.selection,
    before = context.state,
    transaction = context.state.tr,
    start = before.doc.content.findDiffStart(next.content),
    end = before.doc.content.findDiffEnd(next.content);
  if (start !== null && end) {
    // Prefix and suffix matches can overlap when repeated text is inserted or removed.
    // Move both suffix bounds equally so the replacement retains its length delta.
    const overlap = Math.max(0, start - Math.min(end.a, end.b));
    transaction.replace(start, end.a + overlap, next.slice(start, end.b + overlap));
  }
  transaction
    .setDocAttribute('metadata', plan.metadata)
    .setDocAttribute('darlings', darlings)
    .setDocAttribute('version', nextVersion)
    .setMeta('addToHistory', false)
    .setStoredMarks(context.state.storedMarks);
  if (!transaction.doc.content.eq(next.content)) throw Error('INVALID_RECONCILIATION');
  const apply = () => {
    context.sources = staged;
    context.state = historyReset
      ? EditorState.create({
          doc: transaction.doc,
          selection: transaction.selection,
          plugins: before.plugins,
          storedMarks: before.storedMarks,
        })
      : before.apply(transaction);
    if (selectedReviews) {
      context.refs = new Map(
        selectedReviews.references.map((record) => [
          record.reference.id,
          structuredClone(record.reference),
        ]),
      );
      context.items = new Map(
        selectedReviews.items.map((row) => [
          row.item.id,
          { item: structuredClone(row.item), reviewId: row.reviewId, rejected: row.rejected },
        ]),
      );
      const accepted = selectedReviews.items
        .filter((row) => row.accepted)
        .map((row) => row.item.id);
      context.state = context.state.apply(
        context.state.tr
          .setDocAttribute('accepted', accepted)
          .setMeta('addToHistory', false)
          .setStoredMarks(context.state.storedMarks),
      );
      context.locations = new Map(
        selectedReviews.references.map((record) => {
          let unresolved = record.unresolved;
          const parts: Part[] = [];
          for (const segment of record.segments) {
            const alias =
                plan.reviewsFrom === 'incoming'
                  ? aliases.get(segment.chapterId + ':' + segment.passageId)
                  : undefined,
              passage = context.passage(alias?.passageId ?? segment.passageId),
              old = oldPassages.get(segment.passageId);
            if (!passage || passage.chapterId !== (alias?.chapterId ?? segment.chapterId)) {
              unresolved = true;
              continue;
            }
            if (plan.reviewsFrom === 'local' && old && !old.node.content.eq(passage.node.content)) {
              const from = transaction.mapping.mapResult(old.pos + 1 + segment.from, 1),
                to = transaction.mapping.mapResult(old.pos + 1 + segment.to, -1);
              if (from.deletedAcross || to.deletedAcross || to.pos <= from.pos) unresolved = true;
              else parts.push({ from: from.pos, to: to.pos });
            } else if (segment.to <= passage.size)
              parts.push({
                from: passage.pos + 1 + segment.from,
                to: passage.pos + 1 + segment.to,
              });
            else unresolved = true;
          }
          return [record.reference.id, { parts, deleted: record.deleted, unresolved }];
        }),
      );
    }
    context.annotationRanges = context.annotationRanges
      .map((annotation) => ({
        ...annotation,
        from: transaction.mapping.map(annotation.from, 1),
        to: transaction.mapping.map(annotation.to, -1),
      }))
      .filter((annotation) => annotation.to > annotation.from);
    context.words = context.wordCount();
    context.revision = Math.max(context.revision, incoming.book.revision) + 1;
    if (historyReset) context.referenceHistory.clear();
    context.remember();
    if (!historyReset)
      context.referenceHistory.record(
        before.doc.attrs.version,
        context.version,
        undoDepth(before),
        undoDepth(context.state),
        false,
      );
    if (caret) context.restoreSelection(caret);
    context.breakTyping = true;
    for (const fn of context.listeners)
      fn({ kind: 'changed', revision: context.revision, command: 'external.reconcile' });
  };
  if (context.telemetry) context.telemetry.sync('editor.transaction', apply, context.commandParent);
  else apply();
  return outcome;
}

export function checkpoint(
  context: CheckpointOperationsContext,
  carrier?: string,
): CheckpointValue {
  context.snapshots++;
  const op = () => {
    const metadata = structuredClone(context.state.doc.attrs.metadata);
    for (const chapter of context.chapters) {
      const initial = context.sources.get(chapter.id)!;
      if (!context.originalIds.has(chapter.id) || chapter.title !== initial.title) {
        metadata.chapterTitles = { ...metadata.chapterTitles, [chapter.id]: chapter.title };
      }
      if (!context.originalIds.has(chapter.id) || chapter.kind !== initial.kind) {
        metadata.chapterKinds = { ...metadata.chapterKinds, [chapter.id]: chapter.kind };
      }
    }
    const book = {
      formatVersion: 'leafloom-manuscript/v2',
      mode: context.state.doc.attrs.metadata.format === 'screenplay' ? 'screenplay' : 'prose',
      revision: context.revision,
      version: context.version,
      metadata,
      darlings: context.state.doc.attrs.darlings,
      chapters: context.chapters.map((c) => ({
        id: c.id,
        html: context.html(c.id),
        version: context.version,
        passages: context.passages(c.id).map((p) => ({
          id: p.id,
          path: p.path.slice(1),
          signature: signature(p.node),
        })),
      })),
    };
    const reviews = {
      formatVersion: 'neo-composed-reviews/v1',
      bookId: metadata.id,
      version: context.version,
      references: Array.from(context.refs.values(), (reference) => {
        const loc = context.locations.get(reference.id)!;
        return {
          reference,
          segments: context.segments(loc),
          deleted: loc.deleted,
          unresolved: loc.unresolved,
        };
      }),
      items: Array.from(context.items.values(), (row) => ({
        ...row,
        accepted: (context.state.doc.attrs.accepted as string[]).includes(row.item.id),
      })),
    };
    return Checkpoint.parse({
      book,
      reviews,
      notes: context.html('notes'),
      outline: context.html('outline'),
    });
  };
  return context.telemetry
    ? context.telemetry.sync('editor.snapshot', op, context.telemetry.parent(carrier))
    : op();
}
