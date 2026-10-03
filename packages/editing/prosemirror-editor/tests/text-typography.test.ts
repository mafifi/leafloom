import { expect, it } from 'vitest';
import type { TypographicInput } from '@leafloom/editor-contracts';
import { textTypography, typographicInput } from '../src/typography';

const input = (patch: Partial<TypographicInput> = {}): TypographicInput => ({
  character: '"',
  language: 'en',
  interfaceLanguage: 'en',
  previousTextNodePrefix: '',
  paragraphPrefix: '',
  chapterText: '',
  bookText: '',
  collapsed: true,
  ...patch,
});

it('returns replacement lengths only for adjacent text in a collapsed native text node', () => {
  expect(textTypography.query(input({ character: '-', previousTextNodePrefix: '-' }))).toEqual({
    replaceBefore: 1,
    text: '—',
  });
  expect(textTypography.query(input({ character: '.', previousTextNodePrefix: 'Wait..' }))).toEqual(
    { replaceBefore: 2, text: '…' },
  );
  expect(
    textTypography.query(
      input({ character: '-', previousTextNodePrefix: '', paragraphPrefix: '-' }),
    ),
  ).toBeNull();
  expect(
    textTypography.query(
      input({ character: '.', previousTextNodePrefix: '.', paragraphPrefix: '..' }),
    ),
  ).toBeNull();
  expect(
    textTypography.query(input({ character: '-', previousTextNodePrefix: '-', collapsed: false })),
  ).toBeNull();
  expect(textTypography.query(input({ character: 'Enter' }))).toBeNull();
});

it('uses the interface locale for Quebec spacing independently of the French dictionary variant', () => {
  const french = { language: 'fr', previousTextNodePrefix: 'Bonjour ' };
  for (const character of [';', ':', '!', '?']) {
    expect(typographicInput(input({ ...french, character, interfaceLanguage: 'fr' }))).toEqual({
      replaceBefore: 1,
      text: '\u202f' + character,
    });
    expect(typographicInput(input({ ...french, character, interfaceLanguage: 'fr-CA' }))).toEqual(
      character === ':' ? { replaceBefore: 1, text: '\u202f:' } : null,
    );
  }
  expect(
    typographicInput(
      input({
        character: '!',
        language: 'fr-CA',
        interfaceLanguage: 'en',
        previousTextNodePrefix: 'Bonjour\u00a0',
      }),
    ),
  ).toEqual({ replaceBefore: 1, text: '\u202f!' });
  expect(
    typographicInput(
      input({
        character: ':',
        language: 'en',
        interfaceLanguage: 'fr-CA',
        previousTextNodePrefix: 'Hello ',
      }),
    ),
  ).toBeNull();
});

it('infers double quote style from chapter before book and balances interrupted speech across marks', () => {
  expect(
    typographicInput(input({ language: 'de', chapterText: '»Chapter«', bookText: '«Book»' })),
  ).toEqual({ replaceBefore: 0, text: '»' });
  expect(typographicInput(input({ language: 'de', bookText: '«Book»' }))).toEqual({
    replaceBefore: 0,
    text: '«',
  });
  expect(
    typographicInput(input({ previousTextNodePrefix: '—', paragraphPrefix: '“I was—' })),
  ).toEqual({ replaceBefore: 0, text: '”' });
  expect(
    typographicInput(input({ previousTextNodePrefix: '—', paragraphPrefix: 'An introduction—' })),
  ).toEqual({ replaceBefore: 0, text: '“' });
});

it('retains apostrophe conventions, selection replacement and pure input ownership', () => {
  for (const [language, text] of [
    ['en', '‘'],
    ['nl', '‘'],
    ['fr', '’'],
    ['de', '’'],
  ] as const)
    expect(typographicInput(input({ character: "'", language }))).toEqual({
      replaceBefore: 0,
      text,
    });
  expect(typographicInput(input({ character: "'", previousTextNodePrefix: 'writer' }))).toEqual({
    replaceBefore: 0,
    text: '’',
  });
  const context = Object.freeze(input({ previousTextNodePrefix: 'ending', collapsed: false }));
  expect(typographicInput(context)).toEqual({ replaceBefore: 0, text: '“' });
  expect(context.previousTextNodePrefix).toBe('ending');
});
