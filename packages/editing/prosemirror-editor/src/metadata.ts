import { z } from 'zod';
import { Sticky, type MetadataValue } from '@leafloom/document-contracts';
export function removeChapterMetadata(metadata: MetadataValue, id: string) {
  for (const key of ['chapterTitles', 'chapterKinds', 'chapterNotes', 'sectionNotes']) {
    const parsed = z.record(z.string(), z.json()).safeParse(metadata[key]);
    if (parsed.success) {
      delete parsed.data[id];
      metadata[key] = parsed.data;
    }
  }
  const stickies = z.array(Sticky).safeParse(metadata.stickies);
  if (stickies.success)
    metadata.stickies = stickies.data.filter((sticky) => sticky.chapterId !== id);
}
