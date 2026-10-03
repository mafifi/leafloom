import { z } from 'zod';
export const Author = z.object({ id: z.string().min(1), name: z.string() }).passthrough();
export const PageKinds = [
  'cover',
  'copyright',
  'dedication',
  'epigraph',
  'prologue',
  'part',
  'epilogue',
  'acknowledgments',
  'about',
] as const;
const lead = ['cover', 'copyright', 'dedication', 'epigraph', 'prologue'];
const tail = ['epilogue', 'acknowledgments', 'about'];
export const Binding = z
  .object({
    bound: z.boolean(),
    numbering: z.string().default('through'),
    parked: z
      .array(
        z.object({ id: z.string(), kind: z.string(), before: z.string().nullable().optional() }),
      )
      .default([]),
  })
  .passthrough();
export const Shelf = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    authorId: z.string(),
    bookIds: z.array(z.string()),
    bound: z.boolean().optional(),
    binding: Binding.optional(),
  })
  .passthrough();
export const Library = z
  .object({
    firstRunDone: z.boolean().default(false),
    authorName: z.string().default('Anonymous'),
    authors: z.array(Author).default([]),
    currentAuthorId: z.string().default(''),
    shelves: z.array(Shelf).default([]),
    writingStyle: z.enum(['pantser', 'plotter']).default('pantser'),
    fonts: z.record(z.string(), z.string()).default({ body: 'Georgia', dropcap: 'none' }),
    pageTheme: z.string().default('paper'),
  })
  .passthrough();
export type LibraryValue = z.infer<typeof Library>;
export type ShelfValue = z.infer<typeof Shelf>;
export type AuthorValue = z.infer<typeof Author>;
const copy = (l: LibraryValue) => structuredClone(l);
const id = () => crypto.randomUUID();
export function createLibrary(): LibraryValue {
  return Library.parse({});
}
export function completeFirstRun(value: LibraryValue, name: string): LibraryValue {
  const l = copy(value),
    author = { id: id(), name: name.trim() || 'Anonymous' };
  l.firstRunDone = true;
  l.authorName = author.name;
  l.authors = [author];
  l.currentAuthorId = author.id;
  l.shelves = [{ id: id(), name: 'My books', authorId: author.id, bookIds: [] }];
  return l;
}
export function createShelf(value: LibraryValue, name: string): LibraryValue {
  const l = copy(value);
  if (!l.authors.some((a) => a.id === l.currentAuthorId)) throw Error('NOT_FOUND');
  l.shelves.push({
    id: id(),
    name: name.trim() || 'Shelf',
    authorId: l.currentAuthorId,
    bookIds: [],
  });
  return l;
}
export function renameShelf(value: LibraryValue, shelfId: string, name: string): LibraryValue {
  const l = copy(value),
    s = l.shelves.find((s) => s.id === shelfId);
  if (!s) throw Error('NOT_FOUND');
  s.name = name.trim() || 'Shelf';
  return l;
}
export function deleteShelf(value: LibraryValue, shelfId: string): LibraryValue {
  const l = copy(value),
    s = l.shelves.find((s) => s.id === shelfId);
  if (!s) throw Error('NOT_FOUND');
  const home = l.shelves.find((other) => other.authorId === s.authorId && other.id !== shelfId);
  if (!home) throw Error('LAST_SHELF');
  home.bookIds.push(...s.bookIds.filter((book) => !home.bookIds.includes(book)));
  l.shelves = l.shelves.filter((s) => s.id !== shelfId);
  return l;
}
export function moveBook(
  value: LibraryValue,
  bookId: string,
  targetId: string,
  index: number,
): LibraryValue {
  const l = copy(value),
    target = l.shelves.find((s) => s.id === targetId);
  if (!target) throw Error('NOT_FOUND');
  if (!Number.isInteger(index) || index < 0 || index > target.bookIds.length)
    throw Error('INVALID_TARGET');
  for (const s of l.shelves) s.bookIds = s.bookIds.filter((id) => id !== bookId);
  target.bookIds.splice(Math.min(index, target.bookIds.length), 0, bookId);
  return l;
}
export function moveShelf(value: LibraryValue, shelfId: string, index: number): LibraryValue {
  const l = copy(value),
    at = l.shelves.findIndex((s) => s.id === shelfId);
  if (at < 0) throw Error('NOT_FOUND');
  if (!Number.isInteger(index) || index < 0 || index >= l.shelves.length)
    throw Error('INVALID_TARGET');
  const [s] = l.shelves.splice(at, 1);
  l.shelves.splice(index, 0, s);
  return l;
}
export function addAuthor(value: LibraryValue, name: string): LibraryValue {
  const l = copy(value),
    author = { id: id(), name: name.trim() || 'Anonymous' };
  l.authors.push(author);
  l.currentAuthorId = author.id;
  l.authorName = author.name;
  l.shelves.push({ id: id(), name: 'My books', authorId: author.id, bookIds: [] });
  return l;
}
export function selectAuthor(value: LibraryValue, authorId: string): LibraryValue {
  const l = copy(value),
    author = l.authors.find((a) => a.id === authorId);
  if (!author) throw Error('NOT_FOUND');
  l.currentAuthorId = author.id;
  l.authorName = author.name;
  return l;
}
export function renameAuthor(value: LibraryValue, authorId: string, name: string): LibraryValue {
  const l = copy(value),
    author = l.authors.find((a) => a.id === authorId);
  if (!author) throw Error('NOT_FOUND');
  author.name = name.trim() || 'Anonymous';
  if (l.currentAuthorId === authorId) l.authorName = author.name;
  return l;
}
export function deleteAuthor(value: LibraryValue, authorId: string): LibraryValue {
  const l = copy(value);
  if (!l.authors.some((a) => a.id === authorId)) throw Error('NOT_FOUND');
  if (l.authors.length === 1) throw Error('LAST_AUTHOR');
  l.authors = l.authors.filter((a) => a.id !== authorId);
  for (const shelf of l.shelves) if (shelf.authorId === authorId) shelf.authorId = l.authors[0].id;
  if (l.currentAuthorId === authorId) {
    l.currentAuthorId = l.authors[0].id;
    l.authorName = l.authors[0].name;
  }
  return l;
}
export function bindShelf(value: LibraryValue, shelfId: string): LibraryValue {
  const l = copy(value),
    s = l.shelves.find((s) => s.id === shelfId);
  if (!s) throw Error('NOT_FOUND');
  const binding = Binding.parse({ ...s.binding, bound: true });
  const parked = binding.parked;
  const front = parked
    .filter((p) => lead.includes(p.kind))
    .sort((a, b) => lead.indexOf(a.kind) - lead.indexOf(b.kind));
  const back = parked
    .filter((p) => tail.includes(p.kind))
    .sort((a, b) => tail.indexOf(a.kind) - tail.indexOf(b.kind));
  const body = s.bookIds.filter((id) => !parked.some((p) => p.id === id));
  for (const page of parked.filter((p) => p.kind === 'part')) {
    const index = page.before ? body.indexOf(page.before) : -1;
    body.splice(index < 0 ? body.length : index, 0, page.id);
  }
  if (parked.length) s.bookIds = [...front.map((p) => p.id), ...body, ...back.map((p) => p.id)];
  s.binding = { ...binding, parked: [] };
  s.bound = true;
  return l;
}
export function unbindShelf(
  value: LibraryValue,
  shelfId: string,
  kinds: Record<string, string> = {},
): LibraryValue {
  const l = copy(value),
    s = l.shelves.find((s) => s.id === shelfId);
  if (!s) throw Error('NOT_FOUND');
  const binding = Binding.parse({ ...s.binding, bound: false });
  const ids = [...s.bookIds];
  binding.parked = [];
  s.bookIds = ids.filter((id, index) => {
    const kind = kinds[id];
    if (!PageKinds.some((page) => page === kind)) return true;
    const before =
      kind === 'part'
        ? (ids.slice(index + 1).find((other) => !PageKinds.some((page) => page === kinds[other])) ??
          null)
        : null;
    binding.parked.push({ id, kind, before });
    return false;
  });
  s.binding = binding;
  s.bound = false;
  return l;
}
export function boundBodyRange(shelf: ShelfValue, kinds: Record<string, string>, skipId?: string) {
  const ids = shelf.bookIds.filter((id) => id !== skipId);
  let start = 0,
    end = ids.length;
  if (shelf.binding?.bound || shelf.bound) {
    while (start < end && lead.includes(kinds[ids[start]])) start++;
    while (end > start && tail.includes(kinds[ids[end - 1]])) end--;
  }
  return { start, end };
}
