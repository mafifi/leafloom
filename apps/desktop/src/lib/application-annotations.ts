import { type EditorPort, type SurfacePort } from '@leafloom/editor-contracts';
import type { AppState } from './application';
import { SearchViewModel } from './search-view-model';


export interface ApplicationAnnotationsContext {
  writable: () => boolean;
  editor: EditorPort | null;
  surfaces: SurfacePort<HTMLElement> | null;
  value: AppState;
  patch: (patch: Partial<AppState>) => void;
  rendered: () => Promise<void>;
  pendingStickies: Map<string, string>;
  stickyTimer: NodeJS.Timeout | null;
  flushStickyEdits: () => void;
  background: (command: () => void | Promise<void>) => Promise<void>;
  save: () => Promise<void>;
  removeSticky: (id: string) => void;
  setPanel: (panel: string) => void;
  tabPlaces: Map<string, { scroll: number; caret: unknown }>;
  project: () => void;
  searchViewModel: SearchViewModel;
}

export function togglePoetry(context: ApplicationAnnotationsContext): void {
  if (!context.writable()) return;
  context.editor?.togglePoetry();
  context.surfaces?.focus();
}

export function openingPoetry(context: ApplicationAnnotationsContext, id: string): void {
  if (!context.writable()) return;
  context.editor?.insertOpeningPoetry(id);
  context.surfaces?.focus();
}

export async function newSticky(context: ApplicationAnnotationsContext): Promise<void> {
  if (!context.writable() || !context.editor) return;
  const anchor = window.getSelection()?.anchorNode;
  const element =
    anchor?.nodeType === Node.TEXT_NODE
      ? anchor.parentElement
      : anchor instanceof Element
        ? anchor
        : null;
  if (context.value.panel !== 'manuscript' || !element?.closest('.chapter-body')) {
    context.patch({ hint: 'Click into a chapter first, then ⌘⇧X drops a placeholder' });
    return;
  }
  const id = context.editor.createSticky('');
  context.patch({ sideOpen: true });
  await context.rendered();
  document
    .querySelector<HTMLTextAreaElement>(`.sticky[data-sticky-id="${CSS.escape(id)}"] textarea`)
    ?.focus();
}

export function updateSticky(
  context: ApplicationAnnotationsContext,
  id: string,
  text: string,
): void {
  if (!context.writable() || !context.editor?.stickies.some((sticky) => sticky.id === id)) return;
  context.pendingStickies.set(id, text);
  context.patch({
    dirty: true,
    stickies: context.value.stickies.map((sticky) =>
      sticky.id === id ? { ...sticky, text } : sticky,
    ),
  });
  if (context.stickyTimer) clearTimeout(context.stickyTimer);
  context.stickyTimer = setTimeout(() => {
    context.flushStickyEdits();
    void context.background(() => context.save());
  }, 600);
}

export function flushStickyEdits(context: ApplicationAnnotationsContext): void {
  if (context.stickyTimer) {
    clearTimeout(context.stickyTimer);
    context.stickyTimer = null;
  }
  for (const [id, text] of context.pendingStickies) {
    context.pendingStickies.delete(id);
    if (context.editor?.stickies.some((sticky) => sticky.id === id))
      context.editor.updateSticky(id, { text });
  }
}

export function resolveSticky(
  context: ApplicationAnnotationsContext,
  id: string,
  resolved: boolean,
): void {
  if (resolved) context.removeSticky(id);
}

export function removeSticky(context: ApplicationAnnotationsContext, id: string): void {
  if (!context.writable()) return;
  context.pendingStickies.delete(id);
  context.editor?.removeSticky(id);
}

export async function selectSticky(
  context: ApplicationAnnotationsContext,
  id: string,
): Promise<void> {
  context.flushStickyEdits();
  if (context.value.panel !== 'manuscript') {
    context.setPanel('manuscript');
    await context.rendered();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }
  if (!context.editor?.selectSticky(id, true)) return;
  context.surfaces?.focus({ preventScroll: true });
  const mark = document.querySelector<HTMLElement>(`.ph-mark[data-sid="${CSS.escape(id)}"]`),
    scroll = document.querySelector<HTMLElement>('#paper-scroll');
  if (mark && scroll) {
    const rect = mark.getBoundingClientRect(),
      box = scroll.getBoundingClientRect();
    if (rect.top < box.top + 40 || rect.bottom > box.bottom - 40)
      mark.scrollIntoView({ block: 'center' });
  }
  if (!context.value.sidePinned) context.patch({ sideOpen: false });
}

export function setPanel(context: ApplicationAnnotationsContext, panel: string): void {
  const scroll = document.querySelector<HTMLElement>('#paper-scroll');
  if (panel !== context.value.panel)
    context.tabPlaces.set(context.value.panel, {
      scroll: scroll?.scrollTop ?? 0,
      caret: context.editor?.selection,
    });
  if (
    panel === 'outline' &&
    context.writable() &&
    !context.editor?.outlineRows.some((row) => row.kind === 'chapter')
  )
    context.editor?.createChapter('');
  context.patch({ panel });
  context.project();
  const back = context.tabPlaces.get(panel);
  void context.rendered().then(async () => {
    if (
      (panel === 'manuscript' || panel === 'notes') &&
      back?.caret &&
      context.editor?.restoreSelection(back.caret)
    )
      context.surfaces?.focus({ preventScroll: Boolean(back) });
    else if (panel === 'notes') context.surfaces?.focus({ preventScroll: Boolean(back) });
    if (back && scroll) {
      await context.rendered();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (context.value.panel === panel) scroll.scrollTop = back.scroll;
    }
    if (context.value.searchOpen) context.searchViewModel.search(context.value.search);
  });
}
