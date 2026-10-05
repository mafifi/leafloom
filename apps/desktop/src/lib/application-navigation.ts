import { type EditorPort, type SurfacePort } from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import type { AppState, ApplicationPlatform } from './application';
import { nativeHistoryField } from './field-history';
import { FieldTypographyViewModel } from './field-typography';
import type { InformationPresentation } from './information';
import { KeyboardNavigation } from './keyboard-navigation';
import { LibraryViewModel } from './library-view-model';
import { PublicationPageViewModel } from './publication-page';


export interface ApplicationNavigationContext {
  patch: (patch: Partial<AppState>) => void;
  value: AppState;
  project: () => void;
  projectCounters: (id: string) => void;
  editor: EditorPort | null;
  platform: ApplicationPlatform | undefined;
  overlayOpen: () => boolean;
  tabPlaces: Map<string, { scroll: number; caret: unknown }>;
  setPanel: (panel: string) => void;
  rendered: () => Promise<void>;
  surfaces: SurfacePort<HTMLElement> | null;
  fieldTypography: FieldTypographyViewModel | null;
  publicationPageViewModel: PublicationPageViewModel;
  execute: (
    command: () => void | Promise<void>,
    options?: { closeMenu?: boolean },
  ) => Promise<void>;
  save: () => Promise<void>;
  keyboardNavigation: KeyboardNavigation;
  closeEmailSettings: () => void;
  closeCoverArt: () => void;
  closeFontPicker: () => void;
  closeInformation: () => void;
  closeLibrarySettings: () => void;
  closeGoals: () => Promise<void>;
  answer: (value: string | null) => void;
  closeSearch: () => void;
  libraryViewModel: LibraryViewModel;
  undoAuthorMove: () => Promise<void>;
  dismissMenu: () => void;
  fullscreen: boolean;
  fullscreenChanged: (raw: unknown) => void;
  closeBook: (save?: boolean) => Promise<void>;
  toggleSpelling: () => void;
  alignParagraph: (value: 'left' | 'center' | 'right' | 'justify') => void;
  openGoals: () => void;
  nativeCommand: (command: string) => Promise<void>;
  cycleFocus: () => Promise<void>;
  textSize: (delta: number) => Promise<void>;
  showInformation: (kind: InformationPresentation['kind']) => Promise<void>;
  emailDraft: () => Promise<void>;
  redo: () => void;
  undo: () => void;
  newSticky: () => Promise<void>;
  archive: () => void;
  openSearch: () => void;
}

export function cycleWordCounter(context: ApplicationNavigationContext): void {
  context.patch({ wordMode: context.value.wordMode === 'book' ? 'chapter' : 'book' });
  context.project();
}

export function trackVisibleChapter(context: ApplicationNavigationContext): void {
  if (context.value.panel !== 'manuscript') return;
  let best: string | null = null;
  for (const element of document.querySelectorAll<HTMLElement>('#chapters .chapter'))
    if (element.getBoundingClientRect().top < window.innerHeight * 0.4)
      best = element.dataset.chid ?? null;
  if (best && best !== context.value.currentChapter) {
    context.patch({ currentChapter: best });
    context.projectCounters(best);
  }
}

export function projectCounters(context: ApplicationNavigationContext, id: string): void {
  const editor = context.editor,
    chapter = editor?.chapters.find((row) => row.id === id);
  if (!editor || !chapter) return;
  const t = (key: string, args: Record<string, string | number> = {}) =>
    translate(context.value.language, key, args);
  const numbered = editor.chapters.filter((row) => row.kind === 'chapter');
  context.patch({
    positionLabel:
      chapter.kind === 'chapter' && numbered.length === 1
        ? ''
        : chapter.kind === 'chapter'
          ? t('chapter {ch} of {total}', { ch: chapter.number ?? 0, total: numbered.length })
          : t(chapter.label),
    ...(context.value.wordMode === 'chapter'
      ? {
          wordLabel:
            chapter.kind === 'chapter'
              ? t('ch. {ch}: {n} words', { ch: chapter.number ?? 0, n: editor.wordCountFor(id) })
              : t('{name}: {n} words', { name: chapter.label, n: editor.wordCountFor(id) }),
        }
      : {}),
  });
}

export function chapterNavigationKey(
  context: ApplicationNavigationContext,
  event: KeyboardEvent,
): void {
  const mod = context.platform?.isMac ? event.metaKey : event.ctrlKey;
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    !mod ||
    !event.altKey ||
    event.shiftKey ||
    !['ArrowUp', 'ArrowDown'].includes(event.key) ||
    context.value.view !== 'editor' ||
    context.overlayOpen()
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  const chapters = context.editor?.chapters ?? [];
  let index = chapters.findIndex((row) => row.id === context.value.currentChapter);
  if (index < 0) index = direction > 0 ? -1 : chapters.length;
  const next = Math.max(0, Math.min(chapters.length - 1, index + direction));
  if (next === index || !chapters[next]) return;
  const id = chapters[next].id;
  if (context.value.panel !== 'manuscript') {
    context.tabPlaces.delete('manuscript');
    context.setPanel('manuscript');
  }
  void context.rendered().then(() => {
    const first = context.editor?.passageRows(id)[0];
    if (first) context.editor?.selectPassage(first.id, 0);
    context.surfaces?.focus({ preventScroll: true });
    document.querySelector<HTMLElement>(`.chapter[data-chid="${CSS.escape(id)}"]`)?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  });
}

export function showNav(context: ApplicationNavigationContext, open: boolean): void {
  context.patch({ navOpen: open });
}

export function showSide(context: ApplicationNavigationContext, open: boolean): void {
  context.patch({ sideOpen: open });
}

export function toggleNav(context: ApplicationNavigationContext): void {
  context.patch({ navPinned: !context.value.navPinned });
  context.platform?.panePreferences?.write({
    nav: context.value.navPinned,
    side: context.value.sidePinned,
  });
}

export function toggleSide(context: ApplicationNavigationContext): void {
  context.patch({ sidePinned: !context.value.sidePinned });
  context.platform?.panePreferences?.write({
    nav: context.value.navPinned,
    side: context.value.sidePinned,
  });
}

export function fieldTypographyKey(
  context: ApplicationNavigationContext,
  event: KeyboardEvent,
): void {
  context.fieldTypography?.key(event);
}

export function key(context: ApplicationNavigationContext, event: KeyboardEvent): void {
  if (context.publicationPageViewModel.active) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void context.execute(() => context.save());
    }
    return;
  }
  // ProseMirror prevents native Escape/Enter defaults even when its commands stand down.
  // Vim and modal owners stop propagation; these author-global keys still belong here.
  const authorGlobalKey =
    (event.key === 'Escape' ||
      (event.key === 'Enter' &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey)) &&
    event.target instanceof Element &&
    event.target.closest('.chapter-body,#aux-editor');
  if ((event.defaultPrevented && !authorGlobalKey) || event.isComposing || event.keyCode === 229)
    return;
  if (
    !context.value.coverArt &&
    !context.value.fontPicker &&
    !context.value.emailSettings &&
    context.keyboardNavigation.key(event)
  )
    return;
  if (event.key === 'Escape') {
    if (context.value.emailSettings) context.closeEmailSettings();
    else if (context.value.coverArt) context.closeCoverArt();
    else if (context.value.fontPicker) context.closeFontPicker();
    else if (context.value.information) context.closeInformation();
    else if (context.value.librarySettings) context.closeLibrarySettings();
    else if (context.value.goals) void context.execute(() => context.closeGoals());
    else if (context.value.modal) context.answer(null);
    else if (context.value.searchOpen) context.closeSearch();
    else if (context.value.view === 'library' && context.libraryViewModel.canUndoMove)
      void context.execute(() => context.undoAuthorMove());
    else if (context.value.menu) context.dismissMenu();
    else if (context.fullscreen)
      void context.execute(async () => {
        await context.platform?.os?.request('fullscreenEscape', {});
        context.fullscreenChanged({ fullscreen: false });
      });
    else if (context.value.view === 'editor') void context.execute(() => context.closeBook());
    else context.dismissMenu();
    return;
  }
  if (
    context.value.information?.kind === 'shortcuts' &&
    (event.metaKey || event.ctrlKey) &&
    (event.key === '/' || event.key === '?')
  ) {
    event.preventDefault();
    document.querySelector<HTMLElement>('.shortcuts-content')?.focus();
    return;
  }
  if (context.overlayOpen()) return;
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return;
  if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    void context.execute(() => context.platform?.fullscreen() ?? Promise.resolve());
    return;
  }
  if (
    !event.altKey &&
    ((event.shiftKey && event.key === ';') || (event.code === 'Semicolon' && event.key !== ';'))
  ) {
    event.preventDefault();
    context.toggleSpelling();
    return;
  }
  const key = event.key.toLowerCase();
  if (
    !context.value.nativeMenus &&
    event.shiftKey &&
    !event.altKey &&
    ['l', 'c', 'r', 'j'].includes(key)
  ) {
    event.preventDefault();
    const alignment = { l: 'left', c: 'center', r: 'right', j: 'justify' } as const;
    context.alignParagraph(alignment[key as keyof typeof alignment]);
    return;
  }
  if ((key === 'z' || key === 'y') && nativeHistoryField(event.target)) return;
  if (key === ',') {
    event.preventDefault();
    context.openGoals();
  } else if (key === 't' && event.shiftKey) {
    event.preventDefault();
    void context.execute(() => context.nativeCommand('typewriter'));
  } else if (key === 'o' && event.shiftKey) {
    event.preventDefault();
    void context.execute(() => context.cycleFocus());
  } else if (key === 'f' && event.shiftKey) {
    event.preventDefault();
    void context.execute(() => context.platform?.fullscreen() ?? Promise.resolve());
  } else if (key === '=' || key === '+' || key === '-' || key === '0') {
    event.preventDefault();
    void context.execute(() => context.textSize(key === '0' ? 0 : key === '-' ? -1 : 1));
  } else if (key === '/' || key === '?') {
    event.preventDefault();
    void context.execute(() => context.showInformation('shortcuts'));
  } else if (key === 'e') {
    event.preventDefault();
    void context.execute(() => context.emailDraft());
  } else if (key === 's') {
    event.preventDefault();
    void context.execute(() => context.save());
  } else if (key === 'z') {
    event.preventDefault();
    event.shiftKey ? context.redo() : context.undo();
  } else if (key === 'y') {
    event.preventDefault();
    context.redo();
  } else if (key === 'x' && event.shiftKey) {
    event.preventDefault();
    void context.execute(() => context.newSticky());
  } else if (key === 'd' && event.shiftKey) {
    event.preventDefault();
    context.archive();
  } else if (key === 'f') {
    event.preventDefault();
    context.openSearch();
  }
}
