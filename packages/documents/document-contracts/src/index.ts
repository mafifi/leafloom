import { z } from 'zod';

export const Metadata = z
  .object({ id: z.string().min(1), title: z.string(), author: z.string() })
  .catchall(z.json());
export const Book = z
  .strictObject({
    formatVersion: z.literal('neo-lifecycle/v1'),
    revision: z.number().int().nonnegative(),
    metadata: Metadata,
    chapters: z.array(z.strictObject({ id: z.string().min(1), html: z.string() })),
    darlings: z.array(z.json()),
  })
  .superRefine((book, ctx) => {
    const ids = book.chapters.map((c) => c.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate chapter identity' });
    if ('chapterOrder' in book.metadata)
      ctx.addIssue({ code: 'custom', message: 'Chapter order belongs to chapters' });
  });
export type BookDocument = z.infer<typeof Book>;
const Id = z.string().min(1);
const Offset = z.number().int().nonnegative();
export const PassageIndex = z.strictObject({
  id: Id,
  path: z.array(Offset).min(1),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});
export const IdentityBook = z
  .strictObject({
    formatVersion: z.literal('neo-identity/v1'),
    revision: Offset,
    metadata: Metadata,
    chapters: z.array(
      z.strictObject({
        id: Id,
        html: z.string(),
        version: z.uuid(),
        passages: z.array(PassageIndex),
      }),
    ),
    darlings: z.array(z.json()),
  })
  .superRefine((b, c) => {
    if ('chapterOrder' in b.metadata)
      c.addIssue({ code: 'custom', message: 'Order belongs to chapters' });
    const ids = b.chapters.map((c) => c.id);
    if (new Set(ids).size !== ids.length)
      c.addIssue({ code: 'custom', message: 'Duplicate chapter' });
    const passages = b.chapters.flatMap((c) => c.passages.map((p) => p.id));
    if (new Set(passages).size !== passages.length)
      c.addIssue({ code: 'custom', message: 'Duplicate passage' });
  });
export type IdentityBookDocument = z.infer<typeof IdentityBook>;
export const Manuscript = z
  .strictObject({
    ...IdentityBook.shape,
    formatVersion: z.literal('neo-composed/v1'),
    version: z.uuid(),
  })
  .superRefine((value, ctx) => {
    const { version, ...base } = value;
    const result = IdentityBook.safeParse({ ...base, formatVersion: 'neo-identity/v1' });
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  });
export type ManuscriptValue = z.infer<typeof Manuscript>;
export const SourceBook = z.union([Book, IdentityBook, Manuscript]);
/** Export the readable legacy envelope without editor identity internals. */
export function legacyBook(raw: unknown): BookDocument {
  const book = SourceBook.parse(raw);
  return Book.parse({
    formatVersion: 'neo-lifecycle/v1',
    revision: book.revision,
    metadata: book.metadata,
    chapters: book.chapters.map(({ id, html }) => ({ id, html })),
    darlings: book.darlings,
  });
}

export const ChapterKind = z.enum([
  'copyright',
  'dedication',
  'epigraph',
  'contents',
  'prologue',
  'part',
  'chapter',
  'unnumbered',
  'epilogue',
  'acknowledgments',
  'about',
]);
export type ChapterKindValue = z.infer<typeof ChapterKind>;
export const storyKinds: readonly ChapterKindValue[] = [
  'chapter',
  'unnumbered',
  'prologue',
  'epilogue',
];
export const Sticky = z
  .object({
    id: z.string().min(1),
    chapterId: z.string().min(1),
    text: z.string(),
    resolved: z.boolean().default(false),
  })
  .catchall(z.json());
export type StickyValue = z.infer<typeof Sticky>;
export const JSONValue = z.json();
export type JSONValue = z.infer<typeof JSONValue>;
export type MetadataValue = z.infer<typeof Metadata>;
