import { z } from 'zod';
import {
  Book,
  IdentityBook,
  LegacyManuscript,
  LegacySourceBook,
  type BookDocument,
} from './legacy.ts';
import { ManuscriptMode } from './screenplay.ts';
export const ManuscriptV2 = z
  .strictObject({
    ...LegacyManuscript.shape,
    formatVersion: z.literal('leafloom-manuscript/v2'),
    mode: ManuscriptMode,
  })
  .superRefine((book, ctx) => {
    const { mode, ...legacy } = book;
    const validation = LegacyManuscript.safeParse({ ...legacy, formatVersion: 'neo-composed/v1' });
    if (!validation.success)
      for (const issue of validation.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    if (book.metadata.format === 'screenplay' && book.mode !== 'screenplay')
      ctx.addIssue({
        code: 'custom',
        path: ['mode'],
        message: 'Screenplay metadata and manuscript mode must agree',
      });
  });
export const Manuscript = z.union([LegacyManuscript, ManuscriptV2]);
export type ManuscriptValue = z.infer<typeof Manuscript>;
export const SourceBook = z.union([Book, IdentityBook, LegacyManuscript, ManuscriptV2]);
export type SourceBookValue = z.infer<typeof SourceBook>;
export type ManuscriptV2Value = z.infer<typeof ManuscriptV2>;
/** Migration is a value transformation. The writer commits it through the existing save protocol. */
export function migrateManuscript(
  raw: unknown,
  newVersion: () => string = () => crypto.randomUUID(),
): ManuscriptV2Value {
  const parsed = SourceBook.parse(raw);
  if (parsed.formatVersion === 'leafloom-manuscript/v2') return structuredClone(parsed);
  const old = LegacySourceBook.parse(parsed);
  const version = 'version' in old ? old.version : newVersion();
  return ManuscriptV2.parse({
    ...structuredClone(old),
    formatVersion: 'leafloom-manuscript/v2',
    version,
    mode: old.metadata.format === 'screenplay' ? 'screenplay' : 'prose',
    chapters: old.chapters.map((chapter) => ({
      ...chapter,
      version: 'version' in chapter ? chapter.version : version,
      passages: 'passages' in chapter ? chapter.passages : [],
    })),
  });
}
/** Export the readable NEO envelope while preserving screenplay compatibility. */
export function legacyBook(raw: unknown): BookDocument {
  const book = SourceBook.parse(raw);
  return Book.parse({
    formatVersion: 'neo-lifecycle/v1',
    revision: book.revision,
    metadata:
      book.formatVersion === 'leafloom-manuscript/v2' && book.mode === 'screenplay'
        ? { ...book.metadata, format: 'screenplay' }
        : book.metadata,
    chapters: book.chapters.map(({ id, html }) => ({ id, html })),
    darlings: book.darlings,
  });
}
