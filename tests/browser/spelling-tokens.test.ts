import { expect, it } from 'vitest';
import { spellingOccurrences, rejectedSpellingRanges } from '../../apps/desktop/src/lib/spelling-tokens';
it('retains accented/non-Latin apostrophe words and ignores acronyms, shouting and single letters', () => {
  const words = spellingOccurrences('A I NASA HELLO l’homme déjà Ωμέγα текст').flatMap((item) => item.parts.map((part) => part.word));
  expect(words).toEqual(["l'homme", 'déjà', 'Ωμέγα', 'текст']);
});
it('stammers check only the final word while ordinary compounds check whole and parts', () => {
  const occurrences = spellingOccurrences('E-eu N-não Wh-what well-known');
  expect(occurrences.slice(0, 3).map((item) => item.parts.map((part) => part.word))).toEqual([['eu'], ['não'], ['what']]);
  expect(occurrences[3]).toMatchObject({ whole: 'well-known', parts: [{ word: 'well' }, { word: 'known' }] });
});
it('accepted compounds underline no pieces, invalid pieces only, or the whole if pieces are valid', () => {
  const occurrences = spellingOccurrences('well-known');
  expect(rejectedSpellingRanges(occurrences, new Map([['well-known', true], ['well', false], ['known', false]]))).toEqual([]);
  expect(rejectedSpellingRanges(occurrences, new Map([['well-known', false], ['well', true], ['known', false]]))).toEqual([{ from: 5, to: 10, word: 'known' }]);
  expect(rejectedSpellingRanges(occurrences, new Map([['well-known', false], ['well', true], ['known', true]]))).toEqual([{ from: 0, to: 10, word: 'well-known' }]);
});
