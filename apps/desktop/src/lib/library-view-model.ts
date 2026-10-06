import { z } from 'zod';
import { translate } from '@leafloom/language-contracts';
import { Metadata } from '@leafloom/document-contracts';
import {
  Library,
  type LibraryValue,
  type ShelfValue,
  createShelf,
  renameShelf,
  deleteShelf,
  moveShelf,
  bindShelf,
  unbindShelf,
  boundBodyRange,
  PageKinds,
  addAuthor,
  selectAuthor,
  renameAuthor,
  deleteAuthor,
  moveBook,
} from '@leafloom/library';
import { DeletionReply, type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import type { AppState, BookMetadata, ApplicationPlatform } from './application';
export const collectionExportChoices = [
  {
    label: 'EPUB',
    description: 'For ebook stores — the TOC lists every story.',
    value: 'epub',
    localize: true,
  },
  {
    label: 'Word (.docx)',
    description: 'For editors — each story starts on a new page.',
    value: 'docx',
    localize: true,
  },
  { label: 'PDF', description: 'For reading, sharing, and print.', value: 'pdf', localize: true },
] as const;
export interface LibraryContext {
  snapshot(): AppState;
  patch(value: Partial<AppState>): void;
  request<M extends HostMethod>(method: M, payload: HostPayload<M>): Promise<unknown>;
  writeLibrary(value: LibraryValue, history?: boolean): Promise<void>;
  prompt(title: string, value?: string, label?: string, confirm?: string): Promise<string | null>;
  rendered(): Promise<void>;
  confirm(title: string, message: string, label?: string): Promise<boolean>;
  choose?(
    title: string,
    choices: { label: string; value: string; description?: string; localize?: boolean }[],
  ): Promise<string | null>;
  openBook(id: string): Promise<void>;
  openPage?(id: string): Promise<void>;
  generatedCover?(bookId: string): Promise<string | undefined>;
  createPage(shelf: ShelfValue, kind: string): Promise<BookMetadata>;
  prepareCovers(): Promise<void>;
  platform?: ApplicationPlatform;
}
export class LibraryViewModel {
  private lastAuthorMove: { library: LibraryValue; book: BookMetadata; at: number } | null = null;
  private authorMovePending: Promise<void> | null = null;
  constructor(private context: LibraryContext) {}
  private get value() {
    return this.context.snapshot();
  }
  get canUndoMove() {
    return Boolean(this.lastAuthorMove && Date.now() - this.lastAuthorMove.at <= 15000);
  }
  async newShelf() {
    const next = createShelf(this.value.library, 'New Shelf');
    await this.context.writeLibrary(next);
    const id = next.shelves.at(-1)!.id;
    await this.context.rendered();
    const element = document.querySelector<HTMLElement>(
      `.shelf[data-shelf-id="${CSS.escape(id)}"] .shelf-label`,
    );
    element?.scrollIntoView({ block: 'center' });
    element?.focus();
    if (element) {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }
  async renameShelf(id: string, entered?: string) {
    const shelf = this.value.library.shelves.find((s) => s.id === id);
    const name = entered ?? (await this.context.prompt('Rename shelf', shelf?.name));
    if (name !== null && name.trim()) {
      await this.context.writeLibrary(renameShelf(this.value.library, id, name));
      if (shelf?.binding?.bound || shelf?.bound) {
        const cover = this.value.books.find(
          (book) => shelf.bookIds.includes(book.id) && book.kind === 'cover',
        );
        if (cover) {
          const metadata = Metadata.parse(
            await this.context.request('writeBookMeta', {
              bookId: cover.id,
              metadata: { ...cover, title: name.trim() },
            }),
          );
          this.context.patch({
            books: this.value.books.map((book) => (book.id === cover.id ? metadata : book)),
          });
          await this.context.prepareCovers();
        }
      }
    }
  }
  async deleteShelf(id: string) {
    const next = structuredClone(this.value.library),
      shelf = next.shelves.find((s) => s.id === id);
    if (shelf?.binding?.bound || shelf?.bound)
      shelf.bookIds = shelf.bookIds.filter(
        (bookId) =>
          !PageKinds.some(
            (kind) => kind === this.value.books.find((book) => book.id === bookId)?.kind,
          ),
      );
    await this.context.writeLibrary(deleteShelf(next, id));
  }
  async moveShelf(id: string, index: number) {
    await this.context.writeLibrary(moveShelf(this.value.library, id, index));
  }
  private bookKinds() {
    return Object.fromEntries(
      this.value.books.map((book) => [book.id, String(book.kind ?? 'novel')]),
    );
  }
  async bindShelf(id: string, bound: boolean) {
    const next = bound
      ? bindShelf(this.value.library, id)
      : unbindShelf(this.value.library, id, this.bookKinds());
    const shelf = next.shelves.find((s) => s.id === id)!;
    if (
      bound &&
      !shelf.bookIds.some(
        (bookId) => this.value.books.find((book) => book.id === bookId)?.kind === 'cover',
      )
    ) {
      const cover = await this.context.createPage(shelf, 'cover');
      shelf.bookIds.unshift(cover.id);
    }
    await this.context.writeLibrary(next);
    await this.context.prepareCovers();
  }
  async addBoundPage(shelfId: string, kind: string, beforeId?: string) {
    const next = structuredClone(this.value.library),
      shelf = next.shelves.find((s) => s.id === shelfId);
    if (!shelf || !shelf.binding?.bound || !PageKinds.some((page) => page === kind)) return;
    if (kind === 'part' && beforeId) {
      const index = shelf.bookIds.indexOf(beforeId),
        kinds = this.bookKinds();
      if (
        index < 0 ||
        PageKinds.some((page) => page === kinds[beforeId]) ||
        kinds[shelf.bookIds[index - 1]] === 'part'
      )
        return;
    }
    const page = await this.context.createPage(shelf, kind);
    const ranks = ['cover', 'copyright', 'dedication', 'epigraph', 'prologue'],
      tails = ['epilogue', 'acknowledgments', 'about'];
    let index = shelf.bookIds.length;
    if (ranks.includes(kind))
      index = shelf.bookIds.findIndex(
        (id) =>
          !ranks.includes(this.bookKinds()[id]) ||
          ranks.indexOf(this.bookKinds()[id]) > ranks.indexOf(kind),
      );
    else if (tails.includes(kind)) {
      index = shelf.bookIds.findIndex(
        (id) =>
          tails.includes(this.bookKinds()[id]) &&
          tails.indexOf(this.bookKinds()[id]) > tails.indexOf(kind),
      );
    } else
      index = beforeId
        ? shelf.bookIds.indexOf(beforeId)
        : boundBodyRange(shelf, this.bookKinds()).end;
    shelf.bookIds.splice(index < 0 ? shelf.bookIds.length : index, 0, page.id);
    await this.context.writeLibrary(next);
    if (this.context.openPage) await this.context.openPage(page.id);
    else await this.context.openBook(page.id);
  }
  async newAuthor() {
    const name = await this.context.prompt('New author', '', 'Pen name', 'Create');
    if (name !== null) await this.context.writeLibrary(addAuthor(this.value.library, name));
  }
  async chooseAuthor(id: string) {
    await this.context.writeLibrary(selectAuthor(this.value.library, id));
  }
  async renameAuthor(id: string) {
    const name = await this.context.prompt(
      'Rename author',
      this.value.library.authors.find((a) => a.id === id)?.name,
    );
    if (name !== null) await this.context.writeLibrary(renameAuthor(this.value.library, id, name));
  }
  async deleteAuthor(id: string) {
    await this.context.writeLibrary(deleteAuthor(this.value.library, id));
  }
  newBook(shelfId: string, kind = 'novel', title = 'Untitled') {
    return this.createBook(shelfId, kind, title);
  }
  newScript(shelfId: string) {
    const shelf = this.value.library.shelves.find(row => row.id === shelfId);
    if (!shelf || shelf.binding?.bound || shelf.bound) return Promise.resolve();
    return this.createBook(shelfId, 'novel', 'Untitled', true);
  }
  private async createBook(shelfId: string, kind: string, title: string, script = false) {
    const author =
      this.value.library.authors.find((a) => a.id === this.value.library.currentAuthorId)?.name ??
      'Anonymous';
    const metadata = Metadata.parse(
      await this.context.request('createBook', { title, author, kind, ...(script ? { format: 'screenplay', credit: translate(this.value.language, 'Written by') } : {}) }),
    );
    const defaults = z
      .record(z.string(), z.string())
      .catch({})
      .parse(this.value.library.tabDefaults);
    if (Object.keys(defaults).length || script)
      Object.assign(
        metadata,
        Metadata.parse(
          await this.context.request('writeBookMeta', {
            bookId: metadata.id,
            metadata: {
              ...metadata,
              tabNames: {
                notes: defaults.notes ?? 'Notes',
                outline: script ? 'Outline' : defaults.outline ?? 'Outline',
              },
            },
          }),
        ),
      );
    this.context.patch({ books: [...this.value.books, metadata] });
    await this.context.writeLibrary(
      moveBook(
        this.value.library,
        metadata.id,
        shelfId,
        boundBodyRange(
          this.value.library.shelves.find((s) => s.id === shelfId)!,
          this.bookKinds(),
        ).end,
      ),
    );
    await this.context.openBook(metadata.id);
  }
  async moveBook(id: string, shelfId: string, index?: number) {
    const shelf = this.value.library.shelves.find((row) => row.id === shelfId);
    if (!shelf) throw Error('NOT_FOUND');
    const withoutDragged = structuredClone(this.value.library);
    const target = withoutDragged.shelves.find((row) => row.id === shelfId)!;
    target.bookIds = target.bookIds.filter((bookId) => bookId !== id);
    let insertion = index ?? target.bookIds.length;
    if (!Number.isInteger(insertion) || insertion < 0 || insertion > target.bookIds.length)
      throw Error('INVALID_TARGET');
    if (shelf.binding?.bound || shelf.bound) {
      if (PageKinds.includes(this.bookKinds()[id] as (typeof PageKinds)[number])) return;
      const range = boundBodyRange(target, this.bookKinds());
      insertion = Math.min(Math.max(insertion, range.start), range.end);
    }
    await this.context.writeLibrary(moveBook(this.value.library, id, shelfId, insertion));
  }
  moveToAuthor(id: string, authorId: string): Promise<void> {
    const run = (this.authorMovePending ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.moveToAuthorNow(id, authorId));
    this.authorMovePending = run;
    void run
      .finally(() => {
        if (this.authorMovePending === run) this.authorMovePending = null;
      })
      .catch(() => {});
    return run;
  }
  private async moveToAuthorNow(id: string, authorId: string) {
    const author = this.value.library.authors.find((a) => a.id === authorId),
      shelf = this.value.library.shelves.find((s) => s.authorId === authorId),
      book = this.value.books.find((b) => b.id === id);
    if (!author || !shelf || !book) return;
    const previous = {
      library: structuredClone(this.value.library),
      book: structuredClone(book),
      at: Date.now(),
    };
    this.lastAuthorMove = previous;
    const next = moveBook(
      this.value.library,
      id,
      shelf.id,
      boundBodyRange(shelf, this.bookKinds(), id).start,
    );
    const metadata = Metadata.parse(
      await this.context.request('writeBookMeta', {
        bookId: id,
        metadata: { ...book, author: author.name },
      }),
    );
    try {
      await this.context.writeLibrary(next, false);
    } catch (error) {
      // A transport failure can arrive after the shelf replacement reached disk.
      // Compensate only when a fresh read confirms that the move did not commit.
      let committed: boolean;
      let durable: LibraryValue;
      try {
        durable = Library.parse(await this.context.request('readLibrary', {}));
        committed = durable.shelves.some((row) => row.id === shelf.id && row.bookIds.includes(id));
      } catch {
        throw error;
      }
      if (!committed) {
        this.lastAuthorMove = null;
        await this.context.request('writeBookMeta', { bookId: id, metadata: book });
        if (JSON.stringify(this.value.library) === JSON.stringify(next))
          this.context.patch({ library: durable });
        throw error;
      }
    }
    this.lastAuthorMove = previous;
    this.context.patch({
      books: this.value.books.map((book) => (book.id === id ? metadata : book)),
      hint: `“${book.title}” now sits on ${author.name}’s top shelf — Esc puts it back`,
    });
    await this.context.prepareCovers();
  }
  async undoAuthorMove() {
    if (this.authorMovePending) await this.authorMovePending;
    const move = this.lastAuthorMove;
    if (!move || Date.now() - move.at > 15000) return;
    const current = this.value.books.find((book) => book.id === move.book.id) ?? move.book;
    const metadata = Metadata.parse(
      await this.context.request('writeBookMeta', {
        bookId: move.book.id,
        metadata: { ...current, author: move.book.author },
      }),
    );
    const oldShelf = move.library.shelves.find((s) => s.bookIds.includes(move.book.id));
    const home =
      this.value.library.shelves.find((s) => s.id === oldShelf?.id) ??
      this.value.library.shelves.find((s) => s.authorId === oldShelf?.authorId) ??
      this.value.library.shelves[0];
    if (home)
      await this.context.writeLibrary(
        moveBook(
          this.value.library,
          move.book.id,
          home.id,
          Math.min(oldShelf?.bookIds.indexOf(move.book.id) ?? 0, home.bookIds.length),
        ),
        false,
      );
    this.lastAuthorMove = null;
    this.context.patch({
      books: this.value.books.map((book) => (book.id === metadata.id ? metadata : book)),
      hint: `“${metadata.title}” is back where it was`,
    });
    await this.context.prepareCovers();
  }
  async removeFromShelf(id: string) {
    const book = this.value.books.find((row) => row.id === id);
    if (!book) return;
    const next = structuredClone(this.value.library);
    for (const shelf of next.shelves)
      shelf.bookIds = shelf.bookIds.filter((bookId) => bookId !== id);
    await this.context.writeLibrary(next);
    this.context.patch({
      hint: `“${book.title}” removed from the shelves — its files are still in your Leafloom Library`,
    });
  }
  async reshelveBook() {
    const books = z.array(Metadata).parse(await this.context.request('listBooks', {}));
    const shelved = new Set(
      this.value.library.shelves.flatMap((shelf) => [
        ...shelf.bookIds,
        ...(shelf.binding?.parked ?? []).map((page) => page.id),
      ]),
    );
    const loose = books
      .filter(
        (book) =>
          !shelved.has(book.id) && !PageKinds.includes(book.kind as (typeof PageKinds)[number]),
      )
      .sort((a, b) => String(b.modified ?? '').localeCompare(String(a.modified ?? '')));
    if (!loose.length) {
      this.context.patch({ hint: 'Every book in your library is already on a shelf' });
      return;
    }
    if (!this.context.choose) throw Error('UI_UNAVAILABLE');
    const id = await this.context.choose(
      'Books in your library that aren’t on a shelf',
      loose.map((book) => ({ label: book.title, value: book.id })),
    );
    if (!id) return;
    const book = loose.find((row) => row.id === id);
    if (!book) throw Error('INVALID_TARGET');
    const shelf =
      this.value.library.shelves.find(
        (row) => row.authorId === this.value.library.currentAuthorId,
      ) ?? this.value.library.shelves[0];
    if (!shelf) throw Error('NOT_FOUND');
    this.context.patch({ books });
    await this.moveBook(id, shelf.id);
    await this.context.prepareCovers();
    this.context.patch({ hint: `“${book.title}” is back on the shelf` });
  }
  async deleteBook(id: string) {
    const book = this.value.books.find((book) => book.id === id);
    if (!book) return;
    if (
      !(await this.context.confirm(
        'Move book to Trash',
        `Move “${book.title}” to ${this.context.platform?.os ? 'your system Trash' : 'your Leafloom Library’s Trash folder'}?`,
        'Move to Trash',
      ))
    )
      return;
    const receipt = DeletionReply.parse(await this.context.request('deleteBook', { bookId: id }));
    const next = structuredClone(this.value.library);
    for (const shelf of next.shelves) shelf.bookIds = shelf.bookIds.filter((book) => book !== id);
    await this.context.writeLibrary(next);
    this.context.patch({
      books: this.value.books.filter((book) => book.id !== id),
      hint:
        receipt.location === 'system-trash'
          ? 'Moved to your system Trash'
          : 'Moved to your Leafloom Library’s Trash folder',
    });
  }
  async setCover(id: string) {
    const source = await this.context.platform?.selectCoverImage?.();
    if (!source) return;
    await this.context.request('setCover', { bookId: id, source });
    await this.context.prepareCovers();
  }
  async exportShelfAnthology(id: string) {
    const shelf = this.value.library.shelves.find((candidate) => candidate.id === id);
    if (!shelf) return;
    if (!shelf.bookIds.length) {
      this.context.patch({ hint: 'This shelf has no books on it yet' });
      return;
    }
    const title = await this.context.prompt(
      'Anthology title',
      shelf.name,
      'Shown on the title page, cover, and metadata',
    );
    if (title === null) return;
    const selection = await this.context.choose?.(
      'Export the anthology as…',
      collectionExportChoices.map((choice) => ({ ...choice })),
    );
    const format = collectionExportChoices.find((choice) => choice.value === selection)?.value;
    if (format) await this.exportShelf(id, format, title.trim() || shelf.name);
  }
  async exportShelf(
    id: string,
    format: 'txt' | 'md' | 'html' | 'docx' | 'epub' | 'pdf' = 'docx',
    publicationTitle?: string,
  ) {
    const shelf = this.value.library.shelves.find((s) => s.id === id);
    if (!shelf) return;
    const title = publicationTitle ?? shelf.name;
    const destination = await this.context.platform?.selectExportFile(title + '.' + format);
    if (!destination) return;
    const bookIds = [...shelf.bookIds],
      coverId = bookIds.find(
        (bookId) => this.value.books.find((book) => book.id === bookId)?.kind === 'cover',
      );
    const generatedCover =
      coverId && ['html', 'pdf', 'epub'].includes(format)
        ? await this.context.generatedCover?.(coverId)
        : undefined;
    const current = this.value.library.shelves.find((candidate) => candidate.id === id);
    if (
      !current ||
      current.name !== shelf.name ||
      JSON.stringify(current.bookIds) !== JSON.stringify(bookIds)
    )
      throw new Error('BOOK_CHANGED');
    const bound = Boolean(current.binding?.bound || current.bound);
    let uuid: string | undefined;
    if (bound) {
      if (typeof current.binding?.uuid === 'string') uuid = z.uuid().parse(current.binding.uuid);
      else {
        const next = structuredClone(this.value.library);
        const publication = next.shelves.find((candidate) => candidate.id === id)!;
        publication.binding ??= { bound: true, numbering: 'through', parked: [] };
        uuid = crypto.randomUUID();
        publication.binding.uuid = uuid;
        await this.context.writeLibrary(next, false);
      }
      const published = this.value.library.shelves.find((candidate) => candidate.id === id);
      if (
        !published ||
        published.name !== shelf.name ||
        JSON.stringify(published.bookIds) !== JSON.stringify(bookIds) ||
        published.binding?.uuid !== uuid
      )
        throw new Error('BOOK_CHANGED');
    }
    await this.context.request('exportCollection', {
      ...(generatedCover ? { generatedCover } : {}),
      ...(uuid ? { uuid } : {}),
      bookIds,
      title,
      author: this.value.library.authors.find((a) => a.id === shelf.authorId)?.name ?? '',
      bound,
      numbering: shelf.binding?.numbering === 'restart' ? 'restart' : 'through',
      format,
      destination,
      language:
        typeof this.value.library.spellLanguage === 'string'
          ? this.value.library.spellLanguage
          : 'en',
    });
    this.context.patch({ hint: 'Exported ' + shelf.name });
  }
  async shelfNumbering(id: string) {
    const next = structuredClone(this.value.library),
      shelf = next.shelves.find((s) => s.id === id);
    if (!shelf?.binding) return;
    shelf.binding.numbering = shelf.binding.numbering === 'restart' ? 'through' : 'restart';
    await this.context.writeLibrary(next, false);
  }
  async regenerateCover(id: string) {
    const book = this.value.books.find((book) => book.id === id);
    if (!book) return;
    const metadata = Metadata.parse(
      await this.context.request('writeBookMeta', {
        bookId: id,
        metadata: { ...book, coverSeed: id + ':' + crypto.randomUUID(), coverMode: 'abstract' },
      }),
    );
    this.context.patch({
      books: this.value.books.map((book) => (book.id === id ? metadata : book)),
    });
    await this.context.prepareCovers();
  }
  async removeCover(id: string) {
    await this.context.request('removeCover', { bookId: id });
    const fresh = Metadata.parse(await this.context.request('readBookMeta', { bookId: id }));
    const metadata = Metadata.parse(
      await this.context.request('writeBookMeta', {
        bookId: id,
        metadata: { ...fresh, coverImage: null },
      }),
    );
    this.context.patch({
      books: this.value.books.map((book) => (book.id === id ? metadata : book)),
    });
    await this.context.prepareCovers();
  }
  async renameBook(id: string) {
    const book = this.value.books.find((b) => b.id === id);
    if (!book) return;
    const title = await this.context.prompt('Rename book', book.title);
    if (title === null) return;
    const metadata = Metadata.parse(
      await this.context.request('writeBookMeta', { bookId: id, metadata: { ...book, title } }),
    );
    this.context.patch({ books: this.value.books.map((b) => (b.id === id ? metadata : b)) });
  }
}
