import { FullscreenChangedSchema } from '@leafloom/desktop-host';
import { type EditorPort, type OutlineTarget, type SurfacePort } from '@leafloom/editor-contracts';
import { Library } from '@leafloom/library';
import { z } from 'zod';
import type { AppState, ApplicationPlatform, MenuItem } from './application';
import type { InformationPresentation } from './information';
import { LibrarySettingsViewModel } from './library-settings';
import { applyPresentation, brighterInterface } from './presentation';
import { keepReadingPlace } from './reading-place';
import { UpdateViewModel } from './update-view-model';


export interface ApplicationMenusContext {
  value: AppState;
  platform: ApplicationPlatform | undefined;
  updates: UpdateViewModel | null;
  initializeUpdates: (packaged: boolean) => Promise<void>;
  patch: (patch: Partial<AppState>) => void;
  rendered: () => Promise<void>;
  surfaces: SurfacePort<HTMLElement> | null;
  nativeMenuPending: boolean;
  background: (command: () => void | Promise<void>) => Promise<void>;
  synchronizeMenu: () => Promise<void>;
  effectiveSpellLanguage: string;
  editor: EditorPort | null;
  nativeMenuSignature: string;
  fullscreen: boolean;
  preference: (key: string, value: unknown) => Promise<void>;
  libraryGeneration: number;
  applyPlatformDropcap: () => void;
  bodyFontStyle: (font: string) => string;
  appearanceWaiters: { resolve(): void; reject(error: unknown): void }[];
  scheduleAppearanceSave: () => void;
  scheduleMenu: () => void;
  writable: () => boolean;
  overlayOpen: () => boolean;
  librarySettingsViewModel: LibrarySettingsViewModel;
  deleteChapter: (id: string) => void;
  focusOutline: (target?: OutlineTarget) => void;
  setChapterKind: (id: string, kind: string) => void;
  exportChapter: (id: string) => Promise<void>;
  renameChapterPrompt: (id: string) => Promise<void>;
  duplicateChapter: (id: string) => void;
  reorderChapter: (id: string, index: number) => void;
  createChapter: (index?: number, kind?: string) => void;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  format: (mark: 'bold' | 'italic') => void;
  togglePoetry: () => void;
  alignParagraph: (value: 'left' | 'center' | 'right' | 'justify') => void;
  newSticky: () => Promise<void>;
  archive: () => void;
  toggleSpelling: () => void;
  bookGoal: () => Promise<void>;
  dailyGoal: () => Promise<void>;
  startSprint: () => Promise<void>;
  endSprint: () => void;
  importBooks: () => Promise<void>;
  reshelveBook: () => Promise<void>;
  openFontPicker: () => Promise<void>;
  openSearch: () => void;
  openCoverSettings: () => Promise<void>;
  emailDraft: () => Promise<void>;
  openEmailSettings: () => Promise<void>;
  libraryFolder: () => Promise<void> | undefined;
  showInformation: (kind: InformationPresentation['kind']) => Promise<void>;
}

export async function showInformation(
  context: ApplicationMenusContext,
  kind: InformationPresentation['kind'],
): Promise<void> {
  if (context.value.coverArt || context.value.fontPicker || context.value.emailSettings) return;
  if (context.value.information) {
    if (kind === 'shortcuts' && context.value.information.kind === 'shortcuts')
      document.querySelector<HTMLElement>('.shortcuts-content')?.focus();
    return;
  }
  let version = '0.1.0';
  if (context.platform?.os) {
    if (kind === 'update') {
      if (!context.updates) await context.initializeUpdates(false);
      version = context.value.update?.version ?? version;
    } else {
      const raw = await context.platform.os.request('version', {});
      version =
        typeof raw === 'string' ? raw : z.object({ version: z.string() }).parse(raw).version;
    }
  }
  const titles = {
    help: 'Writing with Leafloom',
    shortcuts: 'Keyboard shortcuts',
    about: 'Leafloom',
    update: 'Updates',
  };
  context.patch({
    information: {
      kind,
      title: titles[kind],
      version,
      vim: Boolean(context.value.library.vimKeys),
      ...(kind === 'update' && context.value.update ? { update: context.value.update } : {}),
    },
  });
  if (kind === 'update') await context.updates?.check();
}

export function closeInformation(context: ApplicationMenusContext): void {
  context.patch({ information: null });
  void context.rendered().then(() => context.surfaces?.focus());
}

export function scheduleMenu(context: ApplicationMenusContext): void {
  if (!context.platform?.os || context.nativeMenuPending) return;
  context.nativeMenuPending = true;
  queueMicrotask(() => {
    context.nativeMenuPending = false;
    void context.background(() => context.synchronizeMenu());
  });
}

export async function synchronizeMenu(context: ApplicationMenusContext): Promise<void> {
  const os = context.platform?.os;
  if (!os) return;
  const prefs = context.value.library;
  const state = {
    bodyFont: prefs.fonts.body,
    writingStyle: prefs.writingStyle,
    dropcap: prefs.fonts.dropcap,
    language: context.value.language.locale,
    spellLanguage: context.effectiveSpellLanguage,
    pageTheme: prefs.pageTheme,
    focus: prefs.focusMode === 'sentence' ? 'sentence' : prefs.focusMode ? 'paragraph' : 'off',
    typewriter: Boolean(prefs.typewriter),
    vim: Boolean(prefs.vimKeys),
    markdownEmphasis: !prefs.markdownOff,
    uiBright: brighterInterface(prefs.uiBright),
    interfaceZoom: Number(prefs.uiZoom) || 1,
    poetry: context.editor?.activeFormatting.poetry ?? false,
    align: context.editor?.activeFormatting.align ?? 'left',
  };
  const signature = JSON.stringify(state);
  if (signature === context.nativeMenuSignature) return;
  context.nativeMenuSignature = signature;
  try {
    await os.request('setMenuState', state);
  } catch (error) {
    if (context.nativeMenuSignature === signature) context.nativeMenuSignature = '';
    throw error;
  }
}

export function fullscreenChanged(context: ApplicationMenusContext, raw: unknown): void {
  const { fullscreen } = FullscreenChangedSchema.parse(
    raw && typeof raw === 'object'
      ? { fullscreen: (raw as { fullscreen: unknown }).fullscreen }
      : raw,
  );
  context.fullscreen = fullscreen;
  document.body.classList.toggle('full-screen', fullscreen);
}

export async function cycleFocus(context: ApplicationMenusContext): Promise<void> {
  const levels = [false, 'paragraph', 'sentence'] as const;
  const current =
    context.value.library.focusMode === true
      ? 'paragraph'
      : context.value.library.focusMode || false;
  await context.preference(
    'focusMode',
    levels[(levels.indexOf(current as (typeof levels)[number]) + 1) % levels.length],
  );
}

export async function textSize(context: ApplicationMenusContext, delta: number): Promise<void> {
  const size =
    delta === 0
      ? 17
      : Math.min(22, Math.max(14, (Number(context.value.library.editorFontSize) || 17) + delta));
  if (
    size === (Number(context.value.library.editorFontSize) || 17) &&
    (delta !== 0 || context.value.zoom === 1)
  )
    return;
  const next = Library.parse({
    ...context.value.library,
    editorFontSize: size,
    ...(delta === 0 ? { pageZoom: 1 } : {}),
  });
  context.libraryGeneration++;
  context.patch({ library: next, ...(delta === 0 ? { zoom: 1 } : {}) });
  keepReadingPlace(() => {
    applyPresentation(next);
    context.applyPlatformDropcap();
    document.documentElement.style.setProperty(
      '--body-font',
      context.bodyFontStyle(next.fonts.body),
    );
  });
  const saved = new Promise<void>((resolve, reject) =>
    context.appearanceWaiters.push({ resolve, reject }),
  );
  context.scheduleAppearanceSave();
  context.scheduleMenu();
  await context.rendered();
  await saved;
}

export async function pasteMatchStyle(context: ApplicationMenusContext): Promise<void> {
  if (!context.writable() || !context.editor) return;
  const clip = context.platform?.os
    ? z
        .object({ text: z.string(), html: z.string().nullable() })
        .parse(await context.platform.os.request('readClipboard', {}))
    : { text: await navigator.clipboard.readText() };
  context.editor.paste({ text: clip.text });
  context.surfaces?.focus();
}

export function libraryFolder(context: ApplicationMenusContext): Promise<void> | undefined {
  if (context.overlayOpen()) return;
  return context.librarySettingsViewModel.open();
}

export function closeLibrarySettings(context: ApplicationMenusContext): void {
  context.librarySettingsViewModel.close();
}

export function chooseLibraryFolder(
  context: ApplicationMenusContext,
  defaultFolder = false,
): Promise<void> {
  return context.librarySettingsViewModel.choose(defaultFolder);
}

export function backupLibrary(context: ApplicationMenusContext): Promise<void> {
  return context.librarySettingsViewModel.backup();
}

export function revealLibrary(context: ApplicationMenusContext): Promise<void> {
  return context.librarySettingsViewModel.reveal();
}

export function outlineContext(
  context: ApplicationMenusContext,
  target: OutlineTarget,
): MenuItem[] {
  return [
    {
      label: target.sectionId ? 'Delete section' : 'Delete chapter',
      run: () => {
        if (!context.writable() || !context.editor) return;
        if (!target.sectionId) context.deleteChapter(target.chapterId);
        else
          context.focusOutline(
            context.editor.outlineDelete({
              chapterId: target.chapterId,
              sectionId: target.sectionId,
            }),
          );
      },
    },
  ];
}

export function chapterNote(context: ApplicationMenusContext, id: string, value: string): void {
  if (!context.writable()) return;
  const notes = z.record(z.string(), z.string()).catch({}).parse(context.value.book?.chapterNotes);
  context.editor?.updateMetadata({ chapterNotes: { ...notes, [id]: value } });
}

export function chapterContext(
  context: ApplicationMenusContext,
  id: string,
  index: number,
): MenuItem[] {
  const chapter = context.editor?.chapters.find((row) => row.id === id);
  if (!chapter) return [];
  const hasWords = context.editor!.passageRows(id).some((row) => /[\p{L}\p{N}]/u.test(row.text));
  const otherContents = context.value.chapters.some(
    (row) => row.id !== id && row.kind === 'contents',
  );
  const names: Record<string, string> = {
    copyright: 'Copyright',
    dedication: 'Dedication',
    epigraph: 'Epigraph',
    contents: 'Contents',
    prologue: 'Prologue',
    part: 'Part',
    chapter: 'Chapter',
    unnumbered: 'Unnumbered Chapter',
    epilogue: 'Epilogue',
    acknowledgments: 'Acknowledgments',
    about: 'About the Author',
  };
  const items: MenuItem[] = Object.entries(names).map(([kind, label]) => ({
    label,
    checked: chapter.kind === kind,
    disabled:
      context.value.readOnly ||
      (kind === 'contents' && chapter.kind !== kind && (otherContents || hasWords)),
    run: () => context.setChapterKind(id, kind),
  }));
  const separator = { label: '', separator: true, run() {} };
  if (['chapter', 'unnumbered', 'prologue', 'epilogue'].includes(chapter.kind) && hasWords)
    items.push(separator, { label: 'Export Chapter…', run: () => context.exportChapter(id) });
  if (chapter.kind === 'part')
    items.push(separator, {
      label: 'Restart Chapter Numbers at Each Part',
      checked: Boolean(context.value.book?.restartNumbering),
      disabled: context.value.readOnly,
      run: () => {
        if (context.writable())
          context.editor?.updateMetadata({
            restartNumbering: !context.value.book?.restartNumbering,
          });
      },
    });
  items.push(
    separator,
    {
      label: 'Rename…',
      disabled: context.value.readOnly,
      run: () => context.renameChapterPrompt(id),
    },
    {
      label: 'Duplicate',
      disabled: context.value.readOnly,
      run: () => context.duplicateChapter(id),
    },
    {
      label: 'Move up',
      disabled: context.value.readOnly || index === 0,
      run: () => context.reorderChapter(id, index - 1),
    },
    {
      label: 'Move down',
      disabled: context.value.readOnly || index === context.value.chapters.length - 1,
      run: () => context.reorderChapter(id, index + 1),
    },
    separator,
    {
      label: 'Delete',
      danger: true,
      disabled: context.value.readOnly,
      run: () => context.deleteChapter(id),
    },
  );
  return items;
}

export function chapterInsertionContext(
  context: ApplicationMenusContext,
  index: number,
): MenuItem[] {
  const names = {
    copyright: 'Copyright',
    dedication: 'Dedication',
    epigraph: 'Epigraph',
    contents: 'Contents',
    prologue: 'Prologue',
    part: 'Part',
    chapter: 'Chapter',
    unnumbered: 'Unnumbered Chapter',
    epilogue: 'Epilogue',
    acknowledgments: 'Acknowledgments',
    about: 'About the Author',
  };
  return Object.entries(names).map(([kind, label]) => ({
    label,
    disabled:
      context.value.readOnly ||
      (kind === 'contents' && context.value.chapters.some((c) => c.kind === 'contents')),
    run: () => context.createChapter(index, kind),
  }));
}

export function formatMenu(context: ApplicationMenusContext, event: MouseEvent): void {
  context.menu(event, [
    {
      label: context.editor?.manuscriptMode === 'screenplay' ? 'Prose format' : 'Screenplay format',
      run: () => {
        context.editor?.setManuscriptMode(
          context.editor.manuscriptMode === 'screenplay' ? 'prose' : 'screenplay',
        );
      },
    },
    { label: 'Bold', run: () => context.format('bold') },
    { label: 'Italic', run: () => context.format('italic') },
    { label: 'Poetry', run: () => context.togglePoetry() },
    ...(['left', 'center', 'right', 'justify'] as const).map((value) => ({
      label: value[0].toUpperCase() + value.slice(1),
      run: () => context.alignParagraph(value),
    })),
    { label: 'Margin note…', run: () => context.newSticky() },
    { label: 'Save Darling', run: () => context.archive() },
    {
      label: context.value.spellOn ? 'Spellcheck off' : 'Spellcheck on',
      run: () => context.toggleSpelling(),
    },
    ...[
      'en-US',
      'en-GB',
      'en-AU',
      'en-CA',
      'fr',
      'de',
      'es',
      'el',
      'nl',
      'pl',
      'pt',
      'ro',
      'ru',
    ].map((language) => ({
      label: 'Language: ' + language,
      run: () => context.preference('spellLanguage', language),
    })),
    { label: 'Vim mode', run: () => context.preference('vimKeys', !context.value.library.vimKeys) },
    { label: 'Word goal…', run: () => context.bookGoal() },
    { label: 'Daily goal…', run: () => context.dailyGoal() },
    { label: 'Start sprint…', run: () => context.startSprint() },
    { label: 'End sprint', run: () => context.endSprint() },
  ]);
}

export function fileMenu(context: ApplicationMenusContext, event: MouseEvent): void {
  context.menu(event, [
    { label: 'Import', run: () => context.importBooks() },
    { label: 'Reshelve a Book…', run: () => context.reshelveBook() },
  ]);
}

export function viewMenu(context: ApplicationMenusContext, event: MouseEvent): void {
  context.menu(event, [
    { label: 'Reshelve a Book…', run: () => context.reshelveBook() },
    ...(['pantser', 'plotter'] as const).map((style) => ({
      label: style === 'pantser' ? 'Pantser' : 'Plotter',
      checked: context.value.library.writingStyle === style,
      run: () => context.preference('writingStyle', style),
    })),
    ...['paper', 'night', 'light'].map((theme) => ({
      label: 'Theme: ' + theme,
      run: () => context.preference('pageTheme', theme),
    })),
    {
      label: 'Typewriter scrolling',
      run: () => context.preference('typewriter', !context.value.library.typewriter),
    },
    {
      label: 'Focus mode',
      run: () => context.preference('focusMode', !context.value.library.focusMode),
    },
    {
      label: 'Hide drop cap',
      run: () =>
        context.preference('fonts', {
          ...context.value.library.fonts,
          dropcap: context.value.library.fonts.dropcap === 'none' ? 'literary' : 'none',
        }),
    },
    {
      label: 'Body font…',
      run: async () => {
        await context.openFontPicker();
      },
    },
    { label: 'Find and replace', run: () => context.openSearch() },
    { label: 'Cover Art…', run: () => context.openCoverSettings() },
    { label: 'Email a draft…', run: () => context.emailDraft() },
    { label: 'Email settings…', run: () => context.openEmailSettings() },
    { label: 'Library folder…', run: () => context.libraryFolder() },
    { label: 'Help', run: () => context.showInformation('help') },
    { label: 'Keyboard shortcuts', run: () => context.showInformation('shortcuts') },
    { label: 'About Leafloom', run: () => context.showInformation('about') },
  ]);
}
