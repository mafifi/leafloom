import { cardBoardShowing, stepCardWheel } from './outline-card-zoom';
import { cardZooms } from './outline-board-presentation';
import { interfaceBrightness } from './interface-brightness';
import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { type EditorPort, type SurfacePort } from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import { Library, type LibraryValue } from '@leafloom/library';
import { z } from 'zod';
import type { AppState } from './application';
import { brighterInterface } from './presentation';
import { keepReadingPlace } from './reading-place';
import { SpellingViewModel } from './spelling-view-model';


export interface ApplicationPreferencesContext {
  spellLanguageGeneration: number;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  value: AppState;
  updateLibrary: (value: LibraryValue, history?: boolean) => Promise<void>;
  editor: EditorPort | null;
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
  surfaces: SurfacePort<HTMLElement> | null;
  scheduleSpell: () => void;
  synchronizeMenu: () => Promise<void>;
  patch: (patch: Partial<AppState>) => void;
  spellActiveSection: string | null;
  background: (command: () => void | Promise<void>) => Promise<void>;
  spellingViewModel: SpellingViewModel;
  dismissMenu: () => void;
  setPageZoom: (next: number, point?: { x: number; y: number }) => void;
  libraryGeneration: number;
  scheduleAppearanceSave: () => void;
  appearanceTimer: NodeJS.Timeout | null;
  flushAppearance: () => Promise<void>;
  appearanceWaiters: { resolve(): void; reject(error: unknown): void }[];
  scheduleMenu: () => void;
}

export async function preference(
  context: ApplicationPreferencesContext,
  key: string,
  value: unknown,
): Promise<void> {
  if (key === 'spellLanguage') {
    const generation = ++context.spellLanguageGeneration;
    const selected = z.string().min(1).parse(value);
    try {
      z.record(z.string(), z.boolean()).parse(
        await context.request('spellcheck', { words: [], language: selected || 'en' }),
      );
    } catch (error) {
      if (generation === context.spellLanguageGeneration)
        throw Error(translate(context.value.language, 'That dictionary would not load'), {
          cause: error,
        });
      return;
    }
    if (generation !== context.spellLanguageGeneration) return;
  }
  const next = Library.parse({ ...context.value.library, [key]: value });
  const saving = context.updateLibrary(next, false);
  context.editor?.configureTypography({
    interfaceLanguage: context.value.language.locale,
    language: context.writingLanguage(next),
    markdown: !next.markdownOff,
  });
  context.surfaces?.setVim(Boolean(next.vimKeys ?? next.vimMode));
  context.surfaces?.configurePresentation({
    typewriter: Boolean(next.typewriter),
    focus: next.focusMode === 'sentence' ? 'sentence' : next.focusMode ? 'paragraph' : 'off',
    language: context.value.language.locale,
  });
  if (context.value.spellOn) context.scheduleSpell();
  await saving;
  await context.synchronizeMenu();
}

export function toggleSpelling(context: ApplicationPreferencesContext): void {
  context.patch({ spellOn: !context.value.spellOn });
  if (context.value.spellOn) {
    context.spellActiveSection = context.editor?.activeSection?.id ?? null;
    void context.background(() => context.spellingViewModel.activate());
  } else {
    context.spellingViewModel.clear();
    context.spellActiveSection = null;
    context.dismissMenu();
  }
}

export function activateSpellingSection(context: ApplicationPreferencesContext): void {
  const id = context.editor?.activeSection?.id ?? null;
  if (!context.value.spellOn || id === context.spellActiveSection) return;
  context.spellActiveSection = id;
  void context.background(() => context.spellingViewModel.activate());
}

export function scheduleSpell(context: ApplicationPreferencesContext): void {
  context.spellingViewModel.schedule();
}

export async function scanSpelling(context: ApplicationPreferencesContext): Promise<void> {
  await context.spellingViewModel.scan();
}

export function zoom(context: ApplicationPreferencesContext, delta: number): void {
  if (cardBoardShowing(context.value)) {
    const now=Math.max(.55,Math.min(1.5,Number(context.value.library.cardZoom)||1));
    const next=delta===0?1:delta>0?cardZooms.find(z=>z>now+.001)??now:[...cardZooms].reverse().find(z=>z<now-.001)??now;
    if(next!==now)void context.background(()=>preference(context,'cardZoom',next));
    return;
  }
  context.setPageZoom(delta === 0 ? 1 : context.value.zoom + delta);
}

export function setPageZoom(
  context: ApplicationPreferencesContext,
  next: number,
  point?: { x: number; y: number },
): void {
  if (!Number.isFinite(next)) return;
  const zoom = Math.max(0.75, Math.min(3, next));
  if (zoom === context.value.zoom) return;
  context.libraryGeneration++;
  context.patch({ zoom, library: { ...context.value.library, pageZoom: zoom } });
  keepReadingPlace(
    () => document.documentElement.style.setProperty('--page-zoom', String(zoom)),
    point,
  );
  context.scheduleAppearanceSave();
}

export function scheduleAppearanceSave(context: ApplicationPreferencesContext): void {
  if (context.appearanceTimer) clearTimeout(context.appearanceTimer);
  context.appearanceTimer = setTimeout(
    () => void context.background(() => context.flushAppearance()),
    600,
  );
}

export async function flushAppearance(context: ApplicationPreferencesContext): Promise<void> {
  if (!context.appearanceTimer) return;
  clearTimeout(context.appearanceTimer);
  context.appearanceTimer = null;
  const waiters = context.appearanceWaiters.splice(0);
  try {
    await context.updateLibrary(context.value.library, false);
    for (const waiter of waiters) waiter.resolve();
  } catch (error) {
    for (const waiter of waiters) waiter.reject(error);
    throw error;
  }
}

export function pageZoomWheel(context: ApplicationPreferencesContext, event: WheelEvent): void {
  if (event.ctrlKey) {
    event.preventDefault();
    if (cardBoardShowing(context.value)) { stepCardWheel(context, event.deltaY, direction => zoom(context, direction)); return; }
    context.setPageZoom(context.value.zoom * Math.exp(-event.deltaY * 0.005), {
      x: event.clientX,
      y: event.clientY,
    });
  } else if (
    event.target instanceof Element &&
    !event.target.closest('#paper-scroll,#nav-pane,#side-pane')
  ) {
    const scroll = document.querySelector<HTMLElement>('#paper-scroll');
    if (scroll) scroll.scrollTop += event.deltaY;
  }
}

export function zoomControlWheel(context: ApplicationPreferencesContext, event: WheelEvent): void {
  event.preventDefault();
  event.stopPropagation();
  if (cardBoardShowing(context.value)) { stepCardWheel(context, event.deltaY, direction => zoom(context, direction)); return; }
  context.setPageZoom(context.value.zoom * Math.exp(-event.deltaY * 0.002));
}

export function systemContrastChanged(context: ApplicationPreferencesContext): void {
  document.body.classList.toggle('bright', interfaceBrightness(context.value.library, context.value.view, context.value.panel, brighterInterface(undefined)));
  context.scheduleMenu();
}
