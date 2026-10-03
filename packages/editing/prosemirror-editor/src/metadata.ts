import { z } from 'zod';
import { ChapterKind, Sticky, type MetadataValue } from '@leafloom/document-contracts';
/** NEO's first/last legacy roles settle on open; modern kinds may occur anywhere. */
export function settleChapterKinds(metadata: MetadataValue, order: readonly string[]) {
  // Production metadata can retain future kinds and explicit default entries.
  // Only the legacy-role migration owns NEO's cleanup of its old kind map.
  if (!('prologue' in metadata) && !('epilogue' in metadata)) return false;
  const parsed = z.record(z.string(), z.json()).safeParse(metadata.chapterKinds);
  const kinds = parsed.success ? { ...parsed.data } : {};
  let changed = false;
  for (const role of ['prologue', 'epilogue'] as const) {
    if (!(role in metadata)) continue;
    const id = metadata[role];
    if (typeof id === 'string' && order.length >= 2) {
      const modern = ChapterKind.safeParse(kinds[id]);
      const edge = role === 'prologue' ? order[0] : order.at(-1);
      if ((modern.success ? modern.data : id === edge ? role : 'chapter') === role)
        kinds[id] = role;
    }
    delete metadata[role];
    changed = true;
  }
  for (const [id, kind] of Object.entries(kinds)) {
    if (!order.includes(id) || kind === 'chapter' || !ChapterKind.safeParse(kind).success) {
      delete kinds[id];
      changed = true;
    }
  }
  if (parsed.success || Object.keys(kinds).length) metadata.chapterKinds = kinds;
  return changed;
}
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
