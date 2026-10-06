import { executeNativeFieldFormat } from './field-history';
import type { MetadataField } from '@leafloom/editor-contracts';
import { type EditorPort, type SurfacePort } from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import { type LibraryValue } from '@leafloom/library';
import type { AppState } from './application';
import { LibraryViewModel } from './library-view-model';
import { SearchViewModel } from './search-view-model';


export interface ApplicationAuthorCommandsContext {
  writable: () => boolean;
  editor: EditorPort | null;
  value: AppState;
  focusChapter: (id: string) => void;
  createChapter: (index?: number, kind?: string) => void;
  copyrightOptions: (
    kind: string,
  ) => { copyrightStarter: { notice: string; rights: string } } | undefined;
  setPanel: (panel: string) => void;
  project: () => void;
  rendered: () => Promise<void>;
  surfaces: SurfacePort<HTMLElement> | null;
  prompt: (
    title: string,
    value?: string,
    label?: string,
    confirm?: string,
  ) => Promise<string | null>;
  renameChapter: (id: string, title: string) => void;
  flushStickyEdits: () => void;
  libraryViewModel: LibraryViewModel;
  execute: (
    command: () => void | Promise<void>,
    options?: { closeMenu?: boolean },
  ) => Promise<void>;
  undoAuthorMove: () => Promise<void>;
  libraryUndo: {
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
  }[];
  libraryRedo: {
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
  }[];
  updateLibrary: (value: LibraryValue, history?: boolean) => Promise<void>;
  patch: (patch: Partial<AppState>) => void;
  archive: () => void;
  searchViewModel: SearchViewModel;
}

export function setMetadata(
  context: ApplicationAuthorCommandsContext,
  patch: { title?: string; subtitle?: string; author?: string },
): void {
  if (!context.writable()) return;
  context.editor?.setMetadata(patch);
}

export function editMetadataField(
  context: ApplicationAuthorCommandsContext,
  field: MetadataField,
  value: string,
): void {
  if (!context.writable()) return;
  const text = value.trim();
  context.editor?.editMetadataField(
    field,
    field === 'title' ? text || translate(context.value.language, 'Untitled') : text,
  );
}

export function finishMetadataField(
  context: ApplicationAuthorCommandsContext,
  field: MetadataField,
): void {
  context.editor?.finishMetadataField(field);
}

export function enterTitlePage(context: ApplicationAuthorCommandsContext): void {
  context.editor?.finishMetadataField();
  const first = context.editor?.chapters.find((chapter) =>
    ['chapter', 'unnumbered', 'prologue', 'epilogue'].includes(chapter.kind),
  );
  if (first) context.focusChapter(first.id);
  else context.createChapter();
}

export function createChapter(
  context: ApplicationAuthorCommandsContext,
  index?: number,
  kind?: string,
): void {
  if (!context.writable()) return;
  const editor = context.editor,
    id = editor?.createChapter(
      '',
      index,
      kind ? { kind, ...context.copyrightOptions(kind) } : undefined,
    );
  if (id && editor) {
    if (context.value.panel !== 'manuscript') context.setPanel('manuscript');
    editor.select(id, 1);
    context.project();
    void context.rendered().then(() => {
      if (context.editor === editor && editor.activeSection?.id === id) context.surfaces?.focus();
    });
  }
}

export function renameChapter(
  context: ApplicationAuthorCommandsContext,
  id: string,
  title: string,
): void {
  if (!context.writable()) return;
  context.editor?.renameChapter(id, title);
}

export async function renameChapterPrompt(
  context: ApplicationAuthorCommandsContext,
  id: string,
): Promise<void> {
  const chapter = context.value.chapters.find((c) => c.id === id);
  const title = await context.prompt('Rename chapter', chapter?.title);
  if (title !== null) context.renameChapter(id, title);
}

export function duplicateChapter(context: ApplicationAuthorCommandsContext, id: string): void {
  if (!context.writable()) return;
  context.editor?.duplicateChapter(id);
}

export function deleteChapter(context: ApplicationAuthorCommandsContext, id: string): void {
  if (!context.writable()) return;
  context.editor?.deleteChapter(id);
}

export function reorderChapter(
  context: ApplicationAuthorCommandsContext,
  id: string,
  index: number,
): void {
  if (!context.writable()) return;
  context.editor?.reorderChapter(id, index);
}

export function setChapterKind(
  context: ApplicationAuthorCommandsContext,
  id: string,
  kind: string,
): void {
  if (!context.writable()) return;
  context.editor?.setChapterKind(id, kind, context.copyrightOptions(kind));
}

export function copyrightOptions(
  context: ApplicationAuthorCommandsContext,
  kind: string,
): { copyrightStarter: { notice: string; rights: string } } | undefined {
  return kind === 'copyright'
    ? {
        copyrightStarter: {
          notice: translate(context.value.language, 'Copyright © {year} {name}', {
            year: String(new Date().getFullYear()),
            name:
              context.editor?.author ||
              context.value.library.authorName ||
              translate(context.value.language, 'Anonymous'),
          }),
          rights: translate(context.value.language, 'All rights reserved.'),
        },
      }
    : undefined;
}

export function focusChapter(context: ApplicationAuthorCommandsContext, id: string): void {
  if (context.value.panel !== 'manuscript') context.setPanel('manuscript');
  const last = context.editor?.passageRows(id).at(-1);
  if (last) context.editor?.selectPassage(last.id, last.size);
  context.surfaces?.focus({ preventScroll: true });
  void context.rendered().then(() => {
    document.querySelector<HTMLElement>(`.chapter[data-chid="${CSS.escape(id)}"]`)?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  });
}

export function undo(context: ApplicationAuthorCommandsContext): void {
  if (!context.writable()) return;
  context.flushStickyEdits();
  if (context.editor) {
    context.editor.undo();
    context.surfaces?.focus();
  } else if (context.libraryViewModel.canUndoMove)
    void context.execute(() => context.undoAuthorMove());
  else {
    const previous = context.libraryUndo.pop();
    if (previous) {
      context.libraryRedo.push(context.value.library);
      void context.execute(() => context.updateLibrary(previous, false));
    }
  }
}

export function redo(context: ApplicationAuthorCommandsContext): void {
  if (!context.writable()) return;
  context.flushStickyEdits();
  if (context.editor) {
    context.editor.redo();
    context.surfaces?.focus();
  } else {
    const next = context.libraryRedo.pop();
    if (next) {
      context.libraryUndo.push(context.value.library);
      void context.execute(() => context.updateLibrary(next, false));
    }
  }
}

export function alignParagraph(
  context: ApplicationAuthorCommandsContext,
  value: 'left' | 'center' | 'right' | 'justify',
): void {
  if (!context.writable()) return;
  if (executeNativeFieldFormat(value === 'justify' ? 'justifyFull' : 'justify' + value[0].toUpperCase() + value.slice(1))) return;
  context.editor?.alignParagraph(value);
  context.surfaces?.focus();
}

export function format(context: ApplicationAuthorCommandsContext, mark: 'bold' | 'italic' | 'underline' | 'strike'): void {
  if (!context.writable()) return;
  if (executeNativeFieldFormat(mark === 'strike' ? 'strikeThrough' : mark)) return;
  context.editor?.format(mark);
  context.surfaces?.focus();
}

export function archive(context: ApplicationAuthorCommandsContext): void {
  if (!context.writable()) return;
  if (!context.editor) return;
  if (!context.editor.copySelection().text.trim()) {
    context.patch({ hint: 'Select the passage first' });
    return;
  }
  context.editor.archive();
  context.patch({
    hint: translate(
      context.value.language,
      'Saved to Darlings — kill without remorse ({key} to undo)',
      { key: '⌘Z' },
    ),
  });
}

export function archiveDropped(context: ApplicationAuthorCommandsContext): void {
  if (!context.writable()) return;
  if (context.surfaces?.archiveDraggedSelection())
    context.patch({ hint: 'Saved to Darlings — kill without remorse (⌘Z to undo)' });
  else context.archive();
}

export function restore(context: ApplicationAuthorCommandsContext, id: string): void {
  if (!context.writable()) return;
  const restored = context.editor?.restore(id);
  if (!restored) return;
  context.patch({
    panel: 'manuscript',
    hint: restored.notice ?? 'Darling restored to its original spot',
  });
  context.project();
  void context.rendered().then(() => {
    context.surfaces?.focus();
    context.surfaces?.revealSelection({ block: 'center', passageId: restored.restoredPassageId });
  });
}

export async function removeDarling(
  context: ApplicationAuthorCommandsContext,
  id: string,
): Promise<void> {
  if (!context.writable()) return;
  context.editor?.removeDarling(id);
}

export function openSearch(
  context: ApplicationAuthorCommandsContext,
  ...args: Parameters<SearchViewModel['openSearch']>
): void {
  return context.searchViewModel.openSearch(...args);
}

export function searchKey(
  context: ApplicationAuthorCommandsContext,
  ...args: Parameters<SearchViewModel['searchKey']>
): void {
  return context.searchViewModel.searchKey(...args);
}

export function closeSearch(
  context: ApplicationAuthorCommandsContext,
  ...args: Parameters<SearchViewModel['closeSearch']>
): void {
  return context.searchViewModel.closeSearch(...args);
}

export function search(
  context: ApplicationAuthorCommandsContext,
  ...args: Parameters<SearchViewModel['search']>
): void {
  return context.searchViewModel.input(...args);
}

export function nextMatch(
  context: ApplicationAuthorCommandsContext,
  ...args: Parameters<SearchViewModel['nextMatch']>
): void {
  return context.searchViewModel.nextMatch(...args);
}

export function focusMatch(context: ApplicationAuthorCommandsContext, id: string): void {
  document
    .querySelector<HTMLElement>(`.chapter[data-chid="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ block: 'center' });
  context.surfaces?.focus();
}

export function replace(
  context: ApplicationAuthorCommandsContext,
  ...args: Parameters<SearchViewModel['replace']>
): void {
  return context.searchViewModel.replace(...args);
}
