import { screenplayOutputFormats } from './document-output';
import { FilesDroppedSchema, type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { Metadata, type MetadataValue, type JSONValue } from '@leafloom/document-contracts';
import type { LibraryValue } from '@leafloom/library';
import { type EditorPort } from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import type { AppState, ApplicationPlatform, MenuItem } from './application';
import { DocumentOutputViewModel, outputFormats, type OutputFormat } from './document-output';

export interface ApplicationOutputContext {
  platform: ApplicationPlatform | undefined;
  value: AppState;
  writable: () => boolean;
  hasPendingScriptContact: () => boolean;
  updateLibrary: (library: LibraryValue, history?: boolean) => Promise<void>;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  updateCoverMetadata: (
    id: string,
    patch: Record<string, JSONValue>,
    history?: boolean,
  ) => Promise<void>;
  prepareCovers: () => Promise<void>;
  patch: (patch: Partial<AppState>) => void;
  moveBook: (id: string, shelfId: string, index?: number | undefined) => Promise<void>;
  documentOutputViewModel: DocumentOutputViewModel;
  editor: EditorPort | null;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  exportBook: (format: OutputFormat) => Promise<void>;
  closeBook: (save?: boolean) => Promise<void>;
}

/** Imported title contact becomes shared library text without replacing an author draft. */
async function adoptImportedContact(context: ApplicationOutputContext, metadata: MetadataValue) {
  if (context.value.library.scriptContact || context.hasPendingScriptContact()) return;
  const title = metadata.screenplayTitle;
  if (!title || typeof title !== 'object' || Array.isArray(title) || typeof title.contact !== 'string' || !title.contact) return;
  // Shelf placement also writes the library. Adopt into live state first, so
  // that write cannot erase the contact just saved by the import provider.
  await context.updateLibrary({ ...context.value.library, scriptContact: title.contact }, false);
}

export async function showBookFolder(context: ApplicationOutputContext, id: string): Promise<void> {
  await context.platform?.showBookFolder?.(id);
}

export async function filesDropped(context: ApplicationOutputContext, raw: unknown): Promise<void> {
  const { paths, position, target } = FilesDroppedSchema.parse(raw);
  // A DOM target identifies intent, not authority. Keep the author's identity
  // and target fixed while host replies are pending, then validate live membership.
  const authorId = context.value.library.currentAuthorId;
  const targetShelf = () => {
    if (context.value.library.currentAuthorId !== authorId) return undefined;
    return context.value.library.shelves.find(
      (shelf) =>
        shelf.authorId === authorId &&
        (target?.kind === 'shelf'
          ? shelf.id === target.shelfId
          : target?.kind === 'book'
            ? shelf.bookIds.includes(target.bookId) &&
              context.value.books.some((book) => book.id === target.bookId)
            : true),
    );
  };
  const originalOpenBook = context.value.book?.id;
  let imported = 0;
  let failed = 0;
  for (const source of paths) {
    try {
      const shelf = targetShelf();
      if (!shelf) throw Error('DROP_TARGET_UNAVAILABLE');
      if (/\.(?:png|jpe?g|webp)$/i.test(source)) {
        const bookId =
          target?.kind === 'book'
            ? target.bookId
            : !position && !target && context.value.book?.id === originalOpenBook
              ? originalOpenBook
              : undefined;
        if (!bookId || !shelf.bookIds.includes(bookId)) throw Error('DROP_TARGET_UNAVAILABLE');
        if (context.value.book?.id === bookId && !context.writable()) throw Error('READ_ONLY');
        await context.request('setCover', { bookId, source });
        await context.updateCoverMetadata(bookId, {
          coverImage: 'cover.json',
          coverMode: 'image',
        });
        await context.prepareCovers();
        continue;
      }
      const metadata = Metadata.parse(
        await context.request(
          /\.(?:docx|txt|md|fountain|fdx)$/i.test(source) ? 'importManuscript' : 'importLegacy',
          { source },
        ),
      );
      context.patch({ books: [...context.value.books, metadata] });
      // Never move the imported book into a different author or destination
      // if the library changed while the import was being decoded.
      if (targetShelf()?.id !== shelf.id) throw Error('DROP_TARGET_UNAVAILABLE');
      await adoptImportedContact(context, metadata);
      if (targetShelf()?.id !== shelf.id) throw Error('DROP_TARGET_UNAVAILABLE');
      await context.moveBook(metadata.id, shelf.id);
      imported++;
    } catch {
      failed++;
    }
  }
  await context.prepareCovers();
  context.patch({
    hint:
      imported || failed
        ? `Imported ${imported} book${imported === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}`
        : 'Imported dropped files',
  });
}

export async function importBooks(context: ApplicationOutputContext): Promise<void> {
  const paths = (await context.platform?.selectImportFiles()) ?? [];
  let imported = 0;
  let failed = 0;
  for (const source of paths) {
    try {
      const metadata = Metadata.parse(await context.request('importManuscript', { source }));
      context.patch({ books: [...context.value.books, metadata] });
      const shelf = context.value.library.shelves.find(
        (s) => s.authorId === context.value.library.currentAuthorId,
      );
      await adoptImportedContact(context, metadata);
      if (shelf) await context.moveBook(metadata.id, shelf.id);
      imported++;
    } catch {
      failed++;
    }
  }
  if (imported) await context.prepareCovers();
  if (paths.length)
    context.patch({
      hint: `Imported ${imported} book${imported === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}`,
    });
}

export async function exportBook(
  context: ApplicationOutputContext,
  format: OutputFormat,
): Promise<void> {
  await context.documentOutputViewModel.export(format);
}

export async function exportChapter(context: ApplicationOutputContext, id: string): Promise<void> {
  const chapter = context.editor?.chapters.find((row) => row.id === id);
  if (!chapter) return;
  const format = await new Promise<string | null>((resolve) => {
    context.patch({
      modal: {
        title: translate(context.value.language, 'Export “{title}”', {
          title: chapter.title || chapter.label,
        }),
        value: '',
        label: '',
        confirm: '',
        input: false,
        choices: (context.editor?.manuscriptMode === 'screenplay'
          ? [...outputFormats, ...screenplayOutputFormats]
          : [...outputFormats]
        ).map((format) => ({
          value: format,
          label: {
            txt: 'Text (.txt)',
            md: 'Markdown (.md)',
            html: 'HTML (.html)',
            pdf: 'PDF (.pdf)',
            docx: 'Word (.docx)',
            epub: 'EPUB (.epub)',
            fountain: 'Fountain (.fountain)',
            fdx: 'Final Draft (.fdx)',
          }[format],
        })),
        resolve,
      },
    });
  });
  if (format && [...outputFormats, ...screenplayOutputFormats].includes(format as OutputFormat))
    await context.documentOutputViewModel.export(format as OutputFormat, id);
}

export async function printChapter(context: ApplicationOutputContext, id: string): Promise<void> {
  await context.documentOutputViewModel.print(id);
}

export function exportMenu(context: ApplicationOutputContext, event: MouseEvent): void {
  context.menu(
    event,
    (context.editor?.manuscriptMode === 'screenplay'
      ? [...outputFormats, ...screenplayOutputFormats]
      : [...outputFormats]
    ).map((format) => ({
      label: 'Export ' + format.toUpperCase(),
      run: () => context.exportBook(format as OutputFormat),
    })),
  );
}

export async function finishClose(context: ApplicationOutputContext): Promise<void> {
  await context.closeBook();
  await context.platform?.finishClose();
}
