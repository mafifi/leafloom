import { describe, expect, it } from 'vitest';
import { dialogueDashes, markdownInline, mdEmphasisMatch, quoteOpenIn } from './typography';
describe('extracted NEO typography', () => {
  it('keeps scene markers, word hyphens and negatives', () => {
    for (const text of ['***', '---', 'well-known', '-5']) expect(dialogueDashes(text)).toBe(text);
    expect(dialogueDashes('- Hello - she said.')).toBe('— Hello – she said.');
  });
  it('recognizes Markdown closing marks without multiplying prose', () => {
    expect(mdEmphasisMatch('*word', '*')).toMatchObject({ start: 0, open: 1, italic: true });
    expect(mdEmphasisMatch('**word*', '*')).toMatchObject({ open: 2, bold: true });
    expect(mdEmphasisMatch('2 * 3', '*')).toBeNull();
    expect(mdEmphasisMatch('snake_case', '_')).toBeNull();
  });
  it('escapes pasted text and retains Markdown emphasis', () => {
    expect(markdownInline('Hello **sea** and *sky*')).toBe('Hello <b>sea</b> and <i>sky</i>');
    expect(markdownInline('<script> **sea**')).toBe('&lt;script&gt; <b>sea</b>');
    expect(markdownInline('2 * 3')).toBeNull();
  });
  it('distinguishes apostrophes from open quotations', () => {
    expect(quoteOpenIn('“I was—', '“', '”', '"')).toBe(true);
    expect(quoteOpenIn('‘don’t’', '‘', '’')).toBe(false);
    expect(quoteOpenIn('"hello', '“', '”', '"')).toBe(true);
  });
});
