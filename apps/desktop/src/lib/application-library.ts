import type { CoverProvider } from '@leafloom/cover-contracts';
import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { Metadata, type JSONValue } from '@leafloom/document-contracts';
import { OpenReply, type EditorPort, type SurfacePort } from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import { Library, PageKinds, completeFirstRun, type LibraryValue } from '@leafloom/library';
import { z } from 'zod';
import type { AppState, ApplicationPlatform, EditorFactory } from './application';
import { CoverGoalsViewModel } from './cover-goals';
import { PageLabels, romanPart } from './library-shelf';
import { LibraryViewModel, collectionExportChoices } from './library-view-model';
import { applyPresentation } from './presentation';
import { PublicationPageViewModel, type TitleField } from './publication-page';
import { keepReadingPlace } from './reading-place';


export interface ApplicationLibraryContext {
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
  value: AppState;
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
  libraryGeneration: number;
  pendingLibraryWrites: number;
  patch: (patch: Partial<AppState>) => void;
  applyPlatformDropcap: () => void;
  bodyFontStyle: (font: string) => string;
  libraryWrites: Promise<void>;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  updateLibrary: (value: LibraryValue, history?: boolean) => Promise<void>;
  libraryViewModel: LibraryViewModel;
  moveShelf: (id: string, index: number) => Promise<void>;
  factory: EditorFactory;
  coverGoalsViewModel: CoverGoalsViewModel;
  exportShelf: (
    id: string,
    format?: 'html' | 'txt' | 'md' | 'docx' | 'epub' | 'pdf' | undefined,
    publicationTitle?: string | undefined,
  ) => Promise<void>;
  platform: ApplicationPlatform | undefined;
  updateCoverMetadata: (
    id: string,
    patch: Record<string, JSONValue>,
    history?: boolean,
  ) => Promise<void>;
  prepareCovers: () => Promise<void>;
  editor: EditorPort | null;
  coverProvider: CoverProvider | undefined;
  openBook: (id: string) => Promise<void>;
  rendered: () => Promise<void>;
  surfaces: SurfacePort<HTMLElement> | null;
  closeBook: (save?: boolean) => Promise<void>;
  publicationPageViewModel: PublicationPageViewModel;
}

export async function updateLibrary(
  context: ApplicationLibraryContext,
  value: LibraryValue,
  history = false,
): Promise<void> {
  const next = Library.parse(structuredClone(value));
  if (history) {
    context.libraryUndo.push(context.value.library);
    context.libraryRedo = [];
  }
  context.libraryGeneration++;
  context.pendingLibraryWrites++;
  context.patch({ library: next });
  keepReadingPlace(() => {
    applyPresentation(next);
    context.applyPlatformDropcap();
    document.documentElement.style.setProperty(
      '--body-font',
      context.bodyFontStyle(next.fonts.body),
    );
  });
  const write = context.libraryWrites
    .catch(() => {})
    .then(async () => {
      await context.request('writeLibrary', {
        library: z.record(z.string(), z.json()).parse(next),
      });
    });
  context.libraryWrites = write.catch(() => {});
  try {
    await write;
  } finally {
    context.pendingLibraryWrites--;
  }
}

export async function onboard(
  context: ApplicationLibraryContext,
  name: string,
  style: 'pantser' | 'plotter',
  pen = '',
  fonts = { body: 'Georgia', dropcap: 'literary' },
): Promise<void> {
  const library = completeFirstRun(context.value.library, name.trim() || pen.trim());
  library.penNames = pen ? [pen] : [];
  library.writingStyle = style;
  library.fonts = fonts;
  await context.updateLibrary(library, false);
}

export function newShelf(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['newShelf']>
): Promise<void> {
  return context.libraryViewModel.newShelf(...args);
}

export function renameShelf(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['renameShelf']>
): Promise<void> {
  return context.libraryViewModel.renameShelf(...args);
}

export function deleteShelf(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['deleteShelf']>
): Promise<void> {
  return context.libraryViewModel.deleteShelf(...args);
}

export async function dropShelf(
  context: ApplicationLibraryContext,
  id: string,
  targetId: string,
  after: boolean,
): Promise<void> {
  const shelves = context.value.library.shelves;
  const from = shelves.findIndex((shelf) => shelf.id === id);
  const target = shelves.findIndex((shelf) => shelf.id === targetId);
  if (
    from < 0 ||
    target < 0 ||
    from === target ||
    shelves[from].authorId !== shelves[target].authorId
  )
    return;
  const insertion = target + (after ? 1 : 0);
  const destination = insertion - (from < insertion ? 1 : 0);
  if (destination !== from) await context.moveShelf(id, destination);
}

export function moveShelf(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['moveShelf']>
): Promise<void> {
  return context.libraryViewModel.moveShelf(...args);
}

export function bindShelf(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['bindShelf']>
): Promise<void> {
  return context.libraryViewModel.bindShelf(...args);
}

export async function createPage(
  context: ApplicationLibraryContext,
  shelf: LibraryValue['shelves'][number],
  kind: string,
): Promise<{ [x: string]: z.core.util.JSONType; id: string; title: string; author: string }> {
  const defaults = z
    .record(z.string(), z.string())
    .catch({})
    .parse(context.value.library.tabDefaults);
  const author =
    context.value.library.authors.find((a) => a.id === shelf.authorId)?.name ?? 'Anonymous';
  const names: Record<string, string> = {
    cover: shelf.name,
    copyright: 'Copyright',
    dedication: 'Dedication',
    epigraph: 'Epigraph',
    prologue: 'Prologue',
    part: 'Part',
    epilogue: 'Epilogue',
    acknowledgments: 'Acknowledgments',
    about: 'About the Author',
  };
  let metadata = Metadata.parse(
    await context.request('createBook', {
      title:
        kind === 'cover'
          ? shelf.name
          : kind === 'prologue' || kind === 'epilogue'
            ? names[kind]
            : names[kind] + ' — ' + shelf.name,
      author,
      kind,
    }),
  );
  metadata = Metadata.parse(
    await context.request('writeBookMeta', {
      bookId: metadata.id,
      metadata: {
        ...metadata,
        shelfId: shelf.id,
        ...(kind === 'cover' ? { coverSeed: 'bound:' + shelf.id } : {}),
        ...(kind === 'prologue' || kind === 'epilogue'
          ? {
              subtitle: shelf.name,
              tabNames: {
                notes: defaults.notes ?? 'Notes',
                outline: defaults.outline ?? 'Outline',
              },
            }
          : {}),
      },
    }),
  );
  if (kind !== 'cover') {
    const opened = OpenReply.parse(await context.request('openBook', { bookId: metadata.id }));
    const { editor, surfaces } = context.factory(
      opened,
      { undo: () => {}, redo: () => {}, save: () => {}, format: () => {}, archive: () => {} },
      () => {},
    );
    try {
      if (!opened.lease) throw Error('READ_ONLY');
      const chapterId = editor.createChapter('');
      if (kind !== 'prologue' && kind !== 'epilogue') editor.setChapterKind(chapterId, kind);
      if (kind === 'copyright') {
        editor.select(chapterId, 1);
        editor.insert(
          translate(context.value.language, 'Copyright © {year} {name}', {
            year: String(new Date().getFullYear()),
            name: author,
          }),
        );
        editor.enter();
        editor.insert(translate(context.value.language, 'All rights reserved.'));
      }
      await context.request('checkpoint', {
        bookId: metadata.id,
        lease: opened.lease,
        checkpoint: editor.checkpoint(),
        expected: opened.versions,
      });
      metadata = editor.metadata;
    } finally {
      surfaces.destroy();
      await context.request('closeBook', { bookId: metadata.id, lease: opened.lease });
    }
  }
  context.patch({ books: [...context.value.books, metadata] });
  return metadata;
}

export function addBoundPage(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['addBoundPage']>
): Promise<void> {
  return context.libraryViewModel.addBoundPage(...args);
}

export function newAuthor(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['newAuthor']>
): Promise<void> {
  return context.libraryViewModel.newAuthor(...args);
}

export function chooseAuthor(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['chooseAuthor']>
): Promise<void> {
  return context.libraryViewModel.chooseAuthor(...args);
}

export function renameAuthor(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['renameAuthor']>
): Promise<void> {
  return context.libraryViewModel.renameAuthor(...args);
}

export function deleteAuthor(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['deleteAuthor']>
): Promise<void> {
  return context.libraryViewModel.deleteAuthor(...args);
}

export function newBook(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['newBook']>
): Promise<void> {
  return context.libraryViewModel.newBook(...args);
}

export function moveBook(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['moveBook']>
): Promise<void> {
  return context.libraryViewModel.moveBook(...args);
}

export function moveToAuthor(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['moveToAuthor']>
): Promise<void> {
  return context.libraryViewModel.moveToAuthor(...args);
}

export function undoAuthorMove(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['undoAuthorMove']>
): Promise<void> {
  return context.libraryViewModel.undoAuthorMove(...args);
}

export function deleteBook(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['deleteBook']>
): Promise<void> {
  return context.libraryViewModel.deleteBook(...args);
}

export async function setCoverGoal(context: ApplicationLibraryContext, id: string): Promise<void> {
  await context.coverGoalsViewModel.set(id);
}

export async function exportBoundBook(
  context: ApplicationLibraryContext,
  shelfId: string,
): Promise<void> {
  const shelf = context.value.library.shelves.find((candidate) => candidate.id === shelfId);
  if (!shelf) return;
  const selection = await new Promise<string | null>((resolve) => {
    context.patch({
      modal: {
        title: translate(context.value.language, 'Export “{title}”', { title: shelf.name }),
        value: '',
        label: '',
        confirm: '',
        input: false,
        choices: collectionExportChoices.map((choice) => ({ ...choice })),
        resolve,
      },
    });
  });
  const format = collectionExportChoices.find((choice) => choice.value === selection)?.value;
  if (format) await context.exportShelf(shelfId, format);
}

export function exportShelfAnthology(
  context: ApplicationLibraryContext,
  id: string,
): Promise<void> {
  return context.libraryViewModel.exportShelfAnthology(id);
}

export async function setCover(context: ApplicationLibraryContext, id: string): Promise<void> {
  const source = await context.platform?.selectCoverImage?.();
  if (!source) return;
  await context.request('setCover', { bookId: id, source });
  await context.updateCoverMetadata(id, { coverImage: 'cover.json', coverMode: 'image' });
  await context.prepareCovers();
}

export function exportShelf(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['exportShelf']>
): Promise<void> {
  return context.libraryViewModel.exportShelf(...args);
}

export function shelfNumbering(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['shelfNumbering']>
): Promise<void> {
  return context.libraryViewModel.shelfNumbering(...args);
}

export function regenerateCover(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['regenerateCover']>
): Promise<void> {
  return context.libraryViewModel.regenerateCover(...args);
}

export function removeCover(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['removeCover']>
): Promise<void> {
  return context.libraryViewModel.removeCover(...args);
}

export function renameBook(
  context: ApplicationLibraryContext,
  ...args: Parameters<LibraryViewModel['renameBook']>
): Promise<void> {
  return context.libraryViewModel.renameBook(...args);
}

export async function generatedCover(
  context: ApplicationLibraryContext,
  id: string,
): Promise<string | undefined> {
  const book =
    context.value.book?.id === id
      ? (context.editor?.metadata ?? context.value.book)
      : context.value.books.find((row) => row.id === id);
  if (!book || !context.coverProvider?.renderFull) return undefined;
  return context.coverProvider.renderFull({
    id,
    title: book.title,
    author: book.author,
    ...(typeof book.coverSeed === 'string' ? { coverSeed: book.coverSeed } : {}),
  });
}

export async function openPublicationPage(
  context: ApplicationLibraryContext,
  id: string,
  label?: string,
  shelfId?: string,
): Promise<void> {
  const book = context.value.books.find((row) => row.id === id);
  if (!book || !PageKinds.includes(book.kind as (typeof PageKinds)[number]))
    throw Error('INVALID_PAGE_KIND');
  if (book.kind === 'prologue' || book.kind === 'epilogue') {
    await context.openBook(id);
    if (!book.lastPosition && context.editor) {
      const first = context.editor.passageRows(context.editor.chapters[0]?.id)[0];
      if (first) context.editor.selectPassage(first.id, 0, 0);
      await context.rendered();
      context.surfaces?.focus({ preventScroll: true });
      context.surfaces?.revealSelection({ block: 'start', passageId: first?.id });
    }
    return;
  }
  if (context.value.book) await context.closeBook();
  const shelf = context.value.library.shelves.find(
    (row) => row.id === shelfId || row.bookIds.includes(id),
  );
  const kind = book.kind as (typeof PageKinds)[number];
  const part =
    shelf?.bookIds
      .slice(0, shelf.bookIds.indexOf(id) + 1)
      .filter((bookId) => context.value.books.find((row) => row.id === bookId)?.kind === 'part')
      .length ?? 1;
  await context.publicationPageViewModel.open({
    bookId: id,
    kind,
    label:
      label ??
      (kind === 'part'
        ? translate(context.value.language, 'Part {n}', { n: romanPart(part) })
        : translate(context.value.language, PageLabels[kind])),
    shelfId: shelf?.id,
    shelfName: shelf?.name,
    authorName:
      context.value.library.authors.find((row) => row.id === shelf?.authorId)?.name ??
      context.value.library.authorName,
  });
}

export async function reopenPublicationPage(context: ApplicationLibraryContext): Promise<void> {
  const id = context.value.publicationPage?.bookId;
  if (!id) return;
  const opened = OpenReply.parse(await context.request('openBook', { bookId: id }));
  try {
    context.publicationPageViewModel.rebind(opened);
  } catch (error) {
    await context.request('closeBook', { bookId: id, lease: opened.lease }).catch(() => {});
    throw error;
  }
}

export function bindPublicationPage(
  context: ApplicationLibraryContext,
  body: HTMLElement,
  auxiliary: HTMLElement,
): void {
  context.publicationPageViewModel.bind(body, auxiliary);
}

export function editPublicationTitle(
  context: ApplicationLibraryContext,
  field: TitleField,
  text: string,
): void {
  context.publicationPageViewModel.edit(field, text);
}

export function pastePublicationTitle(
  context: ApplicationLibraryContext,
  field: TitleField,
  text: string,
  from: number,
  to: number,
): void {
  context.publicationPageViewModel.pasteTitle(field, text, from, to);
}

export async function enterPublicationTitle(
  context: ApplicationLibraryContext,
  field: TitleField,
): Promise<void> {
  await context.publicationPageViewModel.enter(field);
}

export async function closePublicationPage(context: ApplicationLibraryContext): Promise<void> {
  await context.publicationPageViewModel.close();
}

export function publicationUndo(context: ApplicationLibraryContext): void {
  context.publicationPageViewModel.undo();
}

export function publicationRedo(context: ApplicationLibraryContext): void {
  context.publicationPageViewModel.redo();
}

export async function removeFromShelf(
  context: ApplicationLibraryContext,
  id: string,
): Promise<void> {
  await context.libraryViewModel.removeFromShelf(id);
}

export async function reshelveBook(context: ApplicationLibraryContext): Promise<void> {
  await context.libraryViewModel.reshelveBook();
}
