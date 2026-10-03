/** NEO spell-pass token semantics, adapted from Hugh Howey's MIT renderer. */
export type SpellingPart = { from: number; to: number; word: string };
export type SpellingOccurrence = { from: number; to: number; whole: string | null; parts: SpellingPart[] };
export const normalizeSpellingWord = (word: string) => word.replace(/’/g, "'").replace(/^'+|'+$/g, '');
export function spellingOccurrences(text: string): SpellingOccurrence[] {
  const tokens = /[\p{L}\p{M}'’]+(?:-[\p{L}\p{M}'’]+)*/gu;
  const piece = /[\p{L}\p{M}'’]+/gu;
  const legal = (word: string) => /^[\p{Lu}'’]+$/u.test(word);
  const bare = (word: string) => word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const result: SpellingOccurrence[] = [];
  for (const match of text.matchAll(tokens)) {
    const bits = match[0].split('-');
    const stammer = bits.length > 1 && bits.slice(0, -1).every((bit, index) => bit.length <= 3 && bare(bits[index + 1]).startsWith(bare(bit)));
    const parts: SpellingPart[] = [];
    for (const part of match[0].matchAll(piece)) {
      const word = normalizeSpellingWord(part[0]);
      if (word.length < 2 || legal(part[0])) continue;
      if (stammer && part.index + part[0].length < match[0].length) continue;
      parts.push({ from: match.index + part.index, to: match.index + part.index + part[0].length, word });
    }
    if (!parts.length) continue;
    result.push({ from: match.index, to: match.index + match[0].length,
      whole: match[0].includes('-') && !stammer && !legal(match[0].replace(/-/g, '')) ? normalizeSpellingWord(match[0]) : null, parts });
  }
  return result;
}
export function rejectedSpellingRanges(occurrences: SpellingOccurrence[], correct: ReadonlyMap<string, boolean>): SpellingPart[] {
  const result: SpellingPart[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.whole && correct.get(occurrence.whole) !== false) continue;
    const wrong = occurrence.parts.filter((part) => correct.get(part.word) === false);
    if (wrong.length) result.push(...wrong);
    else if (occurrence.whole) result.push({ from: occurrence.from, to: occurrence.to, word: occurrence.whole });
  }
  return result;
}
