import type { ShelfValue } from '@leafloom/library';
import type { CoverPresentationValue } from '@leafloom/cover-contracts';
import type { LanguageCatalogValue } from '@leafloom/language-contracts';
export const PageLabels: Readonly<Record<string, string>> = {
  cover: 'Title Page',
  copyright: 'Copyright',
  dedication: 'Dedication',
  epigraph: 'Epigraph',
  prologue: 'Prologue',
  part: 'Part',
  epilogue: 'Epilogue',
  acknowledgments: 'Acknowledgments',
  about: 'About the Author',
};
const lead = ['cover', 'copyright', 'dedication', 'epigraph', 'prologue'];
const front = ['copyright', 'dedication', 'epigraph', 'prologue'];
const back = ['epilogue', 'acknowledgments', 'about'];
export interface ShelfBook {
  id: string;
  title: string;
  author: string;
  kind?: string;
  chapterKinds?: Record<string, string>;
  chapterOrder?: string[];
  wordCount?: number;
  wordGoal?: number;
  coverImage?: string;
}
export type ShelfTile =
  | { type: 'book' | 'cover' | 'page'; book: ShelfBook; label: string }
  | { type: 'ghost'; kind: string; label: string }
  | { type: 'seam'; beforeId: string }
  | { type: 'new' };
export function romanPart(value: number): string {
  let number = value,
    out = '';
  for (const [n, s] of [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ] as const)
    while (number >= n) {
      out += s;
      number -= n;
    }
  return out;
}
/** Source renderBoundRow: only front/back zones canonicalize page order; authored body order stays intact. */
export function boundShelfLayout(
  shelf: ShelfValue,
  books: readonly ShelfBook[],
  hover = true,
): ShelfTile[] {
  const byId = new Map(books.map((book) => [book.id, book])),
    items = shelf.bookIds
      .map((id) => byId.get(id))
      .filter((book): book is ShelfBook => Boolean(book));
  if (!(shelf.binding?.bound || shelf.bound))
    return [
      ...items.map((book) => ({ type: 'book' as const, book, label: book.title })),
      { type: 'new' },
    ];
  let f = 0,
    b = items.length;
  while (f < items.length && lead.includes(items[f].kind ?? '')) f++;
  while (b > f && back.includes(items[b - 1].kind ?? '')) b--;
  const first = items.slice(0, f),
    body = items.slice(f, b),
    last = items.slice(b),
    out: ShelfTile[] = [];
  const cover = first.find((book) => book.kind === 'cover');
  if (cover) out.push({ type: 'cover', book: cover, label: shelf.name });
  const stories = body.filter((book) => !PageLabels[book.kind ?? '']),
    lone = stories.length === 1 ? stories[0] : undefined;
  const offer = (kind: string) =>
    !(
      lone &&
      ['prologue', 'epilogue'].includes(kind) &&
      (lone.chapterOrder ?? Object.keys(lone.chapterKinds ?? {})).some(
        (id) => lone.chapterKinds?.[id] === kind,
      )
    );
  const zone = (pages: ShelfBook[], kinds: string[]) => {
    const remaining = [...pages];
    for (const kind of kinds) {
      const i = remaining.findIndex((book) => book.kind === kind);
      if (i >= 0) {
        const book = remaining.splice(i, 1)[0];
        out.push({ type: 'page', book, label: PageLabels[kind] });
      } else if (hover && offer(kind)) out.push({ type: 'ghost', kind, label: PageLabels[kind] });
    }
    for (const book of remaining)
      out.push({ type: 'page', book, label: PageLabels[book.kind ?? ''] ?? book.title });
  };
  zone(
    first.filter((book) => book.kind !== 'cover'),
    front,
  );
  let parts = 0;
  body.forEach((book, index) => {
    if (book.kind === 'part') {
      out.push({ type: 'page', book, label: 'Part ' + romanPart(++parts) });
      return;
    }
    if (PageLabels[book.kind ?? '']) {
      out.push({ type: 'page', book, label: PageLabels[book.kind!] });
      return;
    }
    if (hover && body[index - 1]?.kind !== 'part') out.push({ type: 'seam', beforeId: book.id });
    out.push({ type: 'book', book, label: book.title });
  });
  out.push({ type: 'new' });
  zone(last, back);
  return out;
}
export interface LibraryShelfActions {
  rename(name: string): void;
  shelfMenu(event: MouseEvent): void;
  shelfDrag(event: DragEvent): void;
  shelfDrop(event: DragEvent, index?: number): void;
  bookDrag(event: DragEvent, book: ShelfBook): void;
  bookMenu(event: MouseEvent, book: ShelfBook): void;
  refreshCover(book: ShelfBook): void;
  pageMenu(event: MouseEvent, book: ShelfBook, label: string): void;
  openBook(book: ShelfBook): void;
  openPage(book: ShelfBook, label: string): void;
  openCover(book: ShelfBook): void;
  addPage(kind: string, beforeId?: string): void;
  newBook(): void;
}
export interface LibraryShelfProps {
  shelf: ShelfValue;
  books: readonly ShelfBook[];
  covers: Readonly<Record<string, CoverPresentationValue>>;
  actions: LibraryShelfActions;
  language: LanguageCatalogValue;
  hover?: boolean;
  draggedBook?: string;
}

export function coverInsertionIndex(
  rectangles: readonly { top: number; bottom: number; left: number; width: number }[],
  x: number,
  y: number,
): number {
  const index = rectangles.findIndex(
    (rect) => y < rect.top || (y < rect.bottom && x < rect.left + rect.width / 2),
  );
  return index < 0 ? rectangles.length : index;
}
