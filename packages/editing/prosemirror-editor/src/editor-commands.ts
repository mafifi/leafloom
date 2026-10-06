import { capitalSlips } from './capitalization';
import { markdownMatch } from './typography';
import type { OutlineBoardOperations } from './outline-board-operations';
import type { OutlineCardTarget, OutlineCardInsertion, OutlineDropSide, OutlineSceneMeasurement } from '@leafloom/editor-contracts';
import type { OutlineRow } from '@leafloom/editor-contracts';
import type { OutlineOperations } from './outline';
import type { Fragment } from 'prosemirror-model';
import { storyKinds, type ManuscriptModeValue, type ScreenplayElementValue } from '@leafloom/document-contracts';
import { type JSONValue } from '@leafloom/document-contracts';
import type {
  Annotation,
  ClipboardValue,
  ContentsRow,
  DarlingSearchMatch,
  DocumentSnapshotValue,
  ExternalReconcileOptions,
  ExternalReconcileOutcome,
  MetadataField,
  MetadataPatch,
  OutlineSearchMatch,
  OutlineTarget,
  Resolution,
  RestoreOutcome,
  ReviewRow,
  SearchMatch,
} from '@leafloom/editor-contracts';
import { type CheckpointValue, type CoreEvent, type ReviewInput } from '@leafloom/editor-contracts';
import { type PassageReference } from '@leafloom/review-contracts';
import { redo, undo } from 'prosemirror-history';
import { TextSelection } from 'prosemirror-state';
import { z } from 'zod';
import * as annotationOperations from './annotation-operations';
import { projectContents } from './chapter-labels';
import * as chapterOperations from './chapter-operations';
import * as checkpointOperations from './checkpoint-operations';
import * as clipboardOperations from './clipboard-operations';
import { exportHTML, schema as htmlSchema } from './codec';
import * as darlingOperations from './darling-operations';
import { baseNode } from './fidelity';
import { entries } from './identity';
import * as metadataOperations from './metadata-operations';
import { type PassageInfo } from './model';
import * as paragraphOperations from './paragraph-operations';
import * as passageOperations from './passage-operations';
import * as reviewOperations from './review-operations';
import * as screenplay from './screenplay-operations';
import { findDarlings, findOutline } from './search';
import * as textOperations from './text-operations';
import * as transactionOperations from './transaction-operations';
import { type TypographyPreferences } from './typography';
import { countNodeWords } from './word-count';

export interface EditorCommandQueries {
  screenplayContext(): screenplay.ScreenplayContext;
  outlineRows: OutlineRow[];
  outlineOps: OutlineOperations;
  outlineBoardOps: OutlineBoardOperations;
  selectPassage(id: string, from: number, to?: number): void;
  spellingCache: WeakMap<Fragment, {id: string; runs: {from:number;text:string}[]}[]>;
}
export type editorCommandsContext = EditorCommandQueries & passageOperations.PassageOperationsContext &
  transactionOperations.TransactionOperationsContext &
  textOperations.TextOperationsContext &
  annotationOperations.AnnotationOperationsContext &
  checkpointOperations.CheckpointOperationsContext &
  metadataOperations.MetadataOperationsContext &
  paragraphOperations.ParagraphOperationsContext &
  clipboardOperations.ClipboardOperationsContext &
  darlingOperations.DarlingOperationsContext &
  chapterOperations.ChapterOperationsContext &
  reviewOperations.ReviewOperationsContext;

export function editorCommands(context: editorCommandsContext) {
  return {
    setManuscriptMode: (mode: ManuscriptModeValue) => {
      return screenplay.setMode(context.screenplayContext(), mode);
    },
    setScreenplayElement: (element: ScreenplayElementValue) => {
      return screenplay.setElement(context.screenplayContext(), element);
    },
    screenplayTab: (reverse = false) => {
      return screenplay.tab(context.screenplayContext(), reverse);
    },
    setTraceParent: (carrier?: string) => {
      context.commandParent = context.telemetry?.parent(carrier);
    },
    searchDarlings: (query: string): DarlingSearchMatch[] => {
      return findDarlings(context.document, context.darlings, query);
    },
    searchOutline: (query: string): OutlineSearchMatch[] => {
      return findOutline(context.outlineRows, query);
    },
    replaceOutlineMatches: (matches: OutlineSearchMatch[], text: string) => {
      context.outlineOps.replaceOutlineMatches(matches, text);
    },
    contentsRows: (customChapterTitles = false): ContentsRow[] => {
      return projectContents(
        context.chapters,
        (id) => context.section(id).node,
        customChapterTitles,
      );
    },
    alignParagraph: (value: 'left' | 'center' | 'right' | 'justify'): boolean => {
      return textOperations.alignParagraph(context, value);
    },
    editOutlineRow: (target: OutlineTarget, text: string) => {
      context.outlineOps.editOutlineRow(target, text);
    },
    outlineEnter: (target: OutlineTarget, before = false): OutlineTarget => {
      return context.outlineOps.outlineEnter(target, before);
    },
    outlineIndent: (
      target: OutlineTarget,
      reverse = false,
    ): { target: OutlineTarget; notice?: string } => {
      return context.outlineOps.outlineIndent(target, reverse);
    },
    setOutlineSceneMeasurements: (value: OutlineSceneMeasurement[]) => context.outlineBoardOps.measure(value),
    saveOutlineCard: (target: OutlineCardTarget, text: string, slug?: string) => context.outlineBoardOps.save(target, text, slug),
    insertOutlineCard: (location: OutlineCardInsertion, text?: string, slug?: string) => context.outlineBoardOps.insert(location, text, slug),
    deleteOutlineCardNote: (target: OutlineCardTarget) => context.outlineBoardOps.removeNote(target),
    dropOutlineCard: (source: OutlineCardTarget, target: OutlineCardTarget | 'loose', side: OutlineDropSide) => context.outlineBoardOps.drop(source, target, side),
    promoteOutlineSection: (target: OutlineCardTarget) => context.outlineBoardOps.promote(target),
    dismissWalkingOutlineNote: () => context.outlineBoardOps.dismissWalk(),
    joinOutlineChapter: (chapterId: string, intoChapterId: string): OutlineTarget | null => context.outlineOps.joinChapter(chapterId, intoChapterId),
    moveOutlineSection: (fromChapterId: string, segmentIndex: number, to: { chapterId: string; before: number | null }): void => context.outlineOps.moveSection(fromChapterId, segmentIndex, to),
    outlineDelete: (target: OutlineTarget): OutlineTarget => {
      return context.outlineOps.outlineDelete(target);
    },
    restoreSelection: (value: unknown): boolean => {
      const current = z
        .object({
          chapterId: z.string(),
          passageId: z.string(),
          from: z.number().int().nonnegative(),
          to: z.number().int().nonnegative(),
        })
        .safeParse(value);
      if (current.success) {
        const passage = context.passage(current.data.passageId);
        if (
          !passage ||
          passage.chapterId !== current.data.chapterId ||
          current.data.to < current.data.from
        )
          return false;
        context.selectPassage(
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
      if (
        !legacy.success ||
        !context.chapters.some((chapter) => chapter.id === legacy.data.chapterId)
      )
        return false;
      const passages = context
          .passages(legacy.data.chapterId)
          .filter((passage) => passage.kind === 'paragraph'),
        passage = passages[legacy.data.pIdx] ?? passages.at(-1);
      if (!passage) return false;
      context.selectPassage(passage.id, Math.min(legacy.data.off ?? 0, passage.size));
      return true;
    },
    section: (id: string) => {
      const s = context.sections.find((s) => s.node.attrs.id === id);
      if (!s) throw Error('NOT_FOUND');
      return s;
    },
    owner: (pos: number) => {
      return context.sections.find((s) => pos >= s.pos + 1 && pos <= s.pos + s.node.nodeSize - 1);
    },
    supported: (id: string) => {
      return context.sources.get(id)?.supported ?? false;
    },
    canEdit: (id: string) => {
      return context.supported(id) && context.section(id).node.attrs.kind !== 'contents';
    },
    passages: (sectionId?: string): PassageInfo[] => {
      return passageOperations.passages(context, sectionId);
    },
    wordsBeforeCaret: (chapterId: string): number => {
      let before = 0;
      for (const chapter of context.chapters) {
        if (chapter.id === chapterId) {
          if (!storyKinds.some(kind => kind === chapter.kind)) break;
          const caret = context.state.selection.from;
          for (const passage of context.passages(chapterId)) {
            if (caret <= passage.pos) break;
            const offset = Math.min(passage.node.content.size, caret - passage.pos - 1);
            before += countNodeWords(passage.node.copy(passage.node.content.cut(0, Math.max(0, offset))));
            if (caret < passage.pos + passage.node.nodeSize) break;
          }
          break;
        }
        if (storyKinds.some(kind => kind === chapter.kind)) before += countNodeWords(context.section(chapter.id).node);
      }
      return before;
    },
    wordCountFor: (sectionId: string) => {
      const section = context.section(sectionId);
      return countNodeWords(section.node);
    },
    subscribe: (fn: (event: CoreEvent) => void) => {
      context.listeners.add(fn);
      return () => context.listeners.delete(fn);
    },
    undo: () => {
      context.finishMetadataField();
      context.resetEnter();
      return undo(context.state, (tr) => context.dispatch(tr, 'undo', true));
    },
    redo: () => {
      context.finishMetadataField();
      context.resetEnter();
      const selection = context.state.selection;
      const before = selection.empty ? selection.$from.parent.textBetween(0, selection.$from.parentOffset) : '';
      const match = markdownMatch(before);
      return redo(context.state, (tr) => {
        // History restores document steps and selection, but not stored typing
        // marks. A replayed delimiter conversion still ends in plain input.
        if (match && tr.selection.empty && tr.selection.$from.parent.textBetween(0, tr.selection.$from.parentOffset) === before.slice(0, match.from) + before.slice(match.from + match.open, match.to - match.open)) tr.setStoredMarks([]);
        context.dispatch(tr, 'redo', true);
      });
    },
    resetEnter: () => {
      context.enterSequence = null;
    },
    select: (id: string, from: number, to = from) => {
      context.resetEnter();
      const s = context.section(id);
      context.dispatch(
        context.state.tr.setSelection(
          TextSelection.create(context.state.doc, s.pos + 1 + from, s.pos + 1 + to),
        ),
        'select',
      );
    },
    setAnnotations: (annotations: Annotation[]) => {
      return annotationOperations.setAnnotations(context, annotations);
    },
    replacePassageText: (id: string, from: number, to: number, text: string) => {
      return annotationOperations.replacePassageText(context, id, from, to, text);
    },
    createSticky: (text: string): string => {
      return annotationOperations.createSticky(context, text);
    },
    updateSticky: (id: string, patch: { text?: string; resolved?: boolean }) => {
      return annotationOperations.updateSticky(context, id, patch);
    },
    removeSticky: (id: string) => {
      return annotationOperations.removeSticky(context, id);
    },
    selectSticky: (id: string, after = false): boolean => {
      return annotationOperations.selectSticky(context, id, after);
    },
    configureTypography: (preferences: TypographyPreferences) => {
      return textOperations.configureTypography(context, preferences);
    },
    insert: (
      text: string,
      options?: { typography?: boolean; capitalize?: boolean; previousTextNodePrefix?: string },
    ) => {
      return textOperations.insert(context, text, options);
    },
    setBookkeeping: (
      patch: Partial<
        Record<'wordCount' | 'dailyCounts' | 'lastPosition' | 'modified' | 'uuid', JSONValue>
      >,
    ) => {
      return metadataOperations.setBookkeeping(context, patch);
    },
    setCoverBookkeeping: (patch: { coverArt?: JSONValue; coverMode?: 'painted' }) => {
      return metadataOperations.setCoverBookkeeping(context, patch);
    },
    editMetadataField: (field: MetadataField, value: string) => {
      return metadataOperations.editMetadataField(context, field, value);
    },
    finishMetadataField: (field?: MetadataField) => {
      return metadataOperations.finishMetadataField(context, field);
    },
    updateMetadata: (patch: Record<string, JSONValue>) => {
      return metadataOperations.updateMetadata(context, patch);
    },
    setMetadata: (patch: MetadataPatch) => {
      return metadataOperations.setMetadata(context, patch);
    },
    toggleFlush: () => textOperations.toggleFlush(context),
    togglePoetry: () => {
      return textOperations.togglePoetry(context);
    },
    insertOpeningPoetry: (id: string) => {
      return textOperations.insertOpeningPoetry(context, id);
    },
    setChapterKind: (
      id: string,
      kind: string,
      options?: { copyrightStarter?: { notice: string; rights: string } },
    ) => {
      return chapterOperations.setChapterKind(context, id, kind, options);
    },
    selectPassage: (id: string, from: number, to = from, extend = false) => {
      return textOperations.selectPassage(context, id, from, to, extend);
    },
    replaceMatches: (matches: SearchMatch[], text: string) => {
      return textOperations.replaceMatches(context, matches, text);
    },
    search: (
      query: string,
      scope: 'manuscript' | 'notes' | 'outline' | 'all' = 'manuscript',
    ): SearchMatch[] => {
      return textOperations.search(context, query, scope);
    },
    indent: (reverse = false) => {
      return textOperations.indent(context, reverse);
    },
    rememberClipboardStickies: () => {
      return clipboardOperations.rememberClipboardStickies(context);
    },
    copySelection: (): ClipboardValue => {
      return clipboardOperations.copySelection(context);
    },
    cutSelection: (): ClipboardValue => {
      return clipboardOperations.cutSelection(context);
    },
    selectAll: (id?: string) => {
      return clipboardOperations.selectAll(context, id);
    },
    paste: (value: ClipboardValue) => {
      return clipboardOperations.paste(context, value);
    },
    flushEnter: (plain = false): boolean => {
      if (screenplay.enter(context.screenplayContext(), true)) return true;
      return paragraphOperations.enter(context, true, plain, 'flush');
    },
    enter: (shift = false, plain = false): boolean => {
      if (screenplay.enter(context.screenplayContext(), shift)) return true;
      return paragraphOperations.enter(context, shift, plain);
    },
    backspace: (): boolean => {
      if (screenplay.backspace(context.screenplayContext())) return true;
      return paragraphOperations.backspace(context);
    },
    deleteForward: (): boolean => {
      return paragraphOperations.deleteForward(context);
    },
    html: (id: string) => {
      const s = context.section(id),
        source = context.sources.get(id)!;
      if (!source.supported || s.node.content.eq(source.initial)) return source.html;
      const doc = htmlSchema.nodes.doc.create(
        null,
        Array.from(s.node.content.content, (n) => baseNode(n)),
      );
      return exportHTML(context.document, doc);
    },
    createChapter: (
      title: string,
      index?: number,
      options?: { kind: string; copyrightStarter?: { notice: string; rights: string } },
    ): `${string}-${string}-${string}-${string}-${string}` => {
      return chapterOperations.createChapter(context, title, index, options);
    },
    renameChapter: (id: string, title: string) => {
      return chapterOperations.renameChapter(context, id, title);
    },
    duplicateChapter: (id: string): `${string}-${string}-${string}-${string}-${string}` => {
      return chapterOperations.duplicateChapter(context, id);
    },
    deleteChapter: (id: string) => {
      return chapterOperations.deleteChapter(context, id);
    },
    reorderChapter: (id: string, index: number) => {
      return chapterOperations.reorderChapter(context, id, index);
    },
    movePassage: (id: string, targetId: string, index?: number) => {
      return chapterOperations.movePassage(context, id, targetId, index);
    },
    moveSelection: (targetId: string, offset: number) => {
      return chapterOperations.moveSelection(context, targetId, offset);
    },
    archive: () => {
      return darlingOperations.archive(context);
    },
    restore: (id: string): RestoreOutcome => {
      return darlingOperations.restore(context, id);
    },
    removeDarling: (id: string) => {
      return darlingOperations.removeDarling(context, id);
    },
    format: (mark: 'bold' | 'italic' | 'underline' | 'strike') => {
      return textOperations.format(context, mark);
    },
    capitalizationRanges: (sectionId: string, language: string) => {
      const section = context.section(sectionId).node;
      if (section.attrs.role !== 'chapter') return [];
      return entries(section).flatMap(({ node }) => {
        if (node.type.name !== 'paragraph' || typeof node.attrs.pid !== 'string' ||
          String(node.attrs.class).split(/\s+/).some(name => ['poetry', 'ghost', 'scene-break'].includes(name))) return [];
        let text = '';
        const offsets: number[] = [];
        node.forEach((child, from) => {
          if (!child.isText || !child.text) return;
          for (let index = 0; index < child.text.length; index++) offsets.push(from + index);
          text += child.text;
        });
        return capitalSlips(text, language).map(index => ({
          passageId: node.attrs.pid as string, from: offsets[index], to: offsets[index] + 1,
          correction: text[index].toLocaleUpperCase(language),
        }));
      });
    },
    spellingPassages: (sectionId: string) => {
      const section = context.section(sectionId).node;
      if (!context.supported(sectionId)) return [];
      const cached = context.spellingCache.get(section.content);
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
      context.spellingCache.set(section.content, rows);
      return rows;
    },
    passageRows: (sectionId?: string) => {
      return context.passages(sectionId).map((p) => ({
        id: p.id,
        chapterId: p.chapterId,
        kind: p.kind,
        text: p.text,
        size: p.size,
      }));
    },
    captureSelection: (): PassageReference => {
      return reviewOperations.captureSelection(context);
    },
    capture: (
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
    } => {
      return reviewOperations.capture(context, id, from, to);
    },
    resolve: (id: string): Resolution => {
      return reviewOperations.resolve(context, id);
    },
    extract: (ids: string[], category: ReviewInput['category']): ReviewInput => {
      return reviewOperations.extract(context, ids, category);
    },
    receive: (raw: unknown) => {
      return reviewOperations.receive(context, raw);
    },
    reviewRows: (): ReviewRow[] => {
      return reviewOperations.reviewRows(context);
    },
    accept: (id: string): { ok: boolean; code: string } | { ok: boolean; code?: undefined } => {
      return reviewOperations.accept(context, id);
    },
    reject: (id: string) => {
      return reviewOperations.reject(context, id);
    },
    reconcileExternal: (
      baseline: DocumentSnapshotValue,
      incoming: DocumentSnapshotValue,
      options: ExternalReconcileOptions,
    ): ExternalReconcileOutcome => {
      return checkpointOperations.reconcileExternal(context, baseline, incoming, options);
    },
    checkpoint: (carrier?: string): CheckpointValue => {
      return checkpointOperations.checkpoint(context, carrier);
    },
  };
}
