import { z } from 'zod';
import { Metadata } from './legacy.ts';
export * from './legacy.ts';
export * from './manuscript.ts';
export * from './screenplay.ts';
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
