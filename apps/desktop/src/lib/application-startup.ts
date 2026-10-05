import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { Metadata } from '@leafloom/document-contracts';
import { LanguageCatalog, defaultSpellLanguage } from '@leafloom/language-contracts';
import { Library, createLibrary } from '@leafloom/library';
import { z } from 'zod';
import type { AppState, ApplicationPlatform } from './application';
import { CoverArtViewModel } from './cover-art';
import { HostRecoveryViewModel } from './host-recovery';
import { applyPresentation, bodyFonts } from './presentation';
import { keepReadingPlace } from './reading-place';


export interface ApplicationStartupContext {
  libraryWrites: Promise<void>;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  patch: (patch: Partial<AppState>) => void;
  platform: ApplicationPlatform | undefined;
  value: AppState;
  applyPlatformDropcap: () => void;
  previewBodyFont: (font: string) => void;
  synchronizeMenu: () => Promise<void>;
  fullscreenChanged: (raw: unknown) => void;
  background: (command: () => void | Promise<void>) => Promise<void>;
  prepareCovers: () => Promise<void>;
  hostRecoveryViewModel: HostRecoveryViewModel;
  coverArtViewModel: CoverArtViewModel;
  fail: (error: unknown) => void;
  bodyFontStyle: (font: string) => string;
  externalReconciliation: Promise<void> | null;
  tryRemotePosition: () => boolean;
  save: () => Promise<void>;
  pendingLibraryWrites: number;
  appearanceTimer: NodeJS.Timeout | null;
  flushAppearance: () => Promise<void>;
  refreshLibraryFromDisk: () => Promise<void>;
  refreshingLibrary: boolean;
  libraryGeneration: number;
  rendered: () => Promise<void>;
}

export async function initialize(context: ApplicationStartupContext): Promise<void> {
  try {
    await context.libraryWrites;
    const [raw, books, language] = await Promise.all([
      context.request('readLibrary', {}),
      context.request('listBooks', {}),
      context.request('getLanguage', {}),
    ]);
    const library = raw === null ? createLibrary() : Library.parse(raw);
    context.patch({
      library,
      language: LanguageCatalog.parse(language),
      books: z.array(Metadata).parse(books),
      loading: false,
      zoom: Number(library.pageZoom) || 1,
      navPinned: context.platform?.panePreferences?.read().nav ?? context.value.navPinned,
      sidePinned: context.platform?.panePreferences?.read().side ?? context.value.sidePinned,
    });
    applyPresentation(library);
    context.applyPlatformDropcap();
    context.previewBodyFont(library.fonts.body);
    await context.synchronizeMenu();
    if (context.platform?.os)
      context.fullscreenChanged(await context.platform.os.request('getWindowState', {}));
    void context.background(() => context.prepareCovers());
    if (context.platform?.os && !context.hostRecoveryViewModel.blocked)
      void context.background(async () => {
        for (const book of context.value.books) {
          await context.coverArtViewModel.recover(book);
        }
      });
  } catch (error) {
    context.fail(error);
    context.patch({ loading: false });
  }
}

export function writingLanguage(
  context: ApplicationStartupContext,
  preferences = context.value.library,
): string {
  return typeof preferences.spellLanguage === 'string' && preferences.spellLanguage
    ? preferences.spellLanguage
    : context.value.language.locale;
}

export function effectiveSpellLanguage(context: ApplicationStartupContext): string {
  return typeof context.value.library.spellLanguage === 'string' &&
    context.value.library.spellLanguage
    ? context.value.library.spellLanguage
    : defaultSpellLanguage(context.value.language.locale);
}

export function bodyFontStyle(context: ApplicationStartupContext, font: string): string {
  return (
    context.value.onboardingFonts.bodyStacks[font] ??
    (Object.hasOwn(bodyFonts, font)
      ? bodyFonts[font]
      : `"${font.replace(/["\\]/g, '')}", Georgia, serif`)
  );
}

export function applyPlatformDropcap(context: ApplicationStartupContext): void {
  document.documentElement.style.setProperty(
    '--dropcap-font',
    context.value.onboardingFonts.dropcaps[context.value.library.fonts.dropcap] ??
      context.value.onboardingFonts.dropcaps.literary,
  );
}

export function previewBodyFont(context: ApplicationStartupContext, font: string): void {
  keepReadingPlace(() =>
    document.documentElement.style.setProperty('--body-font', context.bodyFontStyle(font)),
  );
}

export function overlayOpen(context: ApplicationStartupContext): boolean {
  return Boolean(
    context.value.modal ||
    context.value.goals ||
    context.value.librarySettings ||
    context.value.information ||
    context.value.coverArt ||
    context.value.fontPicker ||
    context.value.emailSettings ||
    context.value.publicationPage,
  );
}

export async function refreshLibraryFromDisk(context: ApplicationStartupContext): Promise<void> {
  if (context.value.view === 'editor') {
    if (!context.externalReconciliation && context.tryRemotePosition()) await context.save();
    return;
  }
  if (
    context.value.view === 'library' &&
    (context.pendingLibraryWrites || context.appearanceTimer)
  ) {
    await context.flushAppearance();
    await context.libraryWrites;
    // Keep the focus intent after a durable write whose host reply is still pending.
    // The subsequent fresh read retains the normal generation/view guards.
    return context.refreshLibraryFromDisk();
  }
  if (
    context.refreshingLibrary ||
    context.value.view !== 'library' ||
    context.value.loading ||
    context.pendingLibraryWrites ||
    context.appearanceTimer
  )
    return;
  context.refreshingLibrary = true;
  const generation = context.libraryGeneration;
  try {
    const raw = await context.request('readLibrary', {});
    if (
      generation !== context.libraryGeneration ||
      context.pendingLibraryWrites ||
      context.value.view !== 'library'
    )
      return;
    if (raw === null) return;
    const library = Library.parse(raw);
    if (!library.firstRunDone || JSON.stringify(library) === JSON.stringify(context.value.library))
      return;
    const shelf = document.getElementById('bookshelf-view');
    const scroll = shelf?.scrollTop;
    context.patch({ library });
    applyPresentation(library);
    context.applyPlatformDropcap();
    await context.rendered();
    if (shelf && scroll !== undefined) shelf.scrollTop = scroll;
    await context.synchronizeMenu();
    void context.background(() => context.prepareCovers());
  } finally {
    context.refreshingLibrary = false;
  }
}
