import { z } from 'zod';
import {
  DocumentSnapshot,
  type DocumentSnapshotValue,
  type ExternalReconcileOptions,
} from '@leafloom/editor-contracts';
import { ChapterKind, type MetadataValue } from '@leafloom/document-contracts';

type Book = DocumentSnapshotValue['book'];
export type ExternalChapter = {
  id: string;
  originId: string;
  origin: 'local' | 'incoming';
  title: string;
  kind: string;
};
export type ExternalPlan = {
  chapters: ExternalChapter[];
  metadata: MetadataValue;
  darlings: Book['darlings'];
  notes: string;
  outline: string;
  reviews: DocumentSnapshotValue['reviews'];
  reviewsFrom: 'local' | 'incoming';
  adopted: string[];
  archive: string[];
  conflicts: string[];
  restructured: boolean;
  options: ExternalReconcileOptions;
};
/** Exact original word-bag rule: this identifies lost words, not textual similarity. */
export function onlyDrops(page: string, disk: string): boolean {
  const bag = (html: string) => {
      const words = new Map<string, number>();
      for (const word of html.replace(/<[^>]*>/g, ' ').split(/\s+/))
        if (word) words.set(word, (words.get(word) ?? 0) + 1);
      return words;
    },
    here = bag(page),
    there = bag(disk);
  for (const [word, count] of there) if (count > (here.get(word) ?? 0)) return false;
  for (const [word, count] of here) if (count > (there.get(word) ?? 0)) return true;
  return false;
}
/** Source metaSig, with order projected from the portable envelope and side data excluded. */
export function metadataSignature(book: Book): string {
  const metadata: Record<string, unknown> = {
      ...book.metadata,
      chapterOrder: book.chapters.map((chapter) => chapter.id),
    },
    value: Record<string, unknown> = {};
  for (const key of Object.keys(metadata).sort()) {
    if (['lastPosition', 'modified', 'wordCount', 'dailyCounts', 'stickies'].includes(key))
      continue;
    const next = metadata[key];
    if (next === undefined || next === null || next === '') continue;
    if (typeof next === 'object' && Object.keys(next).length === 0) continue;
    value[key] = next;
  }
  return JSON.stringify(value);
}
function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
/** Select a whole companion dataset; never merge competing strings or records. */
function companion<T>(baseline: T, local: T, incoming: T): T {
  if (same(local, baseline)) return incoming;
  if (same(incoming, baseline) || same(incoming, local)) return local;
  throw Error('COMPANION_CONFLICT');
}
function mapValue(metadata: MetadataValue, key: string, id: string, fallback: string): string {
  const parsed = z.record(z.string(), z.string()).safeParse(metadata[key]);
  return parsed.success ? (parsed.data[id] ?? fallback) : fallback;
}
const reviewBody = (review: DocumentSnapshotValue['reviews']) =>
  review ? { bookId: review.bookId, references: review.references, items: review.items } : null;

/** Promote source staging/order/conflict rules without a general text merge algorithm. */
export function planExternal(
  baselineRaw: DocumentSnapshotValue,
  localRaw: DocumentSnapshotValue,
  incomingRaw: DocumentSnapshotValue,
  rawOptions: ExternalReconcileOptions,
): ExternalPlan {
  const baseline = DocumentSnapshot.parse(baselineRaw),
    local = DocumentSnapshot.parse(localRaw),
    incoming = DocumentSnapshot.parse(incomingRaw),
    options = z
      .strictObject({
        date: z.iso.datetime(),
        conflictSuffix: z.string().min(1),
        chapterLabels: z.record(z.string(), z.string()),
      })
      .parse(rawOptions),
    id = local.book.metadata.id;
  if (baseline.book.metadata.id !== id || incoming.book.metadata.id !== id)
    throw Error('INVALID_BOOK');
  const mine = metadataSignature(local.book) !== metadataSignature(baseline.book),
    theirs = metadataSignature(incoming.book) !== metadataSignature(baseline.book),
    localById = new Map(local.book.chapters.map((chapter) => [chapter.id, chapter])),
    baseById = new Map(baseline.book.chapters.map((chapter) => [chapter.id, chapter])),
    incomingById = new Map(incoming.book.chapters.map((chapter) => [chapter.id, chapter])),
    localOrder = local.book.chapters.map((chapter) => chapter.id),
    remoteOrder = incoming.book.chapters.map((chapter) => chapter.id),
    order = [...(theirs && !mine ? remoteOrder : localOrder)];
  if (theirs) {
    const other = mine ? remoteOrder : localOrder;
    other.forEach((chapterId, index) => {
      if (order.includes(chapterId)) return;
      if (
        mine
          ? !/[^\s]/.test((incomingById.get(chapterId)?.html ?? '').replace(/<[^>]*>/g, ''))
          : localById.get(chapterId)?.html === baseById.get(chapterId)?.html
      )
        return;
      const previous = other
        .slice(0, index)
        .reverse()
        .find((previousId) => order.includes(previousId));
      order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, chapterId);
    });
  }
  const restructured = theirs && (!mine || order.length !== localOrder.length),
    metadata = structuredClone(
      restructured && !mine ? incoming.book.metadata : local.book.metadata,
    );
  // Local position never jumps merely because metadata arrived. Resume is a separate activity-gated action.
  if (local.book.metadata.lastPosition !== undefined)
    metadata.lastPosition = local.book.metadata.lastPosition;
  else delete metadata.lastPosition;
  const stickyValue = companion(
    baseline.book.metadata.stickies ?? null,
    local.book.metadata.stickies ?? null,
    incoming.book.metadata.stickies ?? null,
  );
  if (stickyValue === null) delete metadata.stickies;
  else metadata.stickies = stickyValue;
  // Review deletion has no reconciliation command. An omitted local attachment must remain recoverable.
  const remoteReferences = new Set(
      incoming.reviews?.references.map((reference) => reference.reference.id) ?? [],
    ),
    remoteItems = new Set(incoming.reviews?.items.map((item) => item.item.id) ?? []);
  if (
    !same(reviewBody(incoming.reviews), reviewBody(baseline.reviews)) &&
    ((local.reviews?.references.some(
      (reference) => !remoteReferences.has(reference.reference.id),
    ) ??
      false) ||
      (local.reviews?.items.some((item) => !remoteItems.has(item.item.id)) ?? false))
  )
    throw Error('COMPANION_CONFLICT');
  const notes = companion(baseline.notes, local.notes, incoming.notes),
    outline = companion(baseline.outline, local.outline, incoming.outline),
    darlings = companion(baseline.book.darlings, local.book.darlings, incoming.book.darlings),
    selectedReviewBody = companion(
      reviewBody(baseline.reviews),
      reviewBody(local.reviews),
      reviewBody(incoming.reviews),
    ),
    reviewsFrom = same(selectedReviewBody, reviewBody(local.reviews)) ? 'local' : 'incoming',
    reviews = reviewsFrom === 'local' ? local.reviews : incoming.reviews,
    adopted: string[] = [],
    archive: string[] = [],
    conflicts: string[] = [],
    chapters: ExternalChapter[] = [];
  // Original orphan chapter files survive structural removal. A flat book keeps those bytes in Darlings.
  for (const chapter of local.book.chapters)
    if (!order.includes(chapter.id) && chapter.html) archive.push(chapter.id);
  for (const chapterId of order) {
    const localChapter = localById.get(chapterId),
      remoteChapter = incomingById.get(chapterId),
      baselineChapter = baseById.get(chapterId),
      title = mapValue(metadata, 'chapterTitles', chapterId, ''),
      kindValue = ChapterKind.safeParse(mapValue(metadata, 'chapterKinds', chapterId, '')),
      kind = kindValue.success
        ? kindValue.data
        : order.length >= 2 && order[0] === chapterId && metadata.prologue === chapterId
          ? 'prologue'
          : order.length >= 2 && order.at(-1) === chapterId && metadata.epilogue === chapterId
            ? 'epilogue'
            : 'chapter';
    let origin: 'local' | 'incoming' = localChapter ? 'local' : 'incoming';
    if (
      localChapter &&
      remoteChapter &&
      remoteChapter.html !== baselineChapter?.html &&
      !(remoteChapter.html === '' && baselineChapter?.html)
    ) {
      if (localChapter.html === baselineChapter?.html) {
        if (onlyDrops(localChapter.html, remoteChapter.html)) archive.push(chapterId);
        origin = 'incoming';
        adopted.push(chapterId);
      } else {
        const twin = crypto.randomUUID();
        chapters.push({ id: chapterId, originId: chapterId, origin: 'local', title, kind });
        chapters.push({
          id: twin,
          originId: chapterId,
          origin: 'incoming',
          title: (title + ' ' + options.conflictSuffix).trim(),
          kind: 'chapter',
        });
        conflicts.push(twin);
        continue;
      }
    }
    chapters.push({ id: chapterId, originId: chapterId, origin, title, kind });
  }
  return {
    chapters,
    metadata,
    darlings,
    notes,
    outline,
    reviews,
    reviewsFrom,
    adopted,
    archive,
    conflicts,
    restructured,
    options,
  };
}
