import type { CoverPresentationValue, CoverProvider } from '@leafloom/cover-contracts';
import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { Metadata, type JSONValue } from '@leafloom/document-contracts';
import { type EditorPort } from '@leafloom/editor-contracts';
import { z } from 'zod';
import type { AppState, ApplicationPlatform, BookMetadata } from './application';
import { CoverArtViewModel, type CoverArtDraft, type CoverChoice } from './cover-art';
import { EmailDraftViewModel, type EmailMethod } from './email-draft';
import { FontPickerViewModel } from './font-picker';
import { HostRecoveryViewModel } from './host-recovery';
import { PublicationPageViewModel } from './publication-page';


export interface ApplicationCoversContext {
  hostRecoveryViewModel: HostRecoveryViewModel;
  publicationPageViewModel: PublicationPageViewModel;
  save: () => Promise<void>;
  overlayOpen: () => boolean;
  emailDraftViewModel: EmailDraftViewModel;
  platform: ApplicationPlatform | undefined;
  patch: (patch: Partial<AppState>) => void;
  coverArtViewModel: CoverArtViewModel;
  regenerateCover: (id: string) => Promise<void>;
  fontPickerViewModel: FontPickerViewModel;
  value: AppState;
  editor: EditorPort | null;
  writable: () => boolean;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  coverProvider: CoverProvider | undefined;
  coverGeneration: number;
}

export function hostFailed(context: ApplicationCoversContext, value: unknown): void {
  context.hostRecoveryViewModel.failed(value);
  context.publicationPageViewModel.hostFailed();
}

export async function recoverHost(context: ApplicationCoversContext): Promise<void> {
  await context.hostRecoveryViewModel.recover();
  // Freshly reopened cores may update bookkeeping while automatic saves are suspended.
  // Flush only after recovery has rebound the session and released its old-lease guard.
  await context.save();
}

export async function emailDraft(context: ApplicationCoversContext): Promise<void> {
  if (!context.overlayOpen()) await context.emailDraftViewModel.draft();
}

export async function openEmailSettings(context: ApplicationCoversContext): Promise<void> {
  if (!context.overlayOpen()) await context.emailDraftViewModel.settings();
}

export function chooseEmailMethod(
  context: ApplicationCoversContext,
  method: EmailMethod,
): Promise<void> {
  return context.emailDraftViewModel.choose(method);
}

export function closeEmailSettings(context: ApplicationCoversContext): void {
  context.emailDraftViewModel.cancel();
}

export async function openCoverSettings(context: ApplicationCoversContext): Promise<void> {
  if (context.overlayOpen()) return;
  if (!context.platform?.os) {
    context.patch({ hint: 'Cover art is available in the desktop app' });
    return;
  }
  await context.coverArtViewModel.openSettings();
}

export function editCoverSettings(
  context: ApplicationCoversContext,
  field: keyof CoverArtDraft,
  value: string | boolean,
): void {
  context.coverArtViewModel.edit(field, value);
}

export function saveCoverSettings(context: ApplicationCoversContext): Promise<void> {
  return context.coverArtViewModel.saveSettings();
}

export function closeCoverArt(context: ApplicationCoversContext): void {
  context.coverArtViewModel.cancel();
}

export async function openCoverChoices(
  context: ApplicationCoversContext,
  id: string,
): Promise<void> {
  if (context.overlayOpen()) return;
  if (!context.platform?.os) {
    await context.regenerateCover(id);
    return;
  }
  await context.coverArtViewModel.openChoices(id);
}

export function chooseCover(
  context: ApplicationCoversContext,
  id: string,
  choice: CoverChoice,
): Promise<void> {
  return context.coverArtViewModel.choose(id, choice);
}

export function coverArtProgress(context: ApplicationCoversContext, value: unknown): Promise<void> {
  return context.coverArtViewModel.progress(value);
}

export async function openFontPicker(context: ApplicationCoversContext): Promise<void> {
  if (!context.overlayOpen()) await context.fontPickerViewModel.open();
}

export function searchFonts(context: ApplicationCoversContext, query: string): void {
  context.fontPickerViewModel.search(query);
}

export function previewFont(context: ApplicationCoversContext, font: string): void {
  context.fontPickerViewModel.hover(font);
}

export function leaveFontList(context: ApplicationCoversContext): void {
  context.fontPickerViewModel.leave();
}

export function chooseFont(context: ApplicationCoversContext, font: string): Promise<void> {
  return context.fontPickerViewModel.choose(font);
}

export function fontPickerEnter(context: ApplicationCoversContext): Promise<void> {
  return context.fontPickerViewModel.enter();
}

export function closeFontPicker(context: ApplicationCoversContext): void {
  context.fontPickerViewModel.cancel();
}

export async function updateCoverMetadata(
  context: ApplicationCoversContext,
  id: string,
  patch: Record<string, JSONValue>,
  history = true,
): Promise<void> {
  let metadata: BookMetadata;
  if (context.value.book?.id === id && context.editor) {
    if (!context.writable()) throw Error('READ_ONLY');
    if (history) context.editor.updateMetadata(patch);
    else
      context.editor.setCoverBookkeeping(
        z
          .object({ coverArt: z.json().optional(), coverMode: z.literal('painted').optional() })
          .strict()
          .parse(patch),
      );
    metadata = context.editor.metadata;
    await context.save();
  } else {
    const fresh = Metadata.parse(await context.request('readBookMeta', { bookId: id }));
    metadata = Metadata.parse(
      await context.request('writeBookMeta', {
        bookId: id,
        metadata: Metadata.parse({ ...fresh, ...patch }),
      }),
    );
  }
  context.patch({ books: context.value.books.map((book) => (book.id === id ? metadata : book)) });
}

export async function prepareCovers(context: ApplicationCoversContext): Promise<void> {
  if (!context.coverProvider) return;
  const generation = ++context.coverGeneration;
  const covers: Record<string, CoverPresentationValue> = {};
  const visible = new Set(
    context.value.library.shelves
      .filter((shelf) => shelf.authorId === context.value.library.currentAuthorId)
      .flatMap((shelf) => shelf.bookIds),
  );
  for (const book of context.value.books.filter((book) => visible.has(book.id))) {
    const image =
      book.coverMode === 'abstract'
        ? null
        : await context.request('readCover', {
            bookId: book.id,
            ...(book.coverMode === 'painted'
              ? { mode: 'painted' }
              : book.coverMode === 'image'
                ? { mode: 'image' }
                : {}),
          });
    covers[book.id] = await context.coverProvider.render(
      {
        id: book.id,
        title: book.title,
        author: book.author,
        ...(typeof book.coverSeed === 'string' ? { coverSeed: book.coverSeed } : {}),
      },
      typeof image === 'string' ? image : undefined,
    );
    if (generation !== context.coverGeneration) return;
  }
  context.patch({ covers });
}

export function writable(context: ApplicationCoversContext): boolean {
  if (context.editor && context.value.readOnly) {
    context.patch({ hint: 'Read-only: this book is already open' });
    return false;
  }
  return true;
}
