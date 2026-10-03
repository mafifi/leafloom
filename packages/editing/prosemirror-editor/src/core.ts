import { deletionRange, hasBlockClass } from './authoring-boundaries';
import { planExternal } from './external-reconciliation';
import { ReferenceHistory, cloneLocation } from './reference-history';
import { Darling, projectDarlings, locateDarlingContext, parseRestorableDarling } from './darlings';
import { OutlineOperations } from './outline';
import { removeChapterMetadata, settleChapterKinds } from './metadata';
import {
  MetadataFieldStep,
  metadataField,
  fieldSlot,
  sameSlot,
  type MetadataSlot,
} from './metadata-fields';
import { projectChapters, projectContents, storyEndIndex } from './chapter-labels';
import { findDarlings, findOutline, findPassages } from './search';
import { countWords, countNodeWords } from './word-count';
import {
  bookSchema,
  sectionsFrom,
  type Part,
  type Location,
  type Section,
  type PassageInfo,
} from './model';
export { bookSchema } from './model';
import {
  ChapterKind,
  storyKinds,
  Sticky,
  Metadata,
  type JSONValue,
  type MetadataValue,
  type StickyValue,
} from '@leafloom/document-contracts';
import {
  typographicInput,
  dialogueEdits,
  markdownMatch,
  markdownHTML,
  type TypographyPreferences,
} from './typography';
import { splitBlock, joinBackward, joinForward, toggleMark } from 'prosemirror-commands';
import type { Context } from '@opentelemetry/api';
import { z } from 'zod';
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { history, undo, redo, undoDepth, redoDepth, closeHistory } from 'prosemirror-history';
import { clipboardHTML } from './clipboard';
import { importHTML, exportHTML, schema as htmlSchema } from './codec';
import { entries, signature, runs, runText } from './identity';
import { inspectHTML, baseNode } from './fidelity';
import {
  Reference,
  ReviewOutput,
  type PassageReference,
  type ReviewItemValue,
} from '@leafloom/review-contracts';
import {
  SourceBook,
  Checkpoint,
  Reviews,
  Input,
  type CheckpointValue,
  type CoreEvent,
  type ReviewInput,
} from '@leafloom/editor-contracts';
import type { CompositionTelemetry } from './telemetry';
import type {
  EditorPort,
  ActiveFormatting,
  Resolution,
  ReviewRow,
  ClipboardValue,
  MetadataPatch,
  MetadataField,
  SearchMatch,
  Annotation,
  RestoreOutcome,
  EditorSelection,
  OutlineRow,
  OutlineTarget,
  ContentsRow,
  OutlineSearchMatch,
  DarlingSearchMatch,
  DocumentSnapshotValue,
  ExternalReconcileOptions,
  ExternalReconcileOutcome,
} from '@leafloom/editor-contracts';
type SectionSource = {
  html: string;
  initial: Fragment;
  supported: boolean;
  title: string;
  kind: string;
};
const uuid = () => crypto.randomUUID();
export class BookCore implements EditorPort {
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
    if (book.formatVersion === 'neo-composed/v1')
      for (const value of book.darlings) {
        const parsed = Darling.safeParse(value);
        if (parsed.success) this.trustedBookmarks.add(parsed.data.id);
      }
    this.revision = book.revision;
    const metadata = structuredClone(book.metadata);
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
    const version = book.formatVersion === 'neo-composed/v1' ? book.version : uuid();
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
  ) {
    const inspection = inspectHTML(this.document, html);
    let surface = bookSchema.nodes.surface.create(
      null,
      Array.from(inspection.model.content.content, (n) => bookSchema.nodeFromJSON(n.toJSON())),
    );
    let temp = EditorState.create({ doc: surface }).tr;
    const blocks = entries(surface);
    if (
      (index && inspection.supported && index.length !== blocks.length) ||
      (index && !inspection.supported && index.length)
    )
      throw Error('INVALID_IDENTITY');
    if (inspection.supported)
      blocks.forEach((p, i) => {
        const saved = index?.[i];
        if (
          saved &&
          (JSON.stringify(saved.path) !== JSON.stringify(p.path) ||
            saved.signature !== signature(p.node))
        )
          throw Error('INVALID_IDENTITY');
        temp.setNodeAttribute(p.pos, 'pid', saved?.id || uuid());
      });
    surface = temp.doc;
    sourceStore.set(id, {
      html,
      initial: surface.content,
      supported: inspection.supported,
      title,
      kind,
    });
    return bookSchema.nodes.section.create({ id, role, title, kind }, surface.content);
  }
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
  setTraceParent(carrier?: string) {
    this.commandParent = this.telemetry?.parent(carrier);
  }
  get activeSection() {
    const owner = this.owner(this.state.selection.from);
    return owner
      ? { id: owner.node.attrs.id as string, role: owner.node.attrs.role as string }
      : null;
  }
  searchDarlings(query: string): DarlingSearchMatch[] {
    return findDarlings(this.document, this.darlings, query);
  }
  searchOutline(query: string): OutlineSearchMatch[] {
    return findOutline(this.outlineRows, query);
  }
  replaceOutlineMatches(matches: OutlineSearchMatch[], text: string) {
    this.outlineOps.replaceOutlineMatches(matches, text);
  }
  contentsRows(customChapterTitles = false): ContentsRow[] {
    return projectContents(this.chapters, (id) => this.section(id).node, customChapterTitles);
  }
  alignParagraph(value: 'left' | 'center' | 'right' | 'justify'): boolean {
    const alignment = z.enum(['left', 'center', 'right', 'justify']).parse(value),
      owner = this.owner(this.state.selection.from);
    if (!owner || owner.node.attrs.role !== 'chapter' || !this.canEdit(owner.node.attrs.id))
      return false;
    const { from, to, empty } = this.state.selection,
      tr = closeHistory(this.state.tr),
      align = alignment === 'left' ? null : alignment;
    for (const passage of this.passages(owner.node.attrs.id))
      if (
        passage.node.type.name === 'paragraph' &&
        !String(passage.node.attrs.class).split(/\s+/).includes('scene-break') &&
        (empty
          ? from >= passage.pos + 1 && from <= passage.pos + passage.node.nodeSize - 1
          : passage.pos < to && passage.pos + passage.node.nodeSize > from) &&
        passage.node.attrs.align !== align
      )
        tr.setNodeAttribute(passage.pos, 'align', align);
    if (tr.docChanged) this.dispatch(tr, 'format.align');
    return true;
  }
  get outlineRows(): OutlineRow[] {
    return this.outlineOps.outlineRows;
  }
  editOutlineRow(target: OutlineTarget, text: string) {
    this.outlineOps.editOutlineRow(target, text);
  }
  outlineEnter(target: OutlineTarget, before = false): OutlineTarget {
    return this.outlineOps.outlineEnter(target, before);
  }
  outlineIndent(
    target: OutlineTarget,
    reverse = false,
  ): { target: OutlineTarget; notice?: string } {
    return this.outlineOps.outlineIndent(target, reverse);
  }
  outlineDelete(target: OutlineTarget): OutlineTarget {
    return this.outlineOps.outlineDelete(target);
  }
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
  restoreSelection(value: unknown): boolean {
    const current = z
      .object({
        chapterId: z.string(),
        passageId: z.string(),
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
      })
      .safeParse(value);
    if (current.success) {
      const passage = this.passage(current.data.passageId);
      if (
        !passage ||
        passage.chapterId !== current.data.chapterId ||
        current.data.to < current.data.from
      )
        return false;
      this.selectPassage(
        passage.id,
        Math.min(current.data.from, passage.size),
        Math.min(current.data.to, passage.size),
      );
      return true;
    }
    const legacy = z
      .object({
        chapterId: z.string(),
        pIdx: z.number().int().nonnegative(),
        off: z.number().int().nonnegative().optional(),
      })
      .safeParse(value);
    if (!legacy.success || !this.chapters.some((chapter) => chapter.id === legacy.data.chapterId))
      return false;
    const passages = this.passages(legacy.data.chapterId).filter(
        (passage) => passage.kind === 'paragraph',
      ),
      passage = passages[legacy.data.pIdx] ?? passages.at(-1);
    if (!passage) return false;
    this.selectPassage(passage.id, Math.min(legacy.data.off ?? 0, passage.size));
    return true;
  }
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
  section(id: string) {
    const s = this.sections.find((s) => s.node.attrs.id === id);
    if (!s) throw Error('NOT_FOUND');
    return s;
  }
  owner(pos: number) {
    return this.sections.find((s) => pos >= s.pos + 1 && pos <= s.pos + s.node.nodeSize - 1);
  }
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
  supported(id: string) {
    return this.sources.get(id)?.supported ?? false;
  }
  canEdit(id: string) {
    return this.supported(id) && this.section(id).node.attrs.kind !== 'contents';
  }
  private canEditSelection() {
    const { from, to, empty } = this.state.selection,
      owner = this.owner(from);
    if (!owner || !this.canEdit(owner.node.attrs.id)) return false;
    return (
      empty ||
      this.sections.every(
        (section) =>
          section.pos >= to ||
          section.pos + section.node.nodeSize <= from ||
          (this.supported(section.node.attrs.id) && section.node.attrs.kind !== 'contents'),
      )
    );
  }
  private requireEditableSelection() {
    if (this.canEditSelection()) return;
    const { from, to } = this.state.selection,
      owner = this.owner(from);
    const unsupported =
      !owner ||
      !this.supported(owner.node.attrs.id) ||
      this.sections.some(
        (section) =>
          section.pos < to &&
          section.pos + section.node.nodeSize > from &&
          !this.supported(section.node.attrs.id),
      );
    throw Error(unsupported ? 'UNSUPPORTED_CONTENT' : 'READ_ONLY_CONTENT');
  }
  passages(sectionId?: string): PassageInfo[] {
    if (this.passageContent !== this.state.doc.content) {
      this.passageContent = this.state.doc.content;
      const sections = this.sections;
      let ownerIndex = 0;
      this.passageCache = entries(this.state.doc).flatMap((e) => {
        while (
          ownerIndex < sections.length - 1 &&
          e.pos >= sections[ownerIndex].pos + sections[ownerIndex].node.nodeSize
        )
          ownerIndex++;
        const owner = sections[ownerIndex];
        if (!owner || !this.supported(owner.node.attrs.id)) return [];
        return [
          {
            id: e.node.attrs.pid as string,
            chapterId: owner.node.attrs.id as string,
            kind: e.node.type.name,
            text: runText(runs(e.node.content)),
            size: e.node.content.size,
            pos: e.pos,
            path: e.path,
            node: e.node,
          },
        ];
      });
      this.passageById = new Map(this.passageCache.map((p) => [p.id, p]));
      this.passagesBySection = new Map();
      for (const passage of this.passageCache) {
        const group = this.passagesBySection.get(passage.chapterId) ?? [];
        group.push(passage);
        this.passagesBySection.set(passage.chapterId, group);
      }
    }
    return sectionId ? (this.passagesBySection.get(sectionId) ?? []) : this.passageCache;
  }
  private passage(id: string) {
    this.passages();
    return this.passageById.get(id);
  }

  wordCountFor(sectionId: string) {
    const section = this.section(sectionId);
    return countNodeWords(section.node);
  }
  private wordCount() {
    let count = 0;
    this.state.doc.forEach((section) => {
      if (section.attrs.role === 'chapter' && storyKinds.includes(section.attrs.kind))
        count += countNodeWords(section);
    });
    return count;
  }

  subscribe(fn: (event: CoreEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private remember() {
    this.referenceHistory.remember(this.version, this.locations, (location) =>
      this.segments(location),
    );
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
  private apply(tr: Transaction, command: string, historical: boolean) {
    if (!tr.docChanged) {
      this.state = this.state.apply(tr);
      for (const fn of this.listeners) fn({ kind: 'selection', revision: this.revision, command });
      return;
    }
    const preserveMarks =
        !tr.storedMarksSet &&
        this.state.storedMarks !== null &&
        tr.selection.eq(this.state.selection) &&
        tr.selection.$from.parent.content.eq(this.state.selection.$from.parent.content),
      storedMarks = preserveMarks ? this.state.storedMarks : tr.storedMarks,
      storedMarksSet = tr.storedMarksSet || preserveMarks;
    if (!historical && !command.startsWith('outline.')) {
      const touched = new Map<number, PMNode>(),
        collect = (position: number) => {
          const point = this.state.doc.resolve(
            Math.max(0, Math.min(position, this.state.doc.content.size)),
          );
          if (
            point.parent.isTextblock &&
            String(point.parent.attrs.class).split(/\s+/).includes('ghost')
          )
            touched.set(point.before(), point.parent);
        };
      tr.mapping.maps.forEach((map, index) => {
        const inverse = tr.mapping.slice(0, index).invert();
        map.forEach((from, to) => {
          collect(inverse.map(from, 1));
          collect(inverse.map(to, -1));
        });
      });
      for (const [position, node] of touched) {
        const mapped = tr.mapping.map(position, 1),
          current = tr.doc.nodeAt(mapped);
        if (
          current?.isTextblock &&
          current.attrs.pid === node.attrs.pid &&
          !current.content.eq(node.content)
        )
          tr.setNodeAttribute(
            mapped,
            'class',
            String(current.attrs.class)
              .split(/\s+/)
              .filter((value) => value !== 'ghost')
              .join(' '),
          );
      }
    }
    if (historical && Object.keys(this.bookkeeping).length)
      tr.setDocAttribute('metadata', { ...tr.doc.attrs.metadata, ...this.bookkeeping });
    if (!historical)
      for (const old of this.sections)
        if (old.node.attrs.kind === 'contents') {
          const replacement = sectionsFrom(tr.doc).find(
            (section) => section.node.attrs.id === old.node.attrs.id,
          );
          if (replacement && !replacement.node.content.eq(old.node.content))
            throw Error('READ_ONLY_CONTENT');
        }
    for (const old of this.sections) {
      if (!this.supported(old.node.attrs.id)) {
        let replacement: PMNode | undefined;
        tr.doc.forEach((n) => {
          if (n.attrs.id === old.node.attrs.id) replacement = n;
        });
        if (replacement && !replacement.content.eq(old.node.content))
          throw Error('UNSUPPORTED_CONTENT');
      }
    }
    if (!historical) {
      const beforeIds = new Set<string>(),
        afterIds = new Set<string>();
      this.state.doc.descendants((node) => {
        if (node.type.name === 'placeholder') beforeIds.add(node.attrs.sid);
      });
      tr.doc.descendants((node) => {
        if (node.type.name === 'placeholder') afterIds.add(node.attrs.sid);
      });
      const removed = new Set([...beforeIds].filter((id) => !afterIds.has(id)));
      if (removed.size) {
        const parsed = z.array(Sticky).safeParse(tr.doc.attrs.metadata.stickies);
        if (parsed.success)
          tr.setDocAttribute('metadata', {
            ...tr.doc.attrs.metadata,
            stickies: parsed.data.filter((sticky) => !removed.has(sticky.id)),
          });
      }
    }
    if (!historical) {
      const oldRecords = z
          .array(z.json())
          .parse(this.state.doc.attrs.darlings)
          .flatMap((value) => {
            const parsed = Darling.safeParse(value);
            return parsed.success ? [parsed.data] : [];
          }),
        newRecords = z.array(z.json()).parse(tr.doc.attrs.darlings);
      let changed = false;
      const records = newRecords.map((value) => {
        const parsedRecord = Darling.safeParse(value);
        if (!parsedRecord.success) return value;
        const record = parsedRecord.data,
          old = oldRecords.find((previous) => previous.id === record.id);
        if (!old?.bookmark || JSON.stringify(old.bookmark) !== JSON.stringify(record.bookmark))
          return record;
        const parsed = z
          .strictObject({ position: z.number().int().nonnegative(), block: z.boolean().optional() })
          .safeParse(old.bookmark);
        if (!parsed.success) return record;
        const position = tr.mapping.map(parsed.data.position, -1);
        let ownerExists = false;
        tr.doc.forEach((section) => {
          if (section.attrs.role === 'chapter' && section.attrs.id === record.chapterId)
            ownerExists = true;
        });
        if (!ownerExists) {
          changed = true;
          const { bookmark, ...rest } = record;
          return rest;
        }
        if (position !== parsed.data.position) {
          changed = true;
          return { ...record, bookmark: { ...parsed.data, position } };
        }
        return record;
      });
      if (changed) tr.setDocAttribute('darlings', records);
    }
    this.remember();
    const before = this.state,
      previous = this.version,
      depthBefore = undoDepth(before);
    const firstStep = tr.steps[0]?.toJSON();
    const inline = tr.steps.every((step) => {
      const d = step.toJSON();
      return (
        ['addMark', 'removeMark', 'docAttr', 'attr'].includes(d.stepType) ||
        (d.stepType === 'replace' &&
          before.doc.resolve(d.from).sameParent(before.doc.resolve(d.to)) &&
          before.doc.resolve(d.from).parent.isTextblock &&
          (d.slice?.content || []).every((n: { type: string }) =>
            ['text', 'hard_break', 'placeholder', 'darling_anchor'].includes(n.type),
          ))
      );
    });
    if (!historical) {
      if (!inline) {
        const oldPositions = new Map(
            entries(before.doc).map((e) => [e.node.attrs.pid, tr.mapping.map(e.pos, 1)]),
          ),
          all = entries(tr.doc).filter((e) => {
            let supported = false;
            tr.doc.forEach((section, pos) => {
              if (e.pos > pos && e.pos < pos + section.nodeSize)
                supported = this.supported(section.attrs.id);
            });
            return supported;
          }),
          keep = new Map<string, (typeof all)[number]>();
        for (const p of all) {
          const id = p.node.attrs.pid;
          if (!id) continue;
          const old = keep.get(id),
            expected = oldPositions.get(id);
          if (
            !old ||
            (expected !== undefined && Math.abs(p.pos - expected) < Math.abs(old.pos - expected))
          )
            keep.set(id, p);
        }
        for (const p of all)
          if (!p.node.attrs.pid || keep.get(p.node.attrs.pid) !== p)
            tr.setNodeAttribute(p.pos, 'pid', uuid());
      }
      if (!tr.getMeta('bookkeeping')) tr.setDocAttribute('version', uuid());
    }
    const relocation = tr.getMeta('relocate') as
      { start: number; end: number; target: number; inline?: boolean } | undefined;
    const mapped = new Map<string, Location>();
    for (const [id, loc] of this.locations) {
      if (loc.deleted || loc.unresolved) {
        mapped.set(id, cloneLocation(loc));
        continue;
      }
      const parts = this.segments(loc)
        .map((s) => {
          const p = this.passage(s.passageId)!;
          return { from: p.pos + 1 + s.from, to: p.pos + 1 + s.to };
        })
        .map((p) =>
          relocation &&
          p.from >= relocation.start + (relocation.inline ? 0 : 1) &&
          p.to <= relocation.end - (relocation.inline ? 0 : 1)
            ? {
                from: relocation.target + p.from - relocation.start,
                to: relocation.target + p.to - relocation.start,
              }
            : { from: tr.mapping.map(p.from, 1), to: tr.mapping.map(p.to, -1) },
        )
        .filter((p) => p.to > p.from);
      const merged: Part[] = [];
      for (const p of parts) {
        const last = merged.at(-1);
        if (last && last.to === p.from) last.to = p.to;
        else merged.push(p);
      }
      mapped.set(id, { parts: merged, deleted: !merged.length, unresolved: false });
    }
    if (storedMarksSet) tr.setStoredMarks(storedMarks);
    this.annotationRanges = historical
      ? []
      : this.annotationRanges
          .map((annotation) => ({
            ...annotation,
            from: tr.mapping.map(annotation.from, 1),
            to: tr.mapping.map(annotation.to, -1),
          }))
          .filter((annotation) => annotation.to > annotation.from);
    this.state = before.apply(tr);
    this.locations = historical
      ? this.referenceHistory.restore(this.version, mapped, (anchor) => {
          const passage = this.passage(anchor.passageId);
          return passage && passage.chapterId === anchor.chapterId && anchor.to <= passage.size
            ? { from: passage.pos + 1 + anchor.from, to: passage.pos + 1 + anchor.to }
            : null;
        })
      : mapped;
    const restored = tr.getMeta('restoreReferences');
    if (restored) {
      const values = z
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
        .parse(restored);
      for (const value of values)
        if (this.refs.has(value.id))
          this.locations.set(value.id, { parts: value.parts, deleted: false, unresolved: false });
    }
    this.remember();
    if (!this.metadataEdit)
      this.referenceHistory.record(
        previous,
        this.version,
        depthBefore,
        undoDepth(this.state),
        historical,
      );
    if (!before.doc.content.eq(this.state.doc.content)) this.words = this.wordCount();
    this.revision++;
    for (const fn of this.listeners) fn({ kind: 'changed', revision: this.revision, command });
  }
  undo() {
    this.finishMetadataField();
    this.resetEnter();
    return undo(this.state, (tr) => this.dispatch(tr, 'undo', true));
  }
  redo() {
    this.finishMetadataField();
    this.resetEnter();
    return redo(this.state, (tr) => this.dispatch(tr, 'redo', true));
  }
  resetEnter() {
    this.enterSequence = null;
  }
  select(id: string, from: number, to = from) {
    this.resetEnter();
    const s = this.section(id);
    this.dispatch(
      this.state.tr.setSelection(
        TextSelection.create(this.state.doc, s.pos + 1 + from, s.pos + 1 + to),
      ),
      'select',
    );
  }
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
  setAnnotations(annotations: Annotation[]) {
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
          .filter((value) => value.kind !== 'review' || !this.items.has(value.id))
          .map((value) => [
            JSON.stringify([value.id, value.kind, value.passageId, value.from, value.to]),
            value,
          ]),
      ).values(),
    );
    this.annotationRanges = parsed.map((value) => {
      const passage = this.passage(value.passageId);
      if (!passage || value.to <= value.from || value.to > passage.size)
        throw Error('INVALID_ANNOTATION');
      return {
        value,
        from: passage.pos + 1 + value.from,
        to: passage.pos + 1 + value.to,
        expected: runText(runs(passage.node.content.cut(value.from, value.to))),
      };
    });
    for (const listener of this.listeners)
      listener({ kind: 'decoration', revision: this.revision, command: 'annotations' });
  }
  replacePassageText(id: string, from: number, to: number, text: string) {
    const passage = this.passage(id);
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
        this.state.doc.resolve(begin).marks();
    const tr = closeHistory(this.state.tr);
    if (text) tr.replaceWith(begin, end, bookSchema.text(text, marks));
    else tr.delete(begin, end);
    this.dispatch(tr, 'replace');
  }
  get stickies(): StickyValue[] {
    const parsed = z.array(Sticky).safeParse(this.state.doc.attrs.metadata.stickies ?? []);
    return parsed.success ? structuredClone(parsed.data) : [];
  }
  createSticky(text: string): string {
    const section = this.owner(this.state.selection.from);
    if (!section || section.node.attrs.role !== 'chapter') throw Error('UNSUPPORTED_CONTENT');
    this.requireEditableSelection();
    const id = uuid(),
      record = Sticky.parse({ id, chapterId: section.node.attrs.id, text, resolved: false }),
      metadata = { ...this.state.doc.attrs.metadata, stickies: [...this.stickies, record] };
    const at = this.state.selection.to,
      tr = closeHistory(this.state.tr).insert(
        at,
        Fragment.fromArray([
          bookSchema.nodes.placeholder.create({ sid: id }),
          bookSchema.text(' '),
        ]),
      );
    tr.setSelection(TextSelection.create(tr.doc, at + 2)).setDocAttribute('metadata', metadata);
    this.dispatch(tr, 'sticky.create');
    return id;
  }
  updateSticky(id: string, patch: { text?: string; resolved?: boolean }) {
    const value = z
      .strictObject({ text: z.string().optional(), resolved: z.boolean().optional() })
      .parse(patch);
    const current = this.stickies.find((sticky) => sticky.id === id);
    if (!current) throw Error('NOT_FOUND');
    if (
      (value.text === undefined || value.text === current.text) &&
      (value.resolved === undefined || value.resolved === current.resolved)
    )
      return;
    this.dispatch(
      closeHistory(this.state.tr).setDocAttribute('metadata', {
        ...this.state.doc.attrs.metadata,
        stickies: this.stickies.map((sticky) =>
          sticky.id === id ? { ...sticky, ...value } : sticky,
        ),
      }),
      'sticky.update',
    );
  }
  removeSticky(id: string) {
    const anchors: { pos: number; size: number }[] = [];
    this.state.doc.descendants((node, pos) => {
      if (node.type.name === 'placeholder' && node.attrs.sid === id)
        anchors.push({ pos, size: node.nodeSize });
    });
    if (!anchors.length && !this.stickies.some((sticky) => sticky.id === id))
      throw Error('NOT_FOUND');
    const tr = closeHistory(this.state.tr);
    for (const anchor of anchors.reverse()) {
      const point = this.state.doc.resolve(anchor.pos),
        before = point.parent.textBetween(0, point.parentOffset),
        after = point.parent.textBetween(
          point.parentOffset + anchor.size,
          point.parent.content.size,
        );
      // NEO resolves the flag seam by normalizing only its adjacent NBSPs.
      // Replace equal-length characters so later anchor positions stay valid,
      // and retain each neighbour's authored emphasis.
      const previous = point.nodeBefore,
        following = this.state.doc.resolve(anchor.pos + anchor.size).nodeAfter;
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
      ...this.state.doc.attrs.metadata,
      stickies: this.stickies.filter((sticky) => sticky.id !== id),
    });
    this.dispatch(tr, 'sticky.remove');
  }
  selectSticky(id: string, after = false): boolean {
    let position: number | undefined;
    this.state.doc.descendants((node, pos) => {
      if (node.type.name === 'placeholder' && node.attrs.sid === id) position = pos;
    });
    if (position === undefined) return false;
    const owner = this.owner(position);
    if (!owner || !this.canEdit(owner.node.attrs.id)) return false;
    const next = this.state.doc.nodeAt(position + 1),
      target = after ? position + 1 + (next?.isText ? 1 : 0) : position;
    this.dispatch(
      this.state.tr.setSelection(
        TextSelection.create(this.state.doc, target, after ? target : position + 1),
      ),
      'select',
    );
    return true;
  }
  configureTypography(preferences: TypographyPreferences) {
    this.preferences = { ...this.preferences, ...preferences };
  }
  insert(text: string, options?: { typography?: boolean; previousTextNodePrefix?: string }) {
    const escalation = this.enterSequence;
    this.resetEnter();
    if (escalation) this.breakTyping = true;
    const owner = this.owner(this.state.selection.from);
    if (!owner) throw Error('UNSUPPORTED_CONTENT');
    this.requireEditableSelection();
    if (options?.typography === false) {
      let tr = this.state.tr;
      if (this.breakTyping) {
        tr = closeHistory(tr);
        this.breakTyping = false;
      }
      const marks = this.inputMarks;
      if (marks !== null) tr.setStoredMarks(marks);
      this.dispatch(tr.insertText(text), 'typing');
      return;
    }
    let nativePrefix = options?.previousTextNodePrefix;
    for (const character of text) {
      const { from, $from, empty } = this.state.selection,
        before = empty ? $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc') : '';
      const language = this.preferences.language ?? this.preferences.interfaceLanguage ?? 'en',
        replacement = typographicInput({
          character,
          language,
          interfaceLanguage: this.preferences.interfaceLanguage ?? 'en',
          previousTextNodePrefix: nativePrefix ?? before,
          paragraphPrefix: before,
          chapterText: character === '"' ? owner.node.textContent : '',
          bookText: character === '"' ? this.state.doc.textContent : '',
          collapsed: empty,
        }),
        value = replacement?.text ?? character,
        replace = replacement?.replaceBefore ?? 0;
      if (nativePrefix !== undefined)
        nativePrefix = (empty ? nativePrefix.slice(0, nativePrefix.length - replace) : '') + value;
      let transaction = this.state.tr;
      if (this.breakTyping) {
        transaction = closeHistory(transaction);
        this.breakTyping = false;
      }
      const inputMarks = this.inputMarks;
      if (inputMarks !== null) transaction.setStoredMarks(inputMarks);
      else if (replace === 1 && value.startsWith('\u202f'))
        transaction.setStoredMarks(this.state.doc.resolve(from - replace).marks());
      transaction.insertText(value, from - replace, this.state.selection.to);
      this.dispatch(transaction, 'typing');
      const selection = this.state.selection,
        paragraph = selection.$from.parent,
        paragraphStart = selection.$from.start();
      const prefix = paragraph.textBetween(0, selection.$from.parentOffset, '\n', '\ufffc');
      if (
        this.preferences.markdown !== false &&
        (owner.node.attrs.role === 'chapter' || owner.node.attrs.role === 'notes') &&
        (character === '*' || character === '_')
      ) {
        const match = markdownMatch(prefix);
        if (match) {
          const tr = closeHistory(this.state.tr),
            begin = paragraphStart + match.from,
            finish = paragraphStart + match.to;
          tr.delete(finish - match.open, finish).delete(begin, begin + match.open);
          const end = finish - match.open * 2;
          if (match.bold) tr.addMark(begin, end, bookSchema.marks.bold.create());
          if (match.italic) tr.addMark(begin, end, bookSchema.marks.italic.create());
          tr.setSelection(TextSelection.create(tr.doc, end)).setStoredMarks([]);
          this.dispatch(tr, 'typography.markdown');
          this.breakTyping = true;
          continue;
        }
      }
      if (owner.node.attrs.role === 'chapter') {
        const edits = dialogueEdits(prefix, language);
        if (edits.length) {
          const tr = closeHistory(this.state.tr);
          for (const edit of edits.reverse())
            tr.insertText(
              edit.text,
              paragraphStart + edit.at,
              paragraphStart + edit.at + edit.length,
            );
          this.dispatch(tr, 'typography.dialogue');
          this.breakTyping = true;
        }
      }
    }
  }
  setBookkeeping(
    patch: Partial<
      Record<'wordCount' | 'dailyCounts' | 'lastPosition' | 'modified' | 'uuid', JSONValue>
    >,
  ) {
    const schema = z.strictObject({
      wordCount: z.number().int().nonnegative().optional(),
      dailyCounts: z
        .record(
          z.string(),
          z.strictObject({
            start: z.number().int().nonnegative(),
            end: z.number().int().nonnegative(),
          }),
        )
        .optional(),
      lastPosition: z.json().optional(),
      modified: z.string().optional(),
      uuid: z.uuid().optional(),
    });
    this.applyBookkeeping(schema.parse(patch));
  }
  setCoverBookkeeping(patch: { coverArt?: JSONValue; coverMode?: 'painted' }) {
    this.applyBookkeeping(
      z
        .strictObject({ coverArt: z.json().optional(), coverMode: z.literal('painted').optional() })
        .parse(patch),
    );
  }
  private applyBookkeeping(parsed: Record<string, JSONValue | undefined>) {
    const value: Record<string, JSONValue> = {};
    for (const [key, next] of Object.entries(parsed)) if (next !== undefined) value[key] = next;
    if (
      Object.entries(value).every(
        ([key, next]) =>
          JSON.stringify(this.state.doc.attrs.metadata[key]) === JSON.stringify(next),
      )
    )
      return;
    this.bookkeeping = { ...this.bookkeeping, ...value };
    this.dispatch(
      this.state.tr
        .setDocAttribute('metadata', { ...this.state.doc.attrs.metadata, ...value })
        .setMeta('addToHistory', false)
        .setMeta('bookkeeping', true)
        .setStoredMarks(this.state.storedMarks),
      'book.bookkeeping',
    );
  }
  editMetadataField(field: MetadataField, value: string) {
    const parsedField = metadataField.parse(field),
      parsedValue = z.string().parse(value);
    if (this.metadataEdit?.field !== parsedField) this.finishMetadataField();
    const before = fieldSlot(this.metadata, parsedField);
    if (before.present && before.value === parsedValue) return;
    if (!this.metadataEdit) {
      this.remember();
      this.metadataEdit = { field: parsedField, before, version: this.version };
    }
    const scope = this.metadataEdit,
      metadata = Metadata.parse({ ...this.metadata, [parsedField]: parsedValue }),
      version = sameSlot(scope.before, fieldSlot(metadata, parsedField)) ? scope.version : uuid(),
      transaction = this.state.tr
        .setDocAttribute('metadata', metadata)
        .setDocAttribute('version', version)
        .setMeta('addToHistory', false)
        .setStoredMarks(this.state.storedMarks);
    const apply = () => {
      this.state = this.state.apply(transaction);
      this.revision++;
      for (const fn of this.listeners)
        fn({ kind: 'changed', revision: this.revision, command: 'book.metadata.live' });
    };
    if (this.telemetry) this.telemetry.sync('editor.transaction', apply, this.commandParent);
    else apply();
  }
  finishMetadataField(field?: MetadataField) {
    if (field !== undefined) metadataField.parse(field);
    const scope = this.metadataEdit;
    if (!scope || (field !== undefined && field !== scope.field)) return;
    this.metadataEdit = null;
    const after = fieldSlot(this.metadata, scope.field);
    if (sameSlot(scope.before, after)) return;
    const depth = undoDepth(this.state),
      step = new MetadataFieldStep(scope.field, scope.before, after, scope.version, this.version);
    this.remember();
    this.state = this.state.apply(
      closeHistory(this.state.tr).step(step).setStoredMarks(this.state.storedMarks),
    );
    this.referenceHistory.record(scope.version, this.version, depth, undoDepth(this.state), false);
    this.breakTyping = true;
    for (const fn of this.listeners)
      fn({ kind: 'selection', revision: this.revision, command: 'book.metadata.finish' });
  }
  updateMetadata(patch: Record<string, JSONValue>) {
    const parsed = z.record(z.string(), z.json()).parse(patch),
      metadata = Metadata.parse({ ...this.state.doc.attrs.metadata, ...parsed });
    if (metadata.id !== this.state.doc.attrs.metadata.id || 'chapterOrder' in metadata)
      throw Error('INVALID_METADATA');
    this.dispatch(
      closeHistory(this.state.tr).setDocAttribute('metadata', metadata),
      'book.metadata',
    );
    for (const key of Object.keys(parsed)) delete this.bookkeeping[key];
  }
  setMetadata(patch: MetadataPatch) {
    const parsed = z
      .strictObject({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        author: z.string().optional(),
      })
      .parse(patch);
    this.dispatch(
      closeHistory(this.state.tr).setDocAttribute('metadata', {
        ...this.state.doc.attrs.metadata,
        ...parsed,
      }),
      'book.metadata',
    );
  }
  togglePoetry() {
    this.resetEnter();
    const { from, to } = this.state.selection,
      owner = this.owner(from);
    if (!owner || owner.node.attrs.role !== 'chapter' || !this.canEdit(owner.node.attrs.id)) return;
    const passages = this.passages().filter(
      (p) =>
        p.node.type.name === 'paragraph' &&
        p.pos < to &&
        p.pos + p.node.nodeSize > from &&
        !String(p.node.attrs.class).split(/\s+/).includes('scene-break'),
    );
    if (!passages.length) return;
    const remove = passages.every((p) =>
        String(p.node.attrs.class).split(/\s+/).includes('poetry'),
      ),
      tr = closeHistory(this.state.tr);
    for (const passage of passages) {
      const classes = String(passage.node.attrs.class)
        .split(/\s+/)
        .filter((c) => c && c !== 'poetry');
      if (!remove) classes.push('poetry');
      tr.setNodeMarkup(passage.pos, undefined, { ...passage.node.attrs, class: classes.join(' ') });
      if (remove)
        tr.removeMark(passage.pos + 1, passage.pos + 1 + passage.size, bookSchema.marks.italic);
      else
        tr.addMark(
          passage.pos + 1,
          passage.pos + 1 + passage.size,
          bookSchema.marks.italic.create(),
        );
    }
    tr.setSelection(TextSelection.create(tr.doc, passages[0].pos + 1));
    tr.setStoredMarks(remove ? [] : [bookSchema.marks.italic.create()]);
    this.dispatch(tr, 'author.poetry.toggle');
  }
  insertOpeningPoetry(id: string) {
    const section = this.section(id);
    if (!this.supported(id)) throw Error('UNSUPPORTED_CONTENT');
    const paragraph = bookSchema.nodes.paragraph.create({ class: 'poetry' }),
      tr = closeHistory(this.state.tr).insert(section.pos + 1, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, section.pos + 2)).setStoredMarks([
      bookSchema.marks.italic.create(),
    ]);
    this.dispatch(tr, 'author.poetry.open');
  }
  setChapterKind(
    id: string,
    kind: string,
    options?: { copyrightStarter?: { notice: string; rights: string } },
  ) {
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
    const section = this.section(id);
    if (section.node.attrs.role !== 'chapter') throw Error('INVALID_TARGET');
    const metadata = this.metadata,
      previous = z.record(z.string(), z.json()).safeParse(metadata.chapterKinds);
    metadata.chapterKinds = { ...(previous.success ? previous.data : {}), [id]: kind };
    const tr = closeHistory(this.state.tr)
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
    if (kind === 'copyright' && starter && empty && this.supported(id)) {
      const paragraphs = [starter.notice, starter.rights].map((text) =>
        bookSchema.nodes.paragraph.create({ pid: uuid() }, bookSchema.text(text)),
      );
      tr.replaceWith(section.pos + 1, section.pos + section.node.nodeSize - 1, paragraphs);
    }
    this.dispatch(tr, 'chapter.kind');
  }
  selectPassage(id: string, from: number, to = from) {
    const passage = this.passage(id);
    if (
      !passage ||
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < from ||
      to > passage.size
    )
      throw Error('INVALID_SELECTION');
    this.resetEnter();
    this.dispatch(
      this.state.tr.setSelection(
        TextSelection.create(this.state.doc, passage.pos + 1 + from, passage.pos + 1 + to),
      ),
      'select',
    );
  }
  replaceMatches(matches: SearchMatch[], text: string) {
    const schema = z.array(
      z.strictObject({
        chapterId: z.string().min(1),
        passageId: z.string().min(1),
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
      }),
    );
    const replacements = schema
      .parse(matches)
      .map((match) => {
        const passage = this.passage(match.passageId);
        if (
          !passage ||
          passage.chapterId !== match.chapterId ||
          match.to <= match.from ||
          match.to > passage.size
        )
          throw Error('INVALID_SELECTION');
        return {
          from: passage.pos + 1 + match.from,
          to: passage.pos + 1 + match.to,
          marks: passage.node.content.cut(match.from, match.to).firstChild?.marks ?? [],
        };
      })
      .sort((a, b) => b.from - a.from);
    if (
      replacements.some(
        (replacement, index) => index > 0 && replacement.to > replacements[index - 1].from,
      )
    )
      throw Error('OVERLAPPING_MATCHES');
    if (!replacements.length) return;
    const tr = closeHistory(this.state.tr);
    for (const replacement of replacements) {
      if (text)
        tr.replaceWith(replacement.from, replacement.to, bookSchema.text(text, replacement.marks));
      else tr.delete(replacement.from, replacement.to);
    }
    this.dispatch(tr, 'replace.all');
  }
  search(
    query: string,
    scope: 'manuscript' | 'notes' | 'outline' | 'all' = 'manuscript',
  ): SearchMatch[] {
    return findPassages(query, this.passages(), (id) => this.section(id).node.attrs.role, scope);
  }
  indent(reverse = false) {
    this.resetEnter();
    if (!this.canEditSelection()) return;
    if (reverse) {
      const { from, empty, $from } = this.state.selection;
      if (!empty) return;
      const before = $from.parent.textBetween(0, $from.parentOffset);
      const spaces = before.endsWith('\u2003\u2003') ? 2 : before.endsWith('\u2003') ? 1 : 0;
      if (spaces) this.dispatch(this.state.tr.delete(from - spaces, from), 'author.indent');
    } else this.insert('\u2003\u2003');
  }
  /** Retain only the current native clipboard selection's note payload in memory.
   * Persisted notes still disappear with deleted flags and return with pasted flags.
   */
  rememberClipboardStickies() {
    const selected = new Set<string>();
    this.state.doc.nodesBetween(this.state.selection.from, this.state.selection.to, (node) => {
      if (node.type.name === 'placeholder') selected.add(node.attrs.sid);
    });
    this.clipboardStickies = new Map(
      this.stickies.filter((note) => selected.has(note.id)).map((note) => [note.id, note]),
    );
  }
  copySelection(): ClipboardValue {
    this.rememberClipboardStickies();
    const slice = this.state.doc.slice(this.state.selection.from, this.state.selection.to),
      content = Array.from(slice.content.content, (node) => baseNode(node));
    const doc = htmlSchema.nodes.doc.create(
      null,
      slice.openStart ? content : htmlSchema.nodes.paragraph.create(null, content),
    );
    return {
      text: slice.content.textBetween(0, slice.content.size, '\n', '⚑'),
      html: exportHTML(this.document, doc),
    };
  }
  cutSelection(): ClipboardValue {
    this.requireEditableSelection();
    const value = this.copySelection();
    this.dispatch(closeHistory(this.state.tr).deleteSelection(), 'cut');
    return value;
  }
  selectAll(id?: string) {
    const section = id ? this.section(id) : this.owner(this.state.selection.from);
    if (!section) return;
    this.dispatch(
      this.state.tr.setSelection(
        TextSelection.between(
          this.state.doc.resolve(section.pos + 2),
          this.state.doc.resolve(section.pos + section.node.nodeSize - 2),
        ),
      ),
      'select',
    );
  }
  paste(value: ClipboardValue) {
    this.resetEnter();
    const owner = this.owner(this.state.selection.from);
    if (!owner) throw Error('UNSUPPORTED_CONTENT');
    this.requireEditableSelection();
    let model: PMNode;
    if (value.html && !value.matchStyle) {
      model = clipboardHTML(this.document, value.html);
    } else {
      const manuscript = owner.node.attrs.role === 'chapter',
        lines = manuscript
          ? value.text
              .replace(/\r/g, '')
              .split(/\n+/)
              .map((line) => line.trim())
              .filter(Boolean)
          : value.text.replace(/\r/g, '').split('\n');
      const marks = this.inputMarks ?? this.state.selection.$from.marks();
      model = htmlSchema.nodes.doc.create(
        null,
        (lines.length ? lines : ['']).map((source, index) => {
          let line = source;
          if (manuscript && !value.matchStyle) {
            for (const edit of dialogueEdits(line, this.preferences.language ?? 'en')
              .filter(
                (edit) =>
                  edit.at !== 0 || index > 0 || this.state.selection.$from.parentOffset === 0,
              )
              .reverse())
              line = line.slice(0, edit.at) + edit.text + line.slice(edit.at + edit.length);
            const styled = this.preferences.markdown ? markdownHTML(line) : null;
            if (styled) return importHTML(this.document, '<p>' + styled + '</p>').child(0);
          }
          return htmlSchema.nodes.paragraph.create(
            null,
            line
              ? htmlSchema.text(
                  line,
                  marks.map((mark) => htmlSchema.mark(mark.type.name, mark.attrs)),
                )
              : undefined,
          );
        }),
      );
    }
    if (owner.node.attrs.role === 'chapter' && !value.matchStyle) {
      const normalization = EditorState.create({ doc: model }).tr,
        edits: { from: number; to: number; text: string }[] = [];
      let index = 0;
      model.descendants((node, position) => {
        if (!node.isTextblock) return;
        const text = node.textContent;
        for (const edit of dialogueEdits(text, this.preferences.language ?? 'en'))
          if (edit.at !== 0 || index > 0 || this.state.selection.$from.parentOffset === 0)
            edits.push({
              from: position + 1 + edit.at,
              to: position + 1 + edit.at + edit.length,
              text: edit.text,
            });
        index++;
        return false;
      });
      for (const edit of edits.reverse())
        normalization.replaceWith(
          edit.from,
          edit.to,
          htmlSchema.text(edit.text, normalization.doc.resolve(edit.from).marks()),
        );
      model = normalization.doc;
    }
    let nodes = Array.from(model.content.content, (node) => bookSchema.nodeFromJSON(node.toJSON()));
    const pasted = EditorState.create({ doc: bookSchema.nodes.surface.create(null, nodes) }).tr,
      stickies = [...this.stickies];
    pasted.doc.descendants((node, pos) => {
      if (node.type.name === 'placeholder') {
        const original =
            this.stickies.find((sticky) => sticky.id === node.attrs.sid) ??
            this.clipboardStickies.get(String(node.attrs.sid)),
          incoming = String(node.attrs.sid ?? ''),
          id = incoming && !stickies.some((sticky) => sticky.id === incoming) ? incoming : uuid();
        pasted.setNodeAttribute(pos, 'sid', id);
        stickies.push(
          Sticky.parse({
            ...original,
            id,
            chapterId: owner.node.attrs.id,
            text: original?.text ?? '',
            resolved: original?.resolved ?? false,
          }),
        );
      }
    });
    nodes = Array.from(pasted.doc.content.content);
    const slice =
      nodes.length === 1 && nodes[0].isTextblock
        ? new Slice(nodes[0].content, 0, 0)
        : new Slice(Fragment.fromArray(nodes), 1, 1);
    this.dispatch(
      closeHistory(this.state.tr)
        .replaceSelection(slice)
        .setDocAttribute('metadata', { ...this.state.doc.attrs.metadata, stickies }),
      'paste',
    );
  }
  /** NEO's paragraph / scene / chapter Enter sequence is a deliberate authoring gesture. */
  enter(shift = false, plain = false): boolean {
    const { $from, $to, empty } = this.state.selection,
      owner = this.owner($from.pos);
    if (!owner || !this.canEditSelection()) return false;
    const node = $from.parent,
      activeMarks = this.state.storedMarks ?? $from.marks();
    if (plain) {
      this.resetEnter();
      if (shift) {
        this.dispatch(
          closeHistory(this.state.tr)
            .replaceSelectionWith(bookSchema.nodes.hard_break.create())
            .setStoredMarks(this.state.storedMarks ?? $from.marks()),
          'author.linebreak',
        );
        return true;
      }
      return splitBlock(this.state, (tr) =>
        this.dispatch(
          closeHistory(tr).setStoredMarks(
            tr.selection.$from.parent.type.allowedMarks(
              this.state.storedMarks ??
                (tr.selection.$from.parent.content.size ? tr.selection.$from.marks() : activeMarks),
            ),
          ),
          'author.enter',
        ),
      );
    }
    if (owner.node.attrs.role !== 'chapter' && shift) {
      this.resetEnter();
      this.dispatch(
        closeHistory(this.state.tr)
          .replaceSelectionWith(bookSchema.nodes.hard_break.create())
          .setStoredMarks(this.state.storedMarks ?? $from.marks()),
        'author.linebreak',
      );
      return true;
    }
    if (node.type.name !== 'paragraph' || !$from.sameParent($to)) {
      this.resetEnter();
      return splitBlock(this.state, (tr) => this.dispatch(closeHistory(tr), 'author.enter'));
    }
    const classes = String(node.attrs.class).split(/\s+/),
      poetry = classes.includes('poetry');
    if (classes.includes('scene-break')) {
      this.resetEnter();
      return true;
    }
    const start = $from.before(),
      offset = $from.parentOffset;
    const sequence = this.enterSequence;
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
        const previous = this.state.doc.resolve(start).nodeBefore;
        const tr = this.state.tr.setTime(sequence.time);
        if (previous?.type.name === 'paragraph' && !previous.textContent.trim())
          tr.replaceWith(start - previous.nodeSize, start, scene);
        else tr.insert(start, scene);
        tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(start, 1) + 1));
        this.dispatch(tr, 'author.scene');
        this.enterSequence = { ...sequence, stage: 2 };
        return true;
      }
      const previous = this.state.doc.resolve(start).nodeBefore;
      if (previous && hasBlockClass(previous, 'scene-break')) {
        const id = uuid(),
          tr = closeHistory(this.state.tr);
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
        this.sources.set(id, {
          html: '<p></p>',
          initial: Fragment.empty,
          supported: true,
          title: '',
          kind: 'chapter',
        });
        tr.setSelection(TextSelection.create(tr.doc, at + 3));
        this.dispatch(tr, 'author.chapter');
        this.resetEnter();
        return true;
      }
    }
    this.resetEnter();
    if (
      poetry &&
      !shift &&
      !node.textContent &&
      node.content.content.every((n) => n.type.name === 'hard_break')
    ) {
      const tr = closeHistory(this.state.tr).setNodeMarkup(start, undefined, {
        ...node.attrs,
        class: classes.filter((c) => c !== 'poetry').join(' '),
      });
      tr.removeMark(start + 1, start + 1 + node.content.size, bookSchema.marks.italic);
      tr.setStoredMarks([]);
      this.dispatch(tr, 'author.poetry.exit');
      return true;
    }
    const tr = closeHistory(this.state.tr);
    const makePoetry = shift;
    if (shift && offset === 0 && !poetry && empty) {
      tr.setNodeMarkup(start, undefined, {
        ...node.attrs,
        class: [...classes.filter(Boolean), 'poetry'].join(' '),
      });
      tr.addMark(start + 1, start + 1 + node.content.size, bookSchema.marks.italic.create());
      tr.setStoredMarks([bookSchema.marks.italic.create()]);
      this.dispatch(tr, 'author.poetry');
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
      tr.addMark(
        tailStart + 1,
        tailStart + 1 + right.content.size,
        bookSchema.marks.italic.create(),
      );
    else if (poetry && !makePoetry)
      tr.removeMark(tailStart + 1, tailStart + 1 + right.content.size, bookSchema.marks.italic);
    tr.setSelection(TextSelection.create(tr.doc, tailStart + 1));
    const tailVisible = right
      .textBetween(0, right.content.size, '', (node) =>
        node.type.name === 'placeholder' ? '⚑' : '',
      )
      .trim();
    tr.setStoredMarks(
      makePoetry
        ? poetry && (tailVisible || activeMarks.some((mark) => mark.type.name === 'italic'))
          ? activeMarks
          : [bookSchema.marks.italic.create()]
        : poetry
          ? []
          : (this.state.storedMarks ??
            (right.content.size ? tr.selection.$from.marks() : activeMarks)),
    );
    this.dispatch(tr, 'author.enter');
    if (
      !shift &&
      !poetry &&
      owner.node.attrs.role === 'chapter' &&
      storyKinds.includes(owner.node.attrs.kind)
    )
      this.enterSequence = {
        stage: 1,
        sectionId: owner.node.attrs.id,
        tailId: this.state.doc.nodeAt(tailStart)!.attrs.pid,
        time: tr.time,
      };
    return true;
  }
  backspace(): boolean {
    this.resetEnter();
    if (!this.canEditSelection()) return false;
    const { $from, $to, from, to, empty } = this.state.selection;
    if (!empty) {
      const range = deletionRange(this.state.doc, from, to);
      this.dispatch(
        closeHistory(this.state.tr).delete(range.from, range.to),
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
      const range = deletionRange(this.state.doc, from - length, from);
      this.dispatch(this.state.tr.delete(range.from, range.to), 'author.backspace');
      return true;
    }
    if (
      $from.parent.type.name === 'paragraph' &&
      String($from.parent.attrs.class).split(/\s+/).includes('poetry')
    ) {
      const start = $from.before(),
        tr = closeHistory(this.state.tr)
          .setNodeMarkup(start, undefined, {
            ...$from.parent.attrs,
            class: String($from.parent.attrs.class)
              .split(/\s+/)
              .filter((c) => c !== 'poetry')
              .join(' '),
          })
          .removeMark(start + 1, start + 1 + $from.parent.content.size, bookSchema.marks.italic)
          .setStoredMarks([]);
      this.dispatch(tr, 'author.poetry.exit');
      return true;
    }
    const owner = this.owner($from.pos);
    if (owner && $from.before() === owner.pos + 1) {
      if (owner.node.attrs.role !== 'chapter') return true;
      const chapters = this.sections.filter((section) => section.node.attrs.role === 'chapter'),
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
          tr = closeHistory(this.state.tr).delete(owner.pos, owner.pos + owner.node.nodeSize);
        const metadata = this.metadata;
        removeChapterMetadata(metadata, owner.node.attrs.id);
        tr.setDocAttribute('metadata', metadata);
        const mapped = tr.mapping.map(target.pos),
          position = index > 0 ? mapped + target.node.nodeSize - 2 : mapped + 2;
        tr.setSelection(TextSelection.create(tr.doc, position));
        this.dispatch(tr, 'chapter.empty.delete');
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
        const metadata = this.metadata;
        removeChapterMetadata(metadata, previous.node.attrs.id);
        const tr = closeHistory(this.state.tr)
          .delete(previous.pos, previous.pos + previous.node.nodeSize)
          .setDocAttribute('metadata', metadata);
        tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map($from.pos)));
        this.dispatch(tr, 'chapter.empty.delete');
        return true;
      }
      if (
        !storyKinds.includes(previous.node.attrs.kind) ||
        !storyKinds.includes(owner.node.attrs.kind) ||
        !this.supported(previous.node.attrs.id)
      )
        return true;
      const tr = closeHistory(this.state.tr).join(owner.pos),
        metadata = structuredClone(this.state.doc.attrs.metadata),
        oldId = owner.node.attrs.id,
        newId = previous.node.attrs.id;
      const sectionNotes = z.record(z.string(), z.array(z.json())).safeParse(metadata.sectionNotes);
      if (sectionNotes.success && sectionNotes.data[oldId]) {
        sectionNotes.data[newId] = [
          ...(sectionNotes.data[newId] ?? []),
          ...sectionNotes.data[oldId],
        ];
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
        .parse(this.state.doc.attrs.darlings)
        .map((darling) =>
          darling.chapterId === oldId ? { ...darling, chapterId: newId } : darling,
        );
      tr.setDocAttribute('metadata', metadata)
        .setDocAttribute('darlings', darlings)
        .setSelection(TextSelection.create(tr.doc, tr.mapping.map($from.pos)));
      this.dispatch(tr, 'chapter.merge');
      return true;
    }
    const before = this.state.doc.resolve($from.before()).nodeBefore;
    if (before && hasBlockClass(before, 'scene-break')) {
      this.dispatch(
        closeHistory(this.state.tr).delete($from.before() - before.nodeSize, $from.before()),
        'author.scene.delete',
      );
      return true;
    }
    return joinBackward(this.state, (tr) => this.dispatch(closeHistory(tr), 'author.join'));
  }
  deleteForward(): boolean {
    this.resetEnter();
    if (!this.canEditSelection()) return false;
    const { $from, empty } = this.state.selection;
    if (!empty) {
      const { from, to } = this.state.selection,
        range = deletionRange(this.state.doc, from, to);
      this.dispatch(
        closeHistory(this.state.tr).delete(range.from, range.to),
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
      const range = deletionRange(this.state.doc, $from.pos, $from.pos + length);
      this.dispatch(this.state.tr.delete(range.from, range.to), 'author.delete');
      return true;
    }
    const after = this.state.doc.resolve($from.after()).nodeAfter;
    if (after && hasBlockClass(after, 'scene-break')) {
      this.dispatch(
        closeHistory(this.state.tr).delete($from.after(), $from.after() + after.nodeSize),
        'author.scene.delete',
      );
      return true;
    }
    const owner = this.owner($from.pos);
    if (owner && $from.after() === owner.pos + owner.node.nodeSize - 1) return true;
    return joinForward(this.state, (tr) => this.dispatch(closeHistory(tr), 'author.join'));
  }
  html(id: string) {
    const s = this.section(id),
      source = this.sources.get(id)!;
    if (!source.supported || s.node.content.eq(source.initial)) return source.html;
    const doc = htmlSchema.nodes.doc.create(
      null,
      Array.from(s.node.content.content, (n) => baseNode(n)),
    );
    return exportHTML(this.document, doc);
  }
  createChapter(
    title: string,
    index?: number,
    options?: { kind: string; copyrightStarter?: { notice: string; rights: string } },
  ) {
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
    const chapters = this.sections.filter((section) => section.node.attrs.role === 'chapter');
    index ??= storyEndIndex(this.chapters);
    if (!Number.isInteger(index) || index < 0 || index > chapters.length)
      throw Error('INVALID_TARGET');
    const id = uuid(),
      kind = entry?.kind ?? 'chapter',
      emptySection = this.makeSection(id, 'chapter', '<p></p>', title, kind),
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
    const metadata = this.metadata;
    if (entry)
      metadata.chapterKinds = {
        ...z.record(z.string(), z.json()).catch({}).parse(metadata.chapterKinds),
        [id]: kind,
      };
    this.dispatch(
      closeHistory(this.state.tr).insert(position, section).setDocAttribute('metadata', metadata),
      'chapter.create',
    );
    return id;
  }

  renameChapter(id: string, title: string) {
    const s = this.section(id),
      metadata = this.metadata,
      previous = z.record(z.string(), z.json()).safeParse(metadata.chapterTitles);
    metadata.chapterTitles = {
      ...(previous.success ? previous.data : {}),
      [id]: z.string().parse(title),
    };
    this.dispatch(
      closeHistory(this.state.tr)
        .setNodeAttribute(s.pos, 'title', title)
        .setDocAttribute('metadata', metadata),
      'chapter.rename',
    );
  }
  duplicateChapter(id: string) {
    const source = this.section(id),
      copy = uuid(),
      section = this.makeSection(
        copy,
        'chapter',
        this.html(id),
        source.node.attrs.title + ' copy',
        source.node.attrs.kind,
      );
    this.dispatch(
      closeHistory(this.state.tr).insert(source.pos + source.node.nodeSize, section),
      'chapter.duplicate',
    );
    return copy;
  }
  deleteChapter(id: string) {
    const s = this.section(id);
    if (s.node.attrs.role !== 'chapter') throw Error('UNSUPPORTED_TARGET');
    const metadata = this.metadata,
      tr = closeHistory(this.state.tr),
      text = entries(s.node)
        .filter((entry) => !String(entry.node.attrs.class).split(/\s+/).includes('ghost'))
        .map((entry) =>
          entry.node.textBetween(0, entry.node.content.size, '\n', (node) =>
            node.type.name === 'hard_break' ? '\n' : '',
          ),
        )
        .join('\n')
        .trim(),
      chapter = this.chapters.find((chapter) => chapter.id === id)!;
    if (text) {
      const record = {
        id: uuid(),
        html: this.html(id),
        text: text.slice(0, 2000),
        chapterId: null,
        chapterLabel:
          chapter.kind === 'chapter' ? `deleted Chapter ${chapter.number}` : chapter.label,
        date: new Date().toISOString(),
        stickies: this.stickies.filter((sticky) => sticky.chapterId === id),
      };
      tr.setDocAttribute('darlings', [record, ...this.state.doc.attrs.darlings]);
    }
    removeChapterMetadata(metadata, id);
    this.dispatch(
      tr.delete(s.pos, s.pos + s.node.nodeSize).setDocAttribute('metadata', metadata),
      'chapter.delete',
    );
  }
  reorderChapter(id: string, index: number) {
    const s = this.section(id),
      chapters = this.sections.filter((s) => s.node.attrs.role === 'chapter');
    if (!Number.isInteger(index) || index < 0 || index >= chapters.length)
      throw Error('INVALID_TARGET');
    if (chapters[index].node.attrs.id === id) return;
    const tr = closeHistory(this.state.tr).delete(s.pos, s.pos + s.node.nodeSize);
    let target = 0;
    for (let i = 0; i < index; i++) target += tr.doc.child(i).nodeSize;
    tr.insert(target, s.node).setMeta('relocate', {
      start: s.pos,
      end: s.pos + s.node.nodeSize,
      target,
    });
    this.dispatch(tr, 'chapter.reorder');
  }
  movePassage(id: string, targetId: string, index?: number) {
    const p = this.passage(id),
      source = p && this.section(p.chapterId),
      target = this.section(targetId);
    index ??= target.node.childCount;
    if (
      !p ||
      p.path.length !== 2 ||
      !source ||
      source.node.attrs.role !== 'chapter' ||
      target.node.attrs.role !== 'chapter' ||
      !this.supported(targetId) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > target.node.childCount
    )
      throw Error('UNSUPPORTED_MOVE');
    const tr = closeHistory(this.state.tr).delete(p.pos, p.pos + p.node.nodeSize);
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
    this.dispatch(tr, 'passage.move');
  }
  moveSelection(targetId: string, offset: number) {
    const { from, to, empty } = this.state.selection,
      source = this.owner(from),
      sourceEnd = this.owner(to),
      target = this.section(targetId);
    if (empty) return;
    if (
      !source ||
      source.node.attrs.id !== sourceEnd?.node.attrs.id ||
      source.node.attrs.role !== 'chapter' ||
      target.node.attrs.role !== 'chapter' ||
      !this.canEdit(source.node.attrs.id) ||
      !this.canEdit(targetId) ||
      !Number.isInteger(offset) ||
      offset < 1 ||
      offset > target.node.content.size - 1
    )
      throw Error('UNSUPPORTED_MOVE');
    const destination = target.pos + 1 + offset;
    if (destination >= from && destination <= to) return;
    const slice = this.state.doc.slice(from, to),
      tr = closeHistory(this.state.tr).delete(from, to),
      at = tr.mapping.map(destination),
      metadata = this.metadata,
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
    this.dispatch(tr, 'author.drag.move');
  }
  archive() {
    this.resetEnter();
    const { from, to, $from, $to } = this.state.selection,
      owner = this.owner(from),
      endOwner = this.owner(to);
    if (
      from === to ||
      !owner ||
      owner.node.attrs.role !== 'chapter' ||
      owner.node.attrs.id !== endOwner?.node.attrs.id ||
      !$from.parent.isTextblock ||
      !$to.parent.isTextblock
    )
      throw Error('UNSUPPORTED_TARGET');
    if (!this.supported(owner.node.attrs.id)) throw Error('UNSUPPORTED_CONTENT');
    const slice = this.state.doc.slice(from, to),
      id = uuid(),
      blocks = Array.from(slice.content.content, (node) => baseNode(node));
    let html = exportHTML(
      this.document,
      htmlSchema.nodes.doc.create(
        null,
        slice.openStart ? blocks : htmlSchema.nodes.paragraph.create(null, blocks),
      ),
    );
    const selectedStickyIds = new Set<string>();
    slice.content.descendants((node) => {
      if (node.type.name === 'placeholder') selectedStickyIds.add(node.attrs.sid);
    });
    const prefix = this.state.doc.textBetween(owner.pos + 1, from, '', (node) =>
        node.type.name === 'placeholder' ? '⚑' : '',
      ),
      suffix = this.state.doc.textBetween(to, owner.pos + owner.node.nodeSize - 1, '', (node) =>
        node.type.name === 'placeholder' ? '⚑' : '',
      );
    const references = Array.from(this.locations, ([referenceId, location]) => ({
      id: referenceId,
      parts: location.parts,
    }))
      .filter(
        (location) =>
          location.parts.length &&
          location.parts.every((part) => part.from >= from && part.to <= to),
      )
      .map((location) => ({
        id: location.id,
        parts: location.parts.map((part) => ({ from: part.from - from, to: part.to - from })),
      }));
    const tr = closeHistory(this.state.tr).deleteSelection(),
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
      const holder = this.document.createElement('div');
      holder.innerHTML = html;
      html = holder.firstElementChild?.innerHTML ?? html;
    }
    const savedSlice = blockRestore ? new Slice(slice.content, 0, 0) : slice;
    this.trustedBookmarks.add(id);
    const record = {
      id,
      html,
      text: slice.content.textBetween(0, slice.content.size, '\n', '⚑'),
      chapterId: owner.node.attrs.id,
      chapterLabel:
        this.chapters.find((chapter) => chapter.id === owner.node.attrs.id)?.label ??
        owner.node.attrs.title,
      date: new Date().toISOString(),
      anchorPrefix: prefix.slice(-60),
      anchorSuffix: suffix.slice(0, 60),
      bookmark: { position: restorePosition, ...(blockRestore ? { block: true } : {}) },
      stickies: this.stickies.filter((sticky) => selectedStickyIds.has(sticky.id)),
      references,
      slice: {
        content: savedSlice.content.toJSON(),
        openStart: savedSlice.openStart,
        openEnd: savedSlice.openEnd,
      },
    };
    this.dispatch(
      tr.setDocAttribute('darlings', [record, ...this.state.doc.attrs.darlings]),
      'darling.archive',
    );
  }
  restore(id: string): RestoreOutcome {
    this.resetEnter();
    const record = this.darlings.find((darling) => darling.id === id);
    if (!record) throw Error('NOT_FOUND');
    const bookmark = z
      .strictObject({ position: z.number().int().nonnegative(), block: z.boolean().optional() })
      .safeParse(record.bookmark);
    let at: number | undefined,
      replaceTo: number | undefined,
      location: RestoreOutcome['location'] = 'context';
    const anchors: number[] = [];
    this.state.doc.descendants((node, position) => {
      if (node.type.name === 'darling_anchor' && node.attrs.did === id) anchors.push(position);
    });
    if (anchors.length) {
      at = anchors[0];
      replaceTo = at + 1;
      location = 'anchor';
    }
    let section =
      record.chapterId && this.chapters.some((chapter) => chapter.id === record.chapterId)
        ? this.section(record.chapterId)
        : undefined;
    if (at === undefined && section && bookmark.success && this.trustedBookmarks.has(id)) {
      const point = bookmark.data.position;
      if (
        point >= section.pos + 1 &&
        point <= section.pos + section.node.nodeSize - 1 &&
        (bookmark.data.block
          ? this.state.doc.resolve(point).parent.type.name === 'section'
          : this.state.doc.resolve(point).parent.isTextblock)
      ) {
        at = point;
        location = 'bookmark';
      }
    }
    if (
      at === undefined &&
      section &&
      (record.anchorPrefix != null || record.anchorSuffix != null)
    ) {
      const prefix = z.string().nullish().parse(record.anchorPrefix) ?? '',
        suffix = z.string().nullish().parse(record.anchorSuffix) ?? '';
      at = locateDarlingContext(section, prefix, suffix) ?? undefined;
      location = 'context';
    }
    const { model, slice } = parseRestorableDarling(this.document, record);
    let tr = closeHistory(this.state.tr),
      created: string | undefined,
      caret: number | undefined,
      revealAt: number | undefined;
    if (at === undefined) {
      location = 'fallback';
      section ??= this.sections.filter((section) => section.node.attrs.role === 'chapter').at(-1);
      if (!section) {
        created = uuid();
        const node = this.makeSection(created, 'chapter', '<p></p>', '', 'chapter');
        tr.insert(0, node);
        section = { node, pos: 0, index: 0 };
      }
      if (!this.supported(section.node.attrs.id)) throw Error('UNSUPPORTED_CONTENT');
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
      section = this.owner(at);
      if (!section || !this.supported(section.node.attrs.id)) throw Error('UNSUPPORTED_CONTENT');
      if (location === 'context' && record.slice === undefined && /<p[\s>]/i.test(record.html)) {
        const point = this.state.doc.resolve(at),
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
        ...this.state.doc.attrs.metadata,
        stickies: [
          ...this.stickies,
          ...restoredStickies.filter(
            (sticky) => !this.stickies.some((existing) => existing.id === sticky.id),
          ),
        ],
      };
    tr.setDocAttribute('metadata', metadata).setDocAttribute(
      'darlings',
      (this.state.doc.attrs.darlings as unknown[]).filter(
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
    this.dispatch(tr, 'darling.restore');
    return {
      location,
      chapterId: created ?? String(section.node.attrs.id),
      ...(revealAt === undefined
        ? {}
        : {
            restoredPassageId: this.passages(String(section.node.attrs.id)).find(
              (p) => revealAt! >= p.pos + 1 && revealAt! <= p.pos + 1 + p.size,
            )?.id,
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
  removeDarling(id: string) {
    if (!this.darlings.some((darling) => darling.id === id)) throw Error('NOT_FOUND');
    const anchors: number[] = [];
    this.state.doc.descendants((node, position) => {
      if (node.type.name === 'darling_anchor' && node.attrs.did === id) anchors.push(position);
    });
    const tr = closeHistory(this.state.tr);
    for (const position of anchors.reverse()) tr.delete(position, position + 1);
    tr.setDocAttribute(
      'darlings',
      (this.state.doc.attrs.darlings as unknown[]).filter(
        (darling) =>
          !(darling && typeof darling === 'object' && 'id' in darling && darling.id === id),
      ),
    );
    this.dispatch(tr, 'darling.remove');
  }
  format(mark: 'bold' | 'italic') {
    if (!this.canEditSelection()) return;
    if (this.state.storedMarks === null && this.inputMarks !== null)
      this.state = this.state.apply(this.state.tr.setStoredMarks(this.inputMarks));
    toggleMark(bookSchema.marks[mark])(this.state, (tr) =>
      this.dispatch(closeHistory(tr), 'format'),
    );
  }
  private spellingCache = new WeakMap<
    Fragment,
    { id: string; runs: { from: number; text: string }[] }[]
  >();
  spellingPassages(sectionId: string) {
    const section = this.section(sectionId).node;
    if (!this.supported(sectionId)) return [];
    const cached = this.spellingCache.get(section.content);
    if (cached) return cached;
    const rows = entries(section).flatMap(({ node }) => {
      if (
        String(node.attrs.class)
          .split(/\s+/)
          .some((name) => name === 'ghost' || name === 'scene-break')
      )
        return [];
      if (typeof node.attrs.pid !== 'string') return [];
      const runs: { from: number; text: string }[] = [];
      node.forEach((child, from) => {
        if (child.isText && child.text) runs.push({ from, text: child.text });
      });
      return [{ id: node.attrs.pid, runs }];
    });
    this.spellingCache.set(section.content, rows);
    return rows;
  }
  passageRows(sectionId?: string) {
    return this.passages(sectionId).map((p) => ({
      id: p.id,
      chapterId: p.chapterId,
      kind: p.kind,
      text: p.text,
      size: p.size,
    }));
  }
  captureSelection() {
    const { from, to } = this.state.selection,
      p = this.passages().find((p) => from >= p.pos + 1 && to <= p.pos + 1 + p.size);
    if (!p || from === to) throw Error('Select text within a paragraph');
    return this.capture(p.id, from - p.pos - 1, to - p.pos - 1);
  }
  private segments(loc: Location) {
    if (loc.deleted || loc.unresolved) return [];
    const passages = this.passages();
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
  private content(loc: Location) {
    let fragment = Fragment.empty;
    for (const s of this.segments(loc)) {
      const p = this.passage(s.passageId)!;
      fragment = fragment.append(p.node.content.cut(s.from, s.to));
    }
    return runs(fragment);
  }
  capture(id: string, from: number, to: number) {
    const p = this.passage(id);
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
      version: this.version,
      expected,
      text: runText(expected),
    });
    this.refs.set(ref.id, ref);
    this.locations.set(ref.id, {
      parts: [{ from: p.pos + 1 + from, to: p.pos + 1 + to }],
      deleted: false,
      unresolved: false,
    });
    this.remember();
    return structuredClone(ref);
  }
  resolve(id: string): Resolution {
    const ref = this.refs.get(id),
      loc = this.locations.get(id);
    if (!ref || !loc || loc.unresolved) return { status: 'unresolved', segments: [], text: '' };
    if (loc.deleted) return { status: 'deleted', segments: [], text: '' };
    const content = this.content(loc);
    return {
      status: JSON.stringify(content) === JSON.stringify(ref.expected) ? 'current' : 'changed',
      segments: this.segments(loc),
      text: runText(content),
    };
  }
  extract(ids: string[], category: ReviewInput['category']) {
    const input = Input.parse({
      requestId: uuid(),
      bookId: this.state.doc.attrs.metadata.id,
      revision: this.revision,
      category,
      extracts: ids.map((id) => {
        const ref = this.refs.get(id),
          loc = this.locations.get(id);
        if (!ref || !loc || this.resolve(id).status !== 'current') throw Error('STALE');
        const segments = this.segments(loc),
          p = this.passage(segments[0].passageId)!;
        return {
          reference: ref,
          currentSegments: segments,
          version: this.version,
          chapterOrder: this.chapters.findIndex((c) => c.id === p.chapterId),
          passageKind: p.kind,
          runs: this.content(loc),
          text: runText(this.content(loc)),
        };
      }),
    });
    this.requests.set(input.requestId, input);
    return structuredClone(input);
  }
  receive(raw: unknown) {
    const data = ReviewOutput.parse(raw),
      request = this.requests.get(data.requestId);
    if (!request) throw Error('UNKNOWN_REQUEST');
    const allowed = new Set(request.extracts.map((e) => e.reference.id)),
      ids = new Set<string>();
    for (const item of data.items) {
      if (
        ids.has(item.id) ||
        this.items.has(item.id) ||
        item.references.some((id) => !allowed.has(id))
      )
        throw Error('INVALID_REVIEW');
      ids.add(item.id);
    }
    for (const item of data.items)
      this.items.set(item.id, { item, reviewId: data.reviewId, rejected: false });
    this.revision++;
    for (const fn of this.listeners)
      fn({ kind: 'changed', revision: this.revision, command: 'review.attach' });
  }
  reviewRows(): ReviewRow[] {
    return structuredClone(
      Array.from(this.items.values(), (row) => ({
        ...row.item,
        state: row.rejected
          ? 'rejected'
          : (this.state.doc.attrs.accepted as string[]).includes(row.item.id)
            ? 'accepted'
            : 'pending',
        resolutions: row.item.references.map((id) => this.resolve(id)),
      })),
    );
  }
  accept(id: string) {
    const row = this.items.get(id);
    if (!row || row.item.kind !== 'suggestion') return { ok: false, code: 'NOT_FOUND' };
    if (row.rejected) return { ok: false, code: 'REJECTED' };
    if ((this.state.doc.attrs.accepted as string[]).includes(id)) return { ok: true };
    const refid = row.item.references[0],
      loc = this.locations.get(refid),
      resolution = this.resolve(refid);
    if (!loc || resolution.status !== 'current') return { ok: false, code: 'STALE' };
    if (resolution.segments.length !== 1) return { ok: false, code: 'UNSUPPORTED_TARGET' };
    const { from, to } = loc.parts[0],
      content = this.state.doc.slice(from, to).content.content;
    if (content.some((n) => !n.isText || !n.sameMarkup(content[0])))
      return { ok: false, code: 'UNSUPPORTED_TARGET' };
    const tr = closeHistory(this.state.tr);
    if (row.item.replacement)
      tr.replaceWith(from, to, bookSchema.text(row.item.replacement, content[0]?.marks));
    else tr.delete(from, to);
    tr.setDocAttribute('accepted', [...this.state.doc.attrs.accepted, id]);
    this.dispatch(tr, 'review.accept');
    return { ok: true };
  }
  reject(id: string) {
    const row = this.items.get(id);
    if (!row) throw Error('NOT_FOUND');
    if ((this.state.doc.attrs.accepted as string[]).includes(id)) throw Error('ACCEPTED');
    if (!row.rejected) {
      row.rejected = true;
      this.revision++;
      for (const fn of this.listeners)
        fn({ kind: 'changed', revision: this.revision, command: 'review.reject' });
    }
  }
  reconcileExternal(
    baseline: DocumentSnapshotValue,
    incoming: DocumentSnapshotValue,
    options: ExternalReconcileOptions,
  ): ExternalReconcileOutcome {
    const local = this.checkpoint(),
      plan = planExternal(baseline, local, incoming, options),
      staged = new Map(this.sources),
      aliases = new Map<string, { chapterId: string; passageId: string }>(),
      incomingChapters = new Map(incoming.book.chapters.map((chapter) => [chapter.id, chapter])),
      oldPassages = new Map(this.passages().map((passage) => [passage.id, passage])),
      compile = (
        id: string,
        role: string,
        html: string,
        title = '',
        kind = 'chapter',
        index?: { id: string; path: number[]; signature: string }[],
        originId = id,
      ) => {
        let section = this.makeSection(id, role, html, title, kind, index, staged);
        const old = this.sections.find((section) => section.node.attrs.id === id),
          oldBlocks = old && this.supported(id) ? entries(old.node) : [],
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
          const node = this.section(chapter.originId).node;
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
      chapters.push(html === this.html(id) ? this.section(id).node : compile(id, role, html));
    const archive = plan.archive.map((id) => ({
        id: uuid(),
        html: this.html(id),
        text: this.section(id)
          .node.textBetween(0, this.section(id).node.content.size, '\n\n', (node) =>
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
        { ...this.state.doc.attrs, metadata: plan.metadata, darlings },
        chapters,
      ),
      changed = !next.eq(this.state.doc) || reviewChanged,
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
        formatVersion: 'neo-composed/v1',
        revision: Math.max(this.revision, incoming.book.revision) + 1,
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
                    this.document,
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
    this.finishMetadataField();
    const caret = this.selection,
      before = this.state,
      transaction = this.state.tr,
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
      .setStoredMarks(this.state.storedMarks);
    if (!transaction.doc.content.eq(next.content)) throw Error('INVALID_RECONCILIATION');
    const apply = () => {
      this.sources = staged;
      this.state = historyReset
        ? EditorState.create({
            doc: transaction.doc,
            selection: transaction.selection,
            plugins: before.plugins,
            storedMarks: before.storedMarks,
          })
        : before.apply(transaction);
      if (selectedReviews) {
        this.refs = new Map(
          selectedReviews.references.map((record) => [
            record.reference.id,
            structuredClone(record.reference),
          ]),
        );
        this.items = new Map(
          selectedReviews.items.map((row) => [
            row.item.id,
            { item: structuredClone(row.item), reviewId: row.reviewId, rejected: row.rejected },
          ]),
        );
        const accepted = selectedReviews.items
          .filter((row) => row.accepted)
          .map((row) => row.item.id);
        this.state = this.state.apply(
          this.state.tr
            .setDocAttribute('accepted', accepted)
            .setMeta('addToHistory', false)
            .setStoredMarks(this.state.storedMarks),
        );
        this.locations = new Map(
          selectedReviews.references.map((record) => {
            let unresolved = record.unresolved;
            const parts: Part[] = [];
            for (const segment of record.segments) {
              const alias =
                  plan.reviewsFrom === 'incoming'
                    ? aliases.get(segment.chapterId + ':' + segment.passageId)
                    : undefined,
                passage = this.passage(alias?.passageId ?? segment.passageId),
                old = oldPassages.get(segment.passageId);
              if (!passage || passage.chapterId !== (alias?.chapterId ?? segment.chapterId)) {
                unresolved = true;
                continue;
              }
              if (
                plan.reviewsFrom === 'local' &&
                old &&
                !old.node.content.eq(passage.node.content)
              ) {
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
      this.annotationRanges = this.annotationRanges
        .map((annotation) => ({
          ...annotation,
          from: transaction.mapping.map(annotation.from, 1),
          to: transaction.mapping.map(annotation.to, -1),
        }))
        .filter((annotation) => annotation.to > annotation.from);
      this.words = this.wordCount();
      this.revision = Math.max(this.revision, incoming.book.revision) + 1;
      if (historyReset) this.referenceHistory.clear();
      this.remember();
      if (!historyReset)
        this.referenceHistory.record(
          before.doc.attrs.version,
          this.version,
          undoDepth(before),
          undoDepth(this.state),
          false,
        );
      if (caret) this.restoreSelection(caret);
      this.breakTyping = true;
      for (const fn of this.listeners)
        fn({ kind: 'changed', revision: this.revision, command: 'external.reconcile' });
    };
    if (this.telemetry) this.telemetry.sync('editor.transaction', apply, this.commandParent);
    else apply();
    return outcome;
  }
  checkpoint(carrier?: string): CheckpointValue {
    this.snapshots++;
    const op = () => {
      const metadata = structuredClone(this.state.doc.attrs.metadata);
      for (const chapter of this.chapters) {
        const initial = this.sources.get(chapter.id)!;
        if (!this.originalIds.has(chapter.id) || chapter.title !== initial.title) {
          metadata.chapterTitles = { ...metadata.chapterTitles, [chapter.id]: chapter.title };
        }
        if (!this.originalIds.has(chapter.id) || chapter.kind !== initial.kind) {
          metadata.chapterKinds = { ...metadata.chapterKinds, [chapter.id]: chapter.kind };
        }
      }
      const book = {
        formatVersion: 'neo-composed/v1',
        revision: this.revision,
        version: this.version,
        metadata,
        darlings: this.state.doc.attrs.darlings,
        chapters: this.chapters.map((c) => ({
          id: c.id,
          html: this.html(c.id),
          version: this.version,
          passages: this.passages(c.id).map((p) => ({
            id: p.id,
            path: p.path.slice(1),
            signature: signature(p.node),
          })),
        })),
      };
      const reviews = {
        formatVersion: 'neo-composed-reviews/v1',
        bookId: metadata.id,
        version: this.version,
        references: Array.from(this.refs.values(), (reference) => {
          const loc = this.locations.get(reference.id)!;
          return {
            reference,
            segments: this.segments(loc),
            deleted: loc.deleted,
            unresolved: loc.unresolved,
          };
        }),
        items: Array.from(this.items.values(), (row) => ({
          ...row,
          accepted: (this.state.doc.attrs.accepted as string[]).includes(row.item.id),
        })),
      };
      return Checkpoint.parse({
        book,
        reviews,
        notes: this.html('notes'),
        outline: this.html('outline'),
      });
    };
    return this.telemetry
      ? this.telemetry.sync('editor.snapshot', op, this.telemetry.parent(carrier))
      : op();
  }
}
