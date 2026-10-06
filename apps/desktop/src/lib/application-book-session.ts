import type { BrowserReadAloud } from './browser-read-aloud';
import type { DocumentSnapshotValue } from '@leafloom/editor-contracts';
import { AuthoringSession, ProgressTracker, writingDay, dailyWordCount } from '@leafloom/authoring';
import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import {
  OpenReply,
  SaveReply,
  type Annotation,
  type EditorPort,
  type OutlineTarget,
  type RemotePosition,
  type SurfacePort,
} from '@leafloom/editor-contracts';
import { z } from 'zod';
import type { AppState, ApplicationPlatform, EditorFactory } from './application';
import { HostRecoveryViewModel } from './host-recovery';
import { PublicationPageViewModel } from './publication-page';
import { SearchViewModel } from './search-view-model';
import { SpellingViewModel } from './spelling-view-model';


export interface ApplicationBookSessionContext {
  readAloud: BrowserReadAloud | null;
  bookTransitions: Promise<void>;
  transitionBook: (command: () => Promise<void>) => Promise<void>;
  openBookNow: (id: string) => Promise<void>;
  publicationPageViewModel: PublicationPageViewModel;
  closePublicationPage: () => Promise<void>;
  value: AppState;
  closeBookNow: (save?: boolean) => Promise<void>;
  flushScriptContact: () => Promise<void>;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  lease: string | null;
  documentVersions: Record<'reviews' | 'notes' | 'outline' | 'manuscript', string> | null;
  committedDocument: DocumentSnapshotValue | null;
  factory: EditorFactory;
  undo: () => void;
  redo: () => void;
  execute: (
    command: () => void | Promise<void>,
    options?: { closeMenu?: boolean },
  ) => Promise<void>;
  save: () => Promise<void>;
  format: (mark: 'bold' | 'italic' | 'underline' | 'strike') => void;
  archive: () => void;
  project: () => void;
  editor: EditorPort | null;
  surfaces: SurfacePort<HTMLElement> | null;
  showSide: (open: boolean) => void;
  rendered: () => Promise<void>;
  spellingMenu: (target: Annotation & { text: string; x: number; y: number }) => Promise<void>;
  openSearch: () => void;
  platform: ApplicationPlatform | undefined;
  progress: ProgressTracker | null;
  progressBaseline: number;
  writingLanguage: (preferences?: {
    [x: string]: unknown;
    firstRunDone: boolean;
    authorName: string;
    authors: { [x: string]: unknown; id: string; name: string }[];
    currentAuthorId: string;
    shelves: {
      [x: string]: unknown;
      id: string;
      name: string;
      authorId: string;
      bookIds: string[];
      bound?: boolean | undefined;
      binding?:
        | {
            [x: string]: unknown;
            bound: boolean;
            numbering: string;
            parked: { id: string; kind: string; before?: string | null | undefined }[];
          }
        | undefined;
    }[];
    writingStyle: 'pantser' | 'plotter';
    fonts: Record<string, string>;
    pageTheme: string;
  }) => string;
  session: AuthoringSession | null;
  patch: (patch: Partial<AppState>) => void;
  unsubscribe: (() => void) | null;
  updateProgress: () => void;
  scheduleSpell: () => void;
  timer: NodeJS.Timeout | null;
  hostRecoveryViewModel: HostRecoveryViewModel;
  background: (command: () => void | Promise<void>) => Promise<void>;
  activateSpellingSection: () => void;
  focusOutline: (target?: OutlineTarget) => void;
  externalReconciliation: Promise<void> | null;
  libraryWrites: Promise<void>;
  searchViewModel: SearchViewModel;
  spellingViewModel: SpellingViewModel;
  spellActiveSection: string | null;
  mountedRoot: HTMLElement | null;
  tabPlaces: Map<string, { scroll: number; caret: unknown }>;
  pendingRemotePosition: { bookId: string; position: RemotePosition } | null;
  initialize: () => Promise<void>;
}

export function transitionBook(
  context: ApplicationBookSessionContext,
  command: () => Promise<void>,
): Promise<void> {
  const transition = context.bookTransitions.then(command);
  context.bookTransitions = transition.catch(() => {});
  return transition;
}

export function openBook(context: ApplicationBookSessionContext, id: string): Promise<void> {
  return context.transitionBook(() => context.openBookNow(id));
}

export async function openBookNow(
  context: ApplicationBookSessionContext,
  id: string,
): Promise<void> {
  if (context.publicationPageViewModel.active) await context.closePublicationPage();
  if (context.value.book) await context.closeBookNow();
  const opened = OpenReply.parse(await context.request('openBook', { bookId: id }));
  context.lease = opened.lease;
  context.documentVersions = opened.versions;
  context.committedDocument = {
    book: opened.book,
    reviews: opened.reviews,
    notes: opened.notes,
    outline: opened.outline,
  };
  const { editor, surfaces } = context.factory(
    opened,
    {
      undo: () => context.undo(),
      redo: () => context.redo(),
      save: () => void context.execute(() => context.save()),
      format: (mark) => context.format(mark),
      archive: () => context.archive(),
    },
    () => context.project(),
  );
  context.editor = editor;
  context.surfaces = surfaces;
  surfaces.configurePresentation({
    typewriter: Boolean(context.value.library.typewriter),
    focus:
      context.value.library.focusMode === 'sentence'
        ? 'sentence'
        : context.value.library.focusMode
          ? 'paragraph'
          : 'off',
    language: context.value.language.locale,
  });
  surfaces.setVim(Boolean(context.value.library.vimKeys ?? context.value.library.vimMode));
  surfaces.setHooks({
    activate: (target) => {
      if (target.kind === 'sticky') {
        context.showSide(true);
        void context
          .rendered()
          .then(() =>
            document
              .querySelector<HTMLElement>(`[data-sticky-id="${CSS.escape(target.id)}"] textarea`)
              ?.focus(),
          );
      }
    },
    contextMenu: (target) => void context.execute(() => context.spellingMenu(target)),
    search: () => context.openSearch(),
    searchAgain: (direction,times,visual) => context.searchViewModel.repeat(direction,times,visual),
    copy: (value) => void context.execute(() => context.platform?.writeClipboard?.(value)),
  });
  context.progress = new ProgressTracker(
    {},
    Number(context.value.library.dayEndsAt) || 0,
    () => new Date(),
  );
  context.progress.open(editor.words);
  context.progressBaseline = editor.words;
  editor.configureTypography({
    interfaceLanguage: context.value.language.locale,
    language: context.writingLanguage(),
    markdown: !context.value.library.markdownOff,
  });
  context.session = new AuthoringSession(editor, async (checkpoint) => {
    if (context.editor !== editor || context.value.book?.id !== id) throw Error('CLOSED_BOOK');
    if (!context.lease || !context.documentVersions) throw Error('READ_ONLY');
    const reply = SaveReply.parse(
      await context.request('checkpoint', {
        bookId: id,
        lease: context.lease,
        checkpoint,
        expected: context.documentVersions,
      }),
    );
    if (context.editor !== editor || context.value.book?.id !== id) return;
    context.documentVersions = reply.versions;
    context.committedDocument = {
      book: checkpoint.book,
      reviews: checkpoint.reviews,
      notes: checkpoint.notes,
      outline: checkpoint.outline,
    };
    context.patch({ dirty: editor.revision !== reply.revision });
  });
  context.unsubscribe = editor.subscribe((event) => {
    if (event.kind === 'changed') {
      context.updateProgress();
      context.session?.changed();
      context.patch({ dirty: true });
      context.scheduleSpell();
      if (context.timer) clearTimeout(context.timer);
      if (!context.hostRecoveryViewModel.blocked)
        context.timer = setTimeout(() => void context.background(() => context.save()), 500);
    }
    if (event.kind === 'selection') context.activateSpellingSection();
    context.project();
  });
  context.patch({
    view: 'editor',
    book: opened.book.metadata,
    panel:
      context.value.library.writingStyle === 'plotter' && editor.manuscriptMode !== 'screenplay' && opened.book.chapters.length === 0
        ? 'outline'
        : 'manuscript',
    readOnly: opened.readOnly,
    hint: opened.recovered
      ? 'Recovered saved book'
      : opened.readOnly
        ? 'Read-only: this book is already open'
        : '',
  });
  if (!opened.readOnly && editor.revision !== opened.book.revision) {
    context.session.changed();
    context.patch({ dirty: true });
    if (!context.hostRecoveryViewModel.blocked)
      context.timer = setTimeout(() => void context.background(() => context.save()), 500);
  }
  if (!opened.readOnly && !editor.chapters.length && context.value.panel === 'outline')
    editor.createChapter('');
  if (!opened.readOnly) {
    const day = writingDay(new Date(), Number(context.value.library.dayEndsAt) || 0),
      counts = z
        .record(z.string(), z.object({ start: z.number(), end: z.number() }))
        .catch({})
        .parse(editor.metadata.dailyCounts);
    counts[day] = dailyWordCount(counts[day], editor.words);
    editor.setBookkeeping({ wordCount: editor.words, dailyCounts: counts });
  }
  context.project();
  await context.rendered();
  if (context.value.panel === 'outline') context.focusOutline(editor.outlineRows[0]);
  else if (!editor.chapters.length || editor.manuscriptMode === 'screenplay' && !editor.words && ['', 'Untitled'].includes(String(editor.metadata.title))) document.querySelector<HTMLElement>('#tp-title')?.focus();
  else {
    const saved = opened.book.metadata.lastPosition;
    if (
      !opened.readOnly &&
      saved &&
      typeof saved === 'object' &&
      !Array.isArray(saved) &&
      typeof saved.chapterId === 'string' &&
      editor.canEdit(saved.chapterId) &&
      editor.restoreSelection(saved)
    ) {
      context.surfaces?.focus({ preventScroll: true });
      context.surfaces?.revealSelection({ viewportFraction: 1 / 3 });
    } else if (
      saved &&
      typeof saved === 'object' &&
      !Array.isArray(saved) &&
      typeof saved.scroll === 'number'
    ) {
      const scroller = document.querySelector<HTMLElement>('#paper-scroll');
      if (scroller) scroller.scrollTop = saved.scroll;
    }
  }
  context.surfaces?.restVim();
  context.activateSpellingSection();
}

export function closeBook(context: ApplicationBookSessionContext, save = true): Promise<void> {
  return context.transitionBook(() => context.closeBookNow(save));
}

export async function closeBookNow(
  context: ApplicationBookSessionContext,
  save = true,
): Promise<void> {
  context.readAloud?.stop(false);
  if (context.externalReconciliation) await context.externalReconciliation;
  context.editor?.finishMetadataField();
  await context.flushScriptContact();
  if (context.publicationPageViewModel.active) await context.closePublicationPage();
  if (save) await context.save();
  await context.libraryWrites;
  context.searchViewModel.closeSearch();
  context.spellingViewModel.clear();
  context.spellActiveSection = null;
  if (context.timer) {
    clearTimeout(context.timer);
    context.timer = null;
  }
  const id = context.value.book?.id;
  if (id) await context.request('closeBook', { bookId: id, lease: context.lease });
  context.unsubscribe?.();
  context.surfaces?.destroy();
  context.editor = null;
  context.surfaces = null;
  context.mountedRoot = null;
  context.tabPlaces.clear();
  context.session = null;
  context.lease = null;
  context.documentVersions = null;
  context.committedDocument = null;
  context.pendingRemotePosition = null;
  await context.initialize();
  context.patch({ view: 'library', book: null, readOnly: false, externalChange: null });
}
