import type { Buffer } from 'node:buffer';

export type ChapterEditionStage = 'before' | 'after';
export type ChapterEditionFormat = 'html' | 'md';

export const chapterEditionFixture: {
  chapters: string[];
  metadata: {
    title: string;
    subtitle: string;
    author: string;
    chapterKinds: Record<string, string>;
    chapterTitles: Record<string, string>;
  };
  notes: string;
  library: { hintShown: boolean; fonts: { body: string; dropcap: string } };
};

export const chapterEditionStages: Record<
  ChapterEditionStage,
  {
    headings: string[];
    toc: string[];
    prose: string[];
  }
>;

export function inspectChapterEdition(
  format: ChapterEditionFormat,
  bytes: Buffer,
  stage: ChapterEditionStage,
): {
  fixture: 'chapter-roles';
  format: ChapterEditionFormat;
  stage: ChapterEditionStage;
  sha256: string;
  bytes: number;
  headings: string[];
  toc?: string[];
};
