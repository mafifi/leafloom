import type { ManuscriptModeValue } from '@leafloom/document-contracts';
import {
  ChapterKind,
  Sticky,
  type JSONValue,
  type MetadataValue,
  type StickyValue,
} from '@leafloom/document-contracts';
import type {
  ActiveFormatting,
  Annotation,
  EditorPort,
  EditorSelection,
  MetadataField,
  OutlineRow,
  Resolution,
} from '@leafloom/editor-contracts';
import { Reviews, SourceBook, type CoreEvent, type ReviewInput } from '@leafloom/editor-contracts';
import { type PassageReference, type ReviewItemValue } from '@leafloom/review-contracts';
import type { Context } from '@opentelemetry/api';
import { closeHistory, history, redoDepth, undoDepth } from 'prosemirror-history';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import * as annotationOperations from './annotation-operations';
import { projectChapters } from './chapter-labels';
import * as chapterOperations from './chapter-operations';
import * as checkpointOperations from './checkpoint-operations';
import * as clipboardOperations from './clipboard-operations';
import * as darlingOperations from './darling-operations';
import { Darling, projectDarlings } from './darlings';
import { editorCommands, type EditorCommandQueries } from './editor-commands';
import { runText } from './identity';
import { settleChapterKinds } from './metadata';
import { type MetadataSlot } from './metadata-fields';
import * as metadataOperations from './metadata-operations';
import { bookSchema, sectionsFrom, type Location, type PassageInfo } from './model';
import { OutlineOperations } from './outline';
import * as paragraphOperations from './paragraph-operations';
import * as passageOperations from './passage-operations';
import { ReferenceHistory } from './reference-history';
import * as reviewOperations from './review-operations';
import * as screenplay from './screenplay-operations';
import type { CompositionTelemetry } from './telemetry';
import * as textOperations from './text-operations';
import * as transactionOperations from './transaction-operations';
import { type TypographyPreferences } from './typography';
import { countWords } from './word-count';
export { bookSchema } from './model';
export type SectionSource = {
  html: string;
  initial: Fragment;
  supported: boolean;
  title: string;
  kind: string;
  indexedReadOnly?: boolean;
};
const uuid = () => crypto.randomUUID();
export class BookCore implements EditorPort {
  private readonly operations: EditorCommandQueries &
    passageOperations.PassageOperationsContext &
    transactionOperations.TransactionOperationsContext &
    textOperations.TextOperationsContext &
    annotationOperations.AnnotationOperationsContext &
    checkpointOperations.CheckpointOperationsContext &
    metadataOperations.MetadataOperationsContext &
    paragraphOperations.ParagraphOperationsContext &
    clipboardOperations.ClipboardOperationsContext &
    darlingOperations.DarlingOperationsContext &
    chapterOperations.ChapterOperationsContext &
    reviewOperations.ReviewOperationsContext = (() => {
    const owner = this;
    return {
      screenplayContext: () => owner.screenplayContext(),
      get outlineRows() {
        return owner.outlineRows;
      },
      get outlineOps() {
        return owner.outlineOps;
      },
      selectPassage: (...args) => owner.selectPassage(...args),
      get spellingCache() {
        return owner.spellingCache;
      },
      get sources() {
        return owner.sources;
      },
      get document() {
        return owner.document;
      },
      get state() {
        return owner.state;
      },
      owner: (...args) => owner.owner(...args),
      canEdit: (...args) => owner.canEdit(...args),
      get sections() {
        return owner.sections;
      },
      supported: (...args) => owner.supported(...args),
      canEditSelection: (...args) => owner.canEditSelection(...args),
      get passageContent() {
        return owner.passageContent;
      },
      set passageContent(value) {
        owner.passageContent = value;
      },
      get passageCache() {
        return owner.passageCache;
      },
      set passageCache(value) {
        owner.passageCache = value;
      },
      get passageById() {
        return owner.passageById;
      },
      set passageById(value) {
        owner.passageById = value;
      },
      get passagesBySection() {
        return owner.passagesBySection;
      },
      set passagesBySection(value) {
        owner.passagesBySection = value;
      },
      passages: (...args) => owner.passages(...args),
      get referenceHistory() {
        return owner.referenceHistory;
      },
      get version() {
        return owner.version;
      },
      get locations() {
        return owner.locations;
      },
      segments: (...args) => owner.segments(...args),
      set state(value) {
        owner.state = value;
      },
      get listeners() {
        return owner.listeners;
      },
      get revision() {
        return owner.revision;
      },
      set revision(value) {
        owner.revision = value;
      },
      get bookkeeping() {
        return owner.bookkeeping;
      },
      remember: (...args) => owner.remember(...args),
      set locations(value) {
        owner.locations = value;
      },
      passage: (...args) => owner.passage(...args),
      get annotationRanges() {
        return owner.annotationRanges;
      },
      set annotationRanges(value) {
        owner.annotationRanges = value;
      },
      get refs() {
        return owner.refs;
      },
      get metadataEdit() {
        return owner.metadataEdit;
      },
      set metadataEdit(value) {
        owner.metadataEdit = value;
      },
      get words() {
        return owner.words;
      },
      set words(value) {
        owner.words = value;
      },
      wordCount: (...args) => owner.wordCount(...args),
      dispatch: (...args) => owner.dispatch(...args),
      get preferences() {
        return owner.preferences;
      },
      set preferences(value) {
        owner.preferences = value;
      },
      get enterSequence() {
        return owner.enterSequence;
      },
      resetEnter: (...args) => owner.resetEnter(...args),
      get breakTyping() {
        return owner.breakTyping;
      },
      set breakTyping(value) {
        owner.breakTyping = value;
      },
      requireEditableSelection: (...args) => owner.requireEditableSelection(...args),
      get inputMarks() {
        return owner.inputMarks;
      },
      section: (...args) => owner.section(...args),
      insert: (...args) => owner.insert(...args),
      get items() {
        return owner.items;
      },
      get stickies() {
        return owner.stickies;
      },
      checkpoint: (...args) => owner.checkpoint(...args),
      set sources(value) {
        owner.sources = value;
      },
      makeSection: (...args) => owner.makeSection(...args),
      html: (...args) => owner.html(...args),
      finishMetadataField: (...args) => owner.finishMetadataField(...args),
      get selection() {
        return owner.selection;
      },
      set refs(value) {
        owner.refs = value;
      },
      set items(value) {
        owner.items = value;
      },
      restoreSelection: (...args) => owner.restoreSelection(...args),
      get telemetry() {
        return owner.telemetry;
      },
      get commandParent() {
        return owner.commandParent;
      },
      get snapshots() {
        return owner.snapshots;
      },
      set snapshots(value) {
        owner.snapshots = value;
      },
      get chapters() {
        return owner.chapters;
      },
      get originalIds() {
        return owner.originalIds;
      },
      applyBookkeeping: (...args) => owner.applyBookkeeping(...args),
      set bookkeeping(value) {
        owner.bookkeeping = value;
      },
      get metadata() {
        return owner.metadata;
      },
      set enterSequence(value) {
        owner.enterSequence = value;
      },
      get clipboardStickies() {
        return owner.clipboardStickies;
      },
      set clipboardStickies(value) {
        owner.clipboardStickies = value;
      },
      rememberClipboardStickies: (...args) => owner.rememberClipboardStickies(...args),
      copySelection: (...args) => owner.copySelection(...args),
      get trustedBookmarks() {
        return owner.trustedBookmarks;
      },
      get darlings() {
        return owner.darlings;
      },
      capture: (...args) => owner.capture(...args),
      content: (...args) => owner.content(...args),
      resolve: (...args) => owner.resolve(...args),
      get requests() {
        return owner.requests;
      },
    };
  })();
  private readonly commands = editorCommands(this.operations);

  commandParent: Context | undefined;
  state: EditorState;
  revision: number;
  words = 0;
  snapshots = 0;
  private readonly outlineOps = new OutlineOperations({
    state: () => this.state,
    chapters: () => this.chapters,
    section: (id) => this.section(id),
    createChapter: (id) => this.makeSection(id, 'chapter', '<p></p>', '', 'chapter'),
    wordCount: (id) => this.wordCountFor(id),
    dispatch: (transaction, command) => this.dispatch(transaction, command),
  });
  private metadataEdit: { field: MetadataField; before: MetadataSlot; version: string } | null =
    null;
  private bookkeeping: Record<string, JSONValue> = {};
  private annotationRanges: { value: Annotation; from: number; to: number; expected: string }[] =
    [];
  private preferences: TypographyPreferences = { language: 'en', markdown: true };
  private breakTyping = false;
  private enterSequence: { stage: 1 | 2; sectionId: string; tailId: string; time: number } | null =
    null;
  private readonly trustedBookmarks = new Set<string>();
  private passageContent: Fragment | null = null;
  private passageCache: PassageInfo[] = [];
  private clipboardStickies = new Map<string, StickyValue>();
  private passageById = new Map<string, PassageInfo>();
  private passagesBySection = new Map<string, PassageInfo[]>();
  private sources = new Map<string, SectionSource>();
  private originalIds = new Set<string>();
  private refs = new Map<string, PassageReference>();
  private locations = new Map<string, Location>();
  private items = new Map<string, { item: ReviewItemValue; reviewId: string; rejected: boolean }>();
  private requests = new Map<string, ReviewInput>();
  private readonly referenceHistory = new ReferenceHistory();
  private listeners = new Set<(e: CoreEvent) => void>();
  constructor(
    readonly document: Document,
    raw: unknown,
    reviewData: unknown | null,
    notes: string,
    outline: string,
    private telemetry?: CompositionTelemetry,
  ) {
    const book = SourceBook.parse(raw);
    if ('version' in book)
      for (const value of book.darlings) {
        const parsed = Darling.safeParse(value);
        if (parsed.success) this.trustedBookmarks.add(parsed.data.id);
      }
    this.revision = book.revision;
    const metadata = structuredClone(book.metadata);
    if (book.formatVersion === 'leafloom-manuscript/v2' && book.mode === 'screenplay')
      metadata.format = 'screenplay';
    if (
      settleChapterKinds(
        metadata,
        book.chapters.map((chapter) => chapter.id),
      )
    )
      this.revision++;
    for (const key of ['wordCount', 'dailyCounts', 'lastPosition', 'modified', 'uuid'])
      if (metadata[key] !== undefined) this.bookkeeping[key] = metadata[key];
    this.originalIds = new Set(book.chapters.map((c) => c.id));
    const titleMap = z.record(z.string(), z.string()).safeParse(metadata.chapterTitles),
      kindMap = z.record(z.string(), z.json()).safeParse(metadata.chapterKinds);
    const version = 'version' in book ? book.version : uuid();
    const sections = book.chapters.map((ch) =>
      this.makeSection(
        ch.id,
        'chapter',
        ch.html,
        titleMap.success ? (titleMap.data[ch.id] ?? '') : '',
        kindMap.success && ChapterKind.safeParse(kindMap.data[ch.id]).success
          ? ChapterKind.parse(kindMap.data[ch.id])
          : book.chapters.length >= 2 &&
              book.chapters[0].id === ch.id &&
              metadata.prologue === ch.id
            ? 'prologue'
            : book.chapters.length >= 2 &&
                book.chapters.at(-1)?.id === ch.id &&
                metadata.epilogue === ch.id
              ? 'epilogue'
              : 'chapter',
        'passages' in ch ? ch.passages : undefined,
        undefined,
        book.formatVersion !== 'leafloom-manuscript/v2',
      ),
    );
    sections.push(
      this.makeSection('notes', 'notes', notes, ''),
      this.makeSection('outline', 'outline', outline, ''),
    );
    const existingStickies = z.array(Sticky).safeParse(metadata.stickies ?? []);
    if (existingStickies.success) {
      const stickies = [...existingStickies.data],
        ids = new Set(stickies.map((sticky) => sticky.id));
      for (const section of sections)
        section.descendants((node) => {
          if (node.type.name === 'placeholder' && !ids.has(node.attrs.sid)) {
            ids.add(node.attrs.sid);
            stickies.push(
              Sticky.parse({
                id: node.attrs.sid,
                chapterId: section.attrs.id,
                text: '',
                resolved: false,
              }),
            );
          }
        });
      if (stickies.length !== existingStickies.data.length) {
        metadata.stickies = stickies;
        this.revision++;
      }
    }
    this.state = EditorState.create({
      doc: bookSchema.nodes.doc.create(
        { metadata, darlings: book.darlings, version, accepted: [] },
        sections,
      ),
      plugins: [history()],
    });
    this.words = this.wordCount();
    if (reviewData) {
      const data = Reviews.parse(reviewData);
      if (data.bookId !== metadata.id) throw Error('INVALID_REVIEW_BOOK');
      for (const record of data.references) {
        if (this.refs.has(record.reference.id)) throw Error('INVALID_REFERENCE');
        this.refs.set(record.reference.id, record.reference);
        let loc: Location = {
          parts: [],
          deleted: record.deleted,
          unresolved: record.unresolved || data.version !== version,
        };
        if (!loc.unresolved && !loc.deleted) {
          loc.parts = record.segments.map((s) => {
            const p = this.passage(s.passageId);
            if (!p || p.chapterId !== s.chapterId || s.to > p.size)
              throw Error('INVALID_REFERENCE');
            return { from: p.pos + 1 + s.from, to: p.pos + 1 + s.to };
          });
          if (
            !loc.parts.length ||
            loc.parts.some((p, i) =>
              loc.parts.some((q, j) => i !== j && p.from < q.to && p.to > q.from),
            )
          )
            throw Error('INVALID_REFERENCE');
        }
        this.locations.set(record.reference.id, loc);
      }
      const accepted: string[] = [];
      for (const row of data.items) {
        if (this.items.has(row.item.id) || row.item.references.some((id) => !this.refs.has(id)))
          throw Error('INVALID_REVIEW');
        this.items.set(row.item.id, {
          item: row.item,
          reviewId: row.reviewId,
          rejected: row.rejected,
        });
        if (row.accepted) accepted.push(row.item.id);
      }
      this.state = EditorState.create({
        doc: this.state.doc.type.create(
          { ...this.state.doc.attrs, accepted },
          this.state.doc.content,
        ),
        plugins: [history()],
      });
    }
    this.restoreSelection(metadata.lastPosition);
    this.remember();
  }
  private makeSection(
    id: string,
    role: string,
    html: string,
    title: string,
    kind = 'chapter',
    index?: { id: string; path: number[]; signature: string }[],
    sourceStore = this.sources,
    legacyIdentity = false,
  ): PMNode {
    return passageOperations.makeSection(
      this.operations,
      id,
      role,
      html,
      title,
      kind,
      index,
      sourceStore,
      legacyIdentity,
    );
  }
  get manuscriptMode(): ManuscriptModeValue {
    return this.metadata.format === 'screenplay' ? 'screenplay' : 'prose';
  }
  get screenplayScenes() {
    return this.manuscriptMode === 'screenplay'
      ? this.passages()
          .filter(
            (p) =>
              p.node.attrs.screenplay === 'scene-heading' &&
              this.section(p.chapterId).node.attrs.role === 'chapter',
          )
          .map((p) => ({ chapterId: p.chapterId, passageId: p.id, label: p.text }))
      : [];
  }
  private screenplayContext(): screenplay.ScreenplayContext {
    return {
      state: this.state,
      editable: () => this.canEditSelection(),
      mode: this.manuscriptMode,
      dispatch: (tr, command) => this.dispatch(tr, command),
    };
  }
  setManuscriptMode = this.commands.setManuscriptMode;
  setScreenplayElement = this.commands.setScreenplayElement;
  screenplayTab = this.commands.screenplayTab;

  get inputMarks() {
    if (this.state.storedMarks !== null) return this.state.storedMarks;
    const paragraph = this.state.selection.$from.parent;
    return paragraph.isTextblock &&
      !paragraph.content.size &&
      String(paragraph.attrs.class).split(/\s+/).includes('poetry')
      ? [bookSchema.marks.italic.create()]
      : null;
  }
  get activeFormatting(): ActiveFormatting {
    const paragraph = this.state.selection.$from.parent,
      alignment = paragraph.attrs.align;
    return {
      poetry:
        paragraph.isTextblock && String(paragraph.attrs.class).split(/\s+/).includes('poetry'),
      align:
        alignment === 'center' || alignment === 'right' || alignment === 'justify'
          ? alignment
          : 'left',
    };
  }
  get version(): string {
    return this.state.doc.attrs.version;
  }
  setTraceParent = this.commands.setTraceParent;
  get activeSection() {
    const owner = this.owner(this.state.selection.from);
    return owner
      ? { id: owner.node.attrs.id as string, role: owner.node.attrs.role as string }
      : null;
  }
  searchDarlings = this.commands.searchDarlings;
  searchOutline = this.commands.searchOutline;
  replaceOutlineMatches = this.commands.replaceOutlineMatches;
  contentsRows = this.commands.contentsRows;
  alignParagraph = this.commands.alignParagraph;
  get outlineRows(): OutlineRow[] {
    return this.outlineOps.outlineRows;
  }
  editOutlineRow = this.commands.editOutlineRow;
  outlineEnter = this.commands.outlineEnter;
  outlineIndent = this.commands.outlineIndent;
  outlineDelete = this.commands.outlineDelete;
  get selection(): EditorSelection | null {
    const { $from, $to } = this.state.selection,
      owner = this.owner($from.pos);
    if (
      !owner ||
      !$from.sameParent($to) ||
      !$from.parent.isTextblock ||
      typeof $from.parent.attrs.pid !== 'string'
    )
      return null;
    return {
      chapterId: String(owner.node.attrs.id),
      passageId: $from.parent.attrs.pid,
      from: $from.parentOffset,
      to: $to.parentOffset,
    };
  }
  restoreSelection = this.commands.restoreSelection;
  get metadata(): MetadataValue {
    return structuredClone(this.state.doc.attrs.metadata);
  }
  get title(): string {
    return this.state.doc.attrs.metadata.title;
  }
  get author(): string {
    return this.state.doc.attrs.metadata.author;
  }
  get canUndo() {
    return undoDepth(this.state) > 0;
  }
  get canRedo() {
    return redoDepth(this.state) > 0;
  }
  get sections() {
    return sectionsFrom(this.state.doc);
  }
  section = this.commands.section;
  owner = this.commands.owner;
  get selectedWords() {
    const { from, to, empty } = this.state.selection;
    return empty
      ? 0
      : countWords(
          this.state.doc.textBetween(from, to, '\n', (node) =>
            node.type.name === 'placeholder' ? '⚑' : '\n',
          ),
        );
  }
  get chapters() {
    return projectChapters(this.sections, Boolean(this.state.doc.attrs.metadata.restartNumbering));
  }
  get darlings() {
    return projectDarlings(this.state.doc.attrs.darlings);
  }
  supported = this.commands.supported;
  canEdit = this.commands.canEdit;
  private canEditSelection(): boolean {
    return passageOperations.canEditSelection(this.operations);
  }
  private requireEditableSelection(): void {
    return passageOperations.requireEditableSelection(this.operations);
  }
  passages = this.commands.passages;
  private passage(id: string): PassageInfo | undefined {
    return passageOperations.passage(this.operations, id);
  }

  wordCountFor = this.commands.wordCountFor;
  private wordCount(): number {
    return passageOperations.wordCount(this.operations);
  }

  subscribe = this.commands.subscribe;
  private remember(): void {
    return passageOperations.remember(this.operations);
  }
  dispatch(tr: Transaction, command = 'typing', historical = false, parent?: Context) {
    const op = () => {
      if (tr.docChanged && !tr.getMeta('bookkeeping')) this.finishMetadataField();
      if (command === 'typing' && this.breakTyping) {
        tr = closeHistory(tr);
        this.breakTyping = false;
      }
      const result = this.apply(tr, command, historical);
      if (command.startsWith('outline.')) this.breakTyping = true;
      return result;
    };
    return this.telemetry
      ? this.telemetry.sync('editor.transaction', op, parent ?? this.commandParent)
      : op();
  }
  private apply(tr: Transaction, command: string, historical: boolean): void {
    return transactionOperations.apply(this.operations, tr, command, historical);
  }
  undo = this.commands.undo;
  redo = this.commands.redo;
  resetEnter = this.commands.resetEnter;
  select = this.commands.select;
  get annotations(): Annotation[] {
    const result: Annotation[] = [];
    for (const annotation of this.annotationRanges) {
      const location = {
        parts: [{ from: annotation.from, to: annotation.to }],
        deleted: false,
        unresolved: false,
      };
      if (runText(this.content(location)) !== annotation.expected) continue;
      for (const segment of this.segments(location))
        result.push({
          ...annotation.value,
          passageId: segment.passageId,
          from: segment.from,
          to: segment.to,
        });
    }
    for (const row of this.reviewRows())
      if (row.state === 'pending')
        for (const resolution of row.resolutions)
          if (resolution.status === 'current' || resolution.status === 'changed')
            for (const segment of resolution.segments)
              result.push({
                id: row.id,
                kind: 'review',
                passageId: segment.passageId,
                from: segment.from,
                to: segment.to,
                message: row.message,
              });
    return result;
  }
  setAnnotations = this.commands.setAnnotations;
  replacePassageText = this.commands.replacePassageText;
  get stickies(): StickyValue[] {
    const parsed = z.array(Sticky).safeParse(this.state.doc.attrs.metadata.stickies ?? []);
    return parsed.success ? structuredClone(parsed.data) : [];
  }
  createSticky = this.commands.createSticky;
  updateSticky = this.commands.updateSticky;
  removeSticky = this.commands.removeSticky;
  selectSticky = this.commands.selectSticky;
  configureTypography = this.commands.configureTypography;
  insert = this.commands.insert;
  setBookkeeping = this.commands.setBookkeeping;
  setCoverBookkeeping = this.commands.setCoverBookkeeping;
  private applyBookkeeping(parsed: Record<string, JSONValue | undefined>): void {
    return metadataOperations.applyBookkeeping(this.operations, parsed);
  }
  editMetadataField = this.commands.editMetadataField;
  finishMetadataField = this.commands.finishMetadataField;
  updateMetadata = this.commands.updateMetadata;
  setMetadata = this.commands.setMetadata;
  togglePoetry = this.commands.togglePoetry;
  insertOpeningPoetry = this.commands.insertOpeningPoetry;
  setChapterKind = this.commands.setChapterKind;
  selectPassage = this.commands.selectPassage;
  replaceMatches = this.commands.replaceMatches;
  search = this.commands.search;
  indent = this.commands.indent;
  /** Retain only the current native clipboard selection's note payload in memory.
   * Persisted notes still disappear with deleted flags and return with pasted flags.
   */
  rememberClipboardStickies = this.commands.rememberClipboardStickies;
  copySelection = this.commands.copySelection;
  cutSelection = this.commands.cutSelection;
  selectAll = this.commands.selectAll;
  paste = this.commands.paste;
  /** NEO's paragraph / scene / chapter Enter sequence is a deliberate authoring gesture. */
  enter = this.commands.enter;
  backspace = this.commands.backspace;
  deleteForward = this.commands.deleteForward;
  html = this.commands.html;
  createChapter = this.commands.createChapter;

  renameChapter = this.commands.renameChapter;
  duplicateChapter = this.commands.duplicateChapter;
  deleteChapter = this.commands.deleteChapter;
  reorderChapter = this.commands.reorderChapter;
  movePassage = this.commands.movePassage;
  moveSelection = this.commands.moveSelection;
  archive = this.commands.archive;
  restore = this.commands.restore;
  removeDarling = this.commands.removeDarling;
  format = this.commands.format;
  private spellingCache = new WeakMap<
    Fragment,
    { id: string; runs: { from: number; text: string }[] }[]
  >();
  spellingPassages = this.commands.spellingPassages;
  passageRows = this.commands.passageRows;
  captureSelection = this.commands.captureSelection;
  private segments(loc: Location): Resolution['segments'] {
    return reviewOperations.segments(this.operations, loc);
  }
  private content(loc: Location): ReturnType<typeof reviewOperations.content> {
    return reviewOperations.content(this.operations, loc);
  }
  capture = this.commands.capture;
  resolve = this.commands.resolve;
  extract = this.commands.extract;
  receive = this.commands.receive;
  reviewRows = this.commands.reviewRows;
  accept = this.commands.accept;
  reject = this.commands.reject;
  reconcileExternal = this.commands.reconcileExternal;
  checkpoint = this.commands.checkpoint;
}
