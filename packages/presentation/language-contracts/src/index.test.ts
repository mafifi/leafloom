import { it, expect } from 'vitest';
import { translate, LanguageCatalog } from './index';
it('validates provider dictionaries and resolves translated, English and literal fallbacks', () => {
  const c = LanguageCatalog.parse({
    locale: 'fr',
    dict: { Notes: 'Notes françaises' },
    base: { Help: 'Help' },
  });
  expect(translate(c, 'Notes')).toBe('Notes françaises');
  expect(translate(c, 'Help')).toBe('Help');
  expect(translate(c, 'Missing')).toBe('Missing');
});
it('preserves source plural categories, interpolation and product names', () => {
  const c = LanguageCatalog.parse({
    locale: 'pl',
    dict: {
      '{n} chapters': {
        one: '{n} rozdział',
        few: '{n} rozdziały',
        many: '{n} rozdziałów',
        other: '{n} rozdziału',
      },
      'Welcome to NEO': 'Witaj w NEO',
    },
    base: {},
  });
  expect(translate(c, '{n} chapters', { n: 2 })).toBe('2 rozdziały');
  expect(translate(c, '{n} chapters', { n: 5 })).toBe('5 rozdziałów');
  expect(translate(c, 'Welcome to Leafloom')).toBe('Witaj w Leafloom');
});
it('formats numeric substitutions like pinned NEO while retaining authored strings and year strings', () => {
  const key = '{title} — {count} / {goal} words — {year}';
  const en = LanguageCatalog.parse({ locale: 'en', dict: {}, base: {} });
  expect(
    translate(en, key, { title: 'NEO: 1000', count: 20_000, goal: 80_000, year: '2026' }),
  ).toBe('NEO: 1000 — 20,000 / 80,000 words — 2026');
  const fr = LanguageCatalog.parse({ locale: 'fr', dict: {}, base: {} });
  expect(translate(fr, '{count} words', { count: 20_000 })).toBe('20\u202f000 words');
  const de = LanguageCatalog.parse({ locale: 'de', dict: {}, base: {} });
  expect(translate(de, '{count}', { count: 1234.5 })).toBe('1.234,5');
});
it('rebrands catalogue templates before interpolation without changing a writers title or author', () => {
  const c = LanguageCatalog.parse({
    locale: 'en',
    dict: { 'Draft from NEO: {title} by {author}': 'Draft from NEO: {title} by {author}' },
    base: {},
  });
  expect(
    translate(c, 'Draft from Leafloom: {title} by {author}', {
      title: 'NEO and the Sea',
      author: 'NEO Writer',
    }),
  ).toBe('Draft from Leafloom: NEO and the Sea by NEO Writer');
});

it('uses English plural rules for missing translated messages while keeping localized numbers', () => {
  const catalog = LanguageCatalog.parse({
    locale: 'fr',
    dict: { '{n} translated books': { one: '{n} livre', other: '{n} livres' } },
    base: { '{n} books': { one: '{n} book', other: '{n} books' } },
  });
  expect(translate(catalog, '{n} books', { n: 0 })).toBe('0 books');
  expect(translate(catalog, '{n} books', { n: 1 })).toBe('1 book');
  expect(translate(catalog, '{n} books', { n: 20_000 })).toBe('20\u202f000 books');
  expect(translate(catalog, '{n} translated books', { n: 0 })).toBe('0 livre');
  expect(translate(catalog, '{n} translated books', { n: 2 })).toBe('2 livres');
});

it('derives the source dictionary from interface locale without choosing unsupported dictionaries', async () => {
  const { defaultSpellLanguage } = await import('./index');
  expect(
    ['ro', 'fr-CA', 'pt', 'pt-PT', 'en', 'en-GB', 'it', 'zh'].map(defaultSpellLanguage),
  ).toEqual(['ro', 'fr', 'pt-BR', 'en-US', 'en-US', 'en-GB', 'en-US', 'en-US']);
});
