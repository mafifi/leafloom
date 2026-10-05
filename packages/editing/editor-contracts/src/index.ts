import type { ManuscriptModeValue, ScreenplayElementValue } from '@leafloom/document-contracts';
import { z } from 'zod';
import {
  Manuscript,
  SourceBook,
  type StickyValue,
  type JSONValue,
  type MetadataValue,
} from '@leafloom/document-contracts';
import {
  Reviews,
  type ReviewInput,
  type PassageReference,
  type ReviewItemValue,
} from '@leafloom/review-contracts';
export { Manuscript, SourceBook } from '@leafloom/document-contracts';
export { Reviews, Input, ReviewOutput } from '@leafloom/review-contracts';
export type { ReviewInput, ReviewsValue } from '@leafloom/review-contracts';
export const Name = z.enum(['manuscript', 'reviews', 'notes', 'outline']);
export type DocumentName = z.infer<typeof Name>;
/** Native text context; the preceding prefix ends at the current text-node boundary. */
export type TypographicInput = {
  character: string;
  language: string;
  interfaceLanguage: string;
  previousTextNodePrefix: string;
  paragraphPrefix: string;
  chapterText: string;
  bookText: string;
  collapsed: boolean;
};
export type TypographicReplacement = { replaceBefore: number; text: string };
export interface TextTypographyPort {
  query(input: TypographicInput): TypographicReplacement | null;
}
export const Checkpoint = z
  .strictObject({ book: Manuscript, reviews: Reviews, notes: z.string(), outline: z.string() })
  .superRefine((value, ctx) => {
    if (value.book.version !== value.reviews.version)
      ctx.addIssue({
        code: 'custom',
        path: ['reviews', 'version'],
        message: 'Checkpoint versions must agree',
      });
    if (value.book.metadata.id !== value.reviews.bookId)
      ctx.addIssue({
        code: 'custom',
        path: ['reviews', 'bookId'],
        message: 'Checkpoint book identities must agree',
      });
  });
export type CheckpointValue = z.infer<typeof Checkpoint>;
export const DocumentSnapshot = z
  .strictObject({
    book: SourceBook,
    reviews: Reviews.nullable(),
    notes: z.string(),
    outline: z.string(),
  })
  .superRefine((value, ctx) => {
    if (
      value.reviews &&
      (value.reviews.bookId !== value.book.metadata.id ||
        !('version' in value.book) ||
        value.reviews.version !== value.book.version)
    )
      ctx.addIssue({ code: 'custom', message: 'Inconsistent companion review snapshot' });
  });
export type DocumentSnapshotValue = z.infer<typeof DocumentSnapshot>;
export type ExternalReconcileOptions = {
  date: string;
  conflictSuffix: string;
  chapterLabels: Record<string, string>;
};
export type ExternalReconcileOutcome = {
  changed: boolean;
  adoptedChapterIds: string[];
  archivedDarlingIds: string[];
  conflictChapterIds: string[];
  structureChanged: boolean;
  historyReset: boolean;
};
export type Receipt = { revision: number; versions: Record<DocumentName, string> };
export type Opened = {
  book: z.infer<typeof SourceBook>;
  reviews: import('@leafloom/review-contracts').ReviewsValue | null;
  notes: string;
  outline: string;
  versions: Record<DocumentName, string>;
  recovered: boolean;
};
export const OpenReply = z.strictObject({
  book: SourceBook,
  reviews: Reviews.nullable(),
  notes: z.string(),
  outline: z.string(),
  versions: z.record(Name, z.string().regex(/^[0-9a-f]{64}$/)),
  recovered: z.boolean(),
  lease: z.uuid().nullable(),
  readOnly: z.boolean(),
});
export const SaveReply = z.strictObject({
  revision: z.number().int().nonnegative(),
  versions: z.record(Name, z.string().regex(/^[0-9a-f]{64}$/)),
});
export interface DocumentStore {
  open(): Promise<Opened>;
  save(
    checkpoint: CheckpointValue,
    expected: Record<DocumentName, string>,
    traceparent?: string,
  ): Promise<Receipt>;
}
export const Envelope = z.strictObject({
  requestId: z.uuid(),
  traceparent: z
    .string()
    .regex(/^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-0[01]$/)
    .optional(),
  command: z.discriminatedUnion('method', [
    z.strictObject({ method: z.literal('open') }),
    z.strictObject({
      method: z.literal('save'),
      lease: z.uuid(),
      checkpoint: Checkpoint,
      expected: z.record(Name, z.string().regex(/^[0-9a-f]{64}$/)),
    }),
    z.strictObject({ method: z.literal('dirty'), revision: z.number().int().nonnegative() }),
    z.strictObject({ method: z.literal('close') }),
    z.strictObject({ method: z.literal('finish-close'), discard: z.boolean() }),
    z.strictObject({ method: z.literal('diagnostics') }),
  ]),
});
export type Command = z.infer<typeof Envelope>['command'];
export interface HostPort {
  request<T>(
    command: Command,
    traceparent?: string,
  ): Promise<{ ok: true; value: T } | { ok: false; code: string }>;
  onCloseRequested(fn: () => void): () => void;
}
export type ChapterRow = {
  id: string;
  title: string;
  kind: string;
  number: number | null;
  label: string;
};
export type CoreEvent = {
  kind: 'changed' | 'selection' | 'decoration';
  revision: number;
  command: string;
};

export interface AuthoringLifecycle {
  readonly readOnly: boolean;
  dirty(revision: number): void;
  onCloseRequested(fn: () => void): () => void;
  finish(discard: boolean): Promise<{ ok: true; value: unknown } | { ok: false; code: string }>;
}
export type Resolution = {
  status: 'current' | 'changed' | 'deleted' | 'unresolved';
  segments: { chapterId: string; passageId: string; from: number; to: number }[];
  text: string;
};
export type ReviewRow = ReviewItemValue & { state: string; resolutions: Resolution[] };
export type Annotation = {
  id: string;
  kind: 'spelling' | 'review' | 'search';
  passageId: string;
  from: number;
  to: number;
  message?: string;
};
export type SurfaceContextTarget = Annotation & { text: string; x: number; y: number };
export type VimState = { enabled: boolean; navigation: boolean; visual: boolean };
export type SurfaceHooks = {
  activate?(target: { kind: 'sticky' | 'review'; id: string }): void;
  copy?(value: ClipboardValue): void;
  search?(): void;
  vimState?(state: VimState): void;
  contextMenu?(target: SurfaceContextTarget): void;
};
export type RestoreOutcome = {
  location: 'anchor' | 'bookmark' | 'context' | 'fallback';
  chapterId: string;
  notice?: string;
  restoredPassageId?: string;
};
export type ClipboardValue = { text: string; html?: string; matchStyle?: boolean };
export type MetadataField = 'title' | 'subtitle' | 'author';
export type MetadataPatch = { title?: string; subtitle?: string; author?: string };
export type DarlingSearchMatch = { darlingId: string; runIndex: number; from: number; to: number };
export type DarlingRow = {
  id: string;
  html: string;
  text?: string;
  chapterId?: string | null;
  chapterLabel?: string;
  date?: string;
};
export type OutlineSearchMatch = OutlineTarget & { from: number; to: number };
export type ContentsRow = {
  chapterId: string;
  label: string;
  type: 'part' | 'chapter' | 'page';
  level: 0 | 1;
};
export type OutlineTarget = { chapterId: string; sectionId?: string };
export type OutlineRow = OutlineTarget & {
  kind: 'chapter' | 'section' | 'part';
  label: string;
  text: string;
};
export type EditorSelection = { chapterId: string; passageId: string; from: number; to: number };
export type SearchMatch = { chapterId: string; passageId: string; from: number; to: number };
export type ActiveFormatting = {
  poetry: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
};
export type ScreenplayScene = { chapterId: string; passageId: string; label: string };
export interface EditorPort {
  readonly manuscriptMode: ManuscriptModeValue;
  readonly screenplayScenes: ScreenplayScene[];
  setManuscriptMode(mode: ManuscriptModeValue): boolean;
  setScreenplayElement(element: ScreenplayElementValue): boolean;
  screenplayTab(reverse?: boolean): boolean;
  readonly activeFormatting: ActiveFormatting;
  searchDarlings(query: string): DarlingSearchMatch[];
  searchOutline(query: string): OutlineSearchMatch[];
  replaceOutlineMatches(matches: OutlineSearchMatch[], text: string): void;
  contentsRows(customChapterTitles?: boolean): ContentsRow[];
  alignParagraph(value: 'left' | 'center' | 'right' | 'justify'): boolean;
  readonly outlineRows: OutlineRow[];
  editOutlineRow(target: OutlineTarget, text: string): void;
  outlineEnter(target: OutlineTarget, before?: boolean): OutlineTarget;
  outlineIndent(
    target: OutlineTarget,
    reverse?: boolean,
  ): { target: OutlineTarget; notice?: string };
  outlineDelete(target: OutlineTarget): OutlineTarget;
  readonly selection: EditorSelection | null;
  restoreSelection(value: unknown): boolean;
  readonly metadata: MetadataValue;
  readonly annotations: Annotation[];
  readonly stickies: StickyValue[];
  readonly title: string;
  readonly author: string;
  readonly revision: number;
  readonly words: number;
  readonly selectedWords: number;
  setCoverBookkeeping(patch: { coverArt?: JSONValue; coverMode?: 'painted' }): void;
  wordCountFor(sectionId: string): number;
  readonly snapshots: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly chapters: ChapterRow[];
  readonly activeSection: { id: string; role: string } | null;
  readonly darlings: DarlingRow[];
  subscribe(fn: (e: CoreEvent) => void): () => void;
  setTraceParent(carrier?: string): void;
  supported(id: string): boolean;
  canEdit(id: string): boolean;
  select(id: string, from: number, to?: number): void;
  setAnnotations(annotations: Annotation[]): void;
  replacePassageText(id: string, from: number, to: number, text: string): void;
  createSticky(text: string): string;
  updateSticky(id: string, patch: { text?: string; resolved?: boolean }): void;
  removeSticky(id: string): void;
  selectSticky(id: string, after?: boolean): boolean;
  configureTypography(preferences: {
    language?: string;
    interfaceLanguage?: string;
    markdown?: boolean;
  }): void;
  insert(text: string, options?: { typography?: boolean }): void;
  copySelection(): ClipboardValue;
  cutSelection(): ClipboardValue;
  selectAll(id?: string): void;
  paste(value: ClipboardValue): void;
  indent(reverse?: boolean): void;
  setBookkeeping(
    patch: Partial<
      Record<'wordCount' | 'dailyCounts' | 'lastPosition' | 'modified' | 'uuid', JSONValue>
    >,
  ): void;
  updateMetadata(patch: Record<string, JSONValue>): void;
  setMetadata(patch: MetadataPatch): void;
  /** Persist live native field values; native typing history remains with the field until finish. */
  editMetadataField(field: MetadataField, value: string): void;
  /** Finish on blur/Enter/close, never on autosave; adds one master history command. */
  finishMetadataField(field?: MetadataField): void;
  setChapterKind(
    id: string,
    kind: string,
    options?: { copyrightStarter?: { notice: string; rights: string } },
  ): void;
  togglePoetry(): void;
  insertOpeningPoetry(id: string): void;
  selectPassage(id: string, from: number, to?: number): void;
  replaceMatches(matches: SearchMatch[], text: string): void;
  search(query: string, scope?: 'manuscript' | 'notes' | 'outline' | 'all'): SearchMatch[];
  enter(shift?: boolean): boolean;
  backspace(): boolean;
  deleteForward(): boolean;
  resetEnter(): void;
  format(mark: 'bold' | 'italic'): void;
  undo(): boolean;
  redo(): boolean;
  createChapter(
    title: string,
    index?: number,
    options?: { kind: string; copyrightStarter?: { notice: string; rights: string } },
  ): string;
  renameChapter(id: string, title: string): void;
  duplicateChapter(id: string): string;
  deleteChapter(id: string): void;
  reorderChapter(id: string, index: number): void;
  movePassage(id: string, targetId: string, index?: number): void;
  moveSelection(targetId: string, offset: number): void;
  archive(): void;
  restore(id: string): RestoreOutcome;
  removeDarling(id: string): void;
  passageRows(
    sectionId?: string,
  ): { id: string; chapterId: string; kind: string; text: string; size: number }[];
  /** Stable section snapshot until its author content changes; excludes planned prose. */
  spellingPassages(
    sectionId: string,
  ): readonly { id: string; runs: readonly { from: number; text: string }[] }[];
  capture(id: string, from: number, to: number): PassageReference;
  captureSelection(): PassageReference;
  resolve(id: string): Resolution;
  extract(ids: string[], category: ReviewInput['category']): ReviewInput;
  receive(reply: unknown): void;
  reviewRows(): ReviewRow[];
  accept(id: string): { ok: boolean; code?: string };
  reject(id: string): void;
  checkpoint(traceparent?: string): CheckpointValue;
  reconcileExternal(
    baseline: DocumentSnapshotValue,
    incoming: DocumentSnapshotValue,
    options: ExternalReconcileOptions,
  ): ExternalReconcileOutcome;
}
export type PresentationPreferences = {
  typewriter?: boolean;
  focus?: 'off' | 'sentence' | 'paragraph';
  language?: string;
  publicationPage?: { kind: string; label: string; placeholder?: string };
};
export interface SurfacePort<Host = unknown> {
  configurePresentation(preferences: PresentationPreferences): void;
  archiveDraggedSelection(): boolean;
  setVim(enabled: boolean): void;
  readonly vimState: VimState;
  setHooks(hooks: SurfaceHooks): void;
  renderBook(root: Host, auxiliary: Host, panel: string, enabled: boolean): void;
  render(main: Host, auxiliary: Host, current: string, panel: string, enabled: boolean): void;
  update(current: string, panel: string, enabled: boolean): void;
  focus(options?: { preventScroll?: boolean }): void;
  revealSelection(options?: {
    block?: 'start' | 'center' | 'end' | 'nearest';
    passageId?: string;
    viewportFraction?: number;
  }): void;
  destroy(): void;
}
export type SurfaceActions = {
  undo(): void;
  redo(): void;
  save(): void;
  format(mark: 'bold' | 'italic'): void;
  archive(): void;
};

export type LifecycleCode =
  | 'BUSY'
  | 'EXTERNAL_CHANGE'
  | 'CORRUPT'
  | 'DISK_ERROR'
  | 'DISK_FULL'
  | 'INVALID'
  | 'UNAUTHORIZED'
  | 'UNSAVED'
  | 'SAVE_UNCERTAIN';
export class LifecycleError extends Error {
  readonly code: LifecycleCode;
  constructor(code: LifecycleCode) {
    super(code);
    this.code = code;
  }
}
export {
  parseRemotePosition,
  remotePositionEligibility,
  type RemotePosition,
  type RemotePositionContext,
} from './remote-position.ts';
