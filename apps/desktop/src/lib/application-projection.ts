import { pagePosition } from './manuscript-position';
import { AuthoringSession, writingDay } from '@leafloom/authoring';
import {
  remotePositionEligibility,
  type EditorPort,
  type RemotePosition,
  type SurfacePort,
} from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import type { Telemetry } from '@leafloom/telemetry-contracts';
import { z } from 'zod';
import type { AppState } from './application';


export interface ApplicationProjectionContext {
  scriptCounterLabels: {wordLabel:string;positionLabel:string}|null;
  refreshScriptLayout():void;
  telemetry: Telemetry | undefined;
  projectState: () => void;
  editor: EditorPort | null;
  value: AppState;
  patch: (patch: Partial<AppState>) => void;
  previewCache: Map<string, { html: string; preview: string }>;
  preview: (html: string) => string;
  pendingStickies: Map<string, string>;
  scheduleMenu: () => void;
  rendered: () => Promise<void>;
  mountedRoot: HTMLElement | null;
  surfaces: SurfacePort<HTMLElement> | null;
  readingActivity: number;
  pendingRemotePosition: { bookId: string; position: RemotePosition } | null;
  overlayOpen: () => boolean;
  session: AuthoringSession | null;
}

export function project(context: ApplicationProjectionContext): void {
  if (context.telemetry) return context.telemetry.sync('ui.project', () => context.projectState());
  context.projectState();
}

export function projectState(context: ApplicationProjectionContext): void {
  if (!context.editor) return;
  const editor = context.editor;
  const today = z
    .record(z.string(), z.object({ start: z.number(), end: z.number() }))
    .catch({})
    .parse(editor.metadata.dailyCounts)[
    writingDay(new Date(), Number(context.value.library.dayEndsAt) || 0)
  ];
  const current =
    editor.activeSection?.role === 'chapter'
      ? editor.activeSection.id
      : context.value.currentChapter;
  const chapter = editor.chapters.find((row) => row.id === current),
    numbered = editor.chapters.filter((row) => row.kind === 'chapter');
  const selected = context.value.panel === 'manuscript' ? editor.selectedWords : 0;
  const t = (key: string, args: Record<string, string | number> = {}) =>
    translate(context.value.language, key, args);
  const wordLabel = selected
    ? t('{n} selected', { n: selected })
    : context.value.wordMode === 'book'
      ? t('{n} words', { n: editor.words })
      : chapter?.kind === 'chapter'
        ? t('ch. {ch}: {n} words', {
            ch: chapter.number ?? 0,
            n: editor.wordCountFor(chapter.id),
          })
        : t('{name}: {n} words', {
            name: chapter?.label ?? '',
            n: chapter ? editor.wordCountFor(chapter.id) : 0,
          });
  const stories = editor.chapters.filter((row) =>
    ['chapter', 'unnumbered', 'prologue', 'epilogue', 'interlude'].includes(row.kind),
  );
  const pages = context.value.library.posMode === 'page' ? pagePosition(editor, current) : null;
  const positionLabel = context.value.library.posMode === 'page'
    ? current ? t('page {p} of {total}', {p:pages!.page,total:pages!.total}) : t('{n} pages',{n:pages!.total})
    : !chapter
    ? numbered.length > 1
      ? t('{n} chapters', { n: numbered.length })
      : ''
    : stories.length === 1 && chapter.kind === 'chapter'
      ? ''
      : chapter.kind === 'chapter'
        ? t('chapter {ch} of {total}', { ch: chapter.number ?? 0, total: numbered.length })
        : t(chapter.label);
  context.patch({
    currentChapter: current,
    wordLabel,
    positionLabel,
    ...context.scriptCounterLabels,
    todayWords: today ? Math.max(0, today.end - today.start) : 0,
    manuscriptMode: editor.manuscriptMode,
    screenplayScenes: editor.screenplayScenes,
    chapters: editor.chapters,
    protectedChapterIds: editor.chapters
      .filter((chapter) => !editor.supported(chapter.id))
      .map((chapter) => chapter.id),
    outlineRows: editor.outlineRows,
    outlineCards: editor.outlineCards,
    looseOutlineCards: editor.looseOutlineCards,
    walkingOutlineNote: editor.walkingOutlineNote,
    contentsRows: editor.contentsRows(Boolean(context.value.library.customChapterTitles)),
    darlings: editor.darlings.map((darling) => {
      const html =
        darling.html ||
        '<p>' +
          (darling.text ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;') +
          '</p>';
      let cached = context.previewCache.get(darling.id);
      if (cached?.html !== html) {
        cached = { html, preview: context.preview(html) };
        context.previewCache.set(darling.id, cached);
      }
      return { ...darling, preview: cached.preview };
    }),
    stickies: editor.stickies.map((sticky) => ({
      ...sticky,
      text: context.pendingStickies.get(sticky.id) ?? sticky.text,
    })),
    words: editor.words,
    revision: editor.revision,
    canUndo: editor.canUndo,
    canRedo: editor.canRedo,
    book: context.value.book ? editor.metadata : null,
  });
  context.scheduleMenu();
  void context.rendered().then(() => {
    context.refreshScriptLayout();
    const root = document.querySelector<HTMLElement>('#chapters'),
      aux = document.querySelector<HTMLElement>('#aux-editor');
    if (root && aux) {
      if (context.mountedRoot !== root) {
        context.surfaces?.renderBook(root, aux, context.value.panel, !context.value.readOnly);
        context.mountedRoot = root;
      } else
        context.surfaces?.update(
          context.editor?.activeSection?.id ?? context.value.chapters[0]?.id ?? '',
          context.value.panel,
          !context.value.readOnly,
        );
    }
  });
}

export function readingActivityOccurred(
  context: ApplicationProjectionContext,
  at = Date.now(),
): void {
  context.readingActivity = Math.max(context.readingActivity, at);
}

export function rememberReadingPosition(context: ApplicationProjectionContext): void {
  const editor = context.editor;
  if (!editor || context.value.readOnly) return;
  const value = editor.metadata.lastPosition;
  const previous = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const scroll = document.querySelector<HTMLElement>('#paper-scroll')?.scrollTop ?? 0;
  const native = window.getSelection()?.anchorNode;
  const element =
    native?.nodeType === Node.TEXT_NODE
      ? native.parentElement
      : native instanceof Element
        ? native
        : null;
  const selection =
    context.value.panel === 'manuscript' && element?.closest('.chapter-body')
      ? editor.selection
      : null;
  if (selection && editor.chapters.some((chapter) => chapter.id === selection.chapterId)) {
    const pIdx = editor
      .passageRows(selection.chapterId)
      .filter((row) => row.kind === 'paragraph')
      .findIndex((row) => row.id === selection.passageId);
    const same =
      previous.chapterId === selection.chapterId &&
      (previous.passageId === selection.passageId
        ? previous.from === selection.from && previous.to === selection.to
        : previous.pIdx === pIdx &&
          (previous.off ?? 0) === selection.from &&
          selection.from === selection.to);
    editor.setBookkeeping({
      lastPosition: {
        ...selection,
        ...(pIdx >= 0 ? { pIdx, off: selection.from } : {}),
        scroll,
        at: same && typeof previous.at === 'number' ? previous.at : Date.now(),
      },
    });
  } else if (
    typeof previous.chapterId === 'string' &&
    Math.abs((typeof previous.scroll === 'number' ? previous.scroll : 0) - scroll) > 40
  ) {
    editor.setBookkeeping({
      lastPosition: {
        ...previous,
        scroll,
        at: typeof previous.at === 'number' ? previous.at : Date.now(),
      },
    });
  }
}

export function tryRemotePosition(context: ApplicationProjectionContext): boolean {
  const pending = context.pendingRemotePosition,
    editor = context.editor;
  if (
    !pending ||
    !editor ||
    pending.bookId !== context.value.book?.id ||
    context.value.readOnly ||
    context.value.externalChange
  )
    return false;
  const position = pending.position,
    chapter = editor.chapters.find((row) => row.id === position.chapterId);
  const rows = chapter ? editor.passageRows(chapter.id) : [];
  const here = editor.metadata.lastPosition;
  const hereAt =
    here && typeof here === 'object' && !Array.isArray(here) && typeof here.at === 'number'
      ? here.at
      : 0;
  if (
    remotePositionEligibility({
      position,
      hereAt,
      lastActivity: context.readingActivity,
      panel: context.value.panel,
      modalOpen: context.overlayOpen(),
      now: Date.now(),
      chapter: chapter
        ? {
            id: chapter.id,
            editable: editor.canEdit(chapter.id),
            paragraphCount: rows.filter((row) => row.kind === 'paragraph').length,
            passageIds: rows.map((row) => row.id),
          }
        : null,
    }) !== 'ready'
  )
    return false;
  const scroller = document.querySelector<HTMLElement>('#paper-scroll');
  if (editor.canEdit(position.chapterId) && ('passageId' in position || 'pIdx' in position)) {
    const target =
      'passageId' in position && rows.some((row) => row.id === position.passageId)
        ? position
        : {
            chapterId: position.chapterId,
            pIdx:
              'pIdx' in position
                ? (position.pIdx ?? Number.MAX_SAFE_INTEGER)
                : Number.MAX_SAFE_INTEGER,
            off: 'off' in position ? (position.off ?? 0) : 'from' in position ? position.from : 0,
          };
    if (!editor.restoreSelection(target)) return false;
    context.surfaces?.focus({ preventScroll: true });
    context.surfaces?.revealSelection({ viewportFraction: 1 / 3 });
  } else if (scroller) scroller.scrollTop = position.scroll ?? 0;
  editor.setBookkeeping({
    lastPosition: { ...position, scroll: scroller?.scrollTop ?? position.scroll ?? 0 },
  });
  context.pendingRemotePosition = null;
  context.session?.changed();
  return true;
}
