import { it, expect, vi } from 'vitest';
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

it('does not construct number formatters for labels, authored strings or unused numbers', () => {
  const constructor = vi.spyOn(Intl, 'NumberFormat');
  try {
    const catalog = LanguageCatalog.parse({ locale: 'en-NZ', dict: {}, base: {} });
    expect(translate(catalog, 'Notes')).toBe('Notes');
    expect(translate(catalog, '{title} {unknown}', { title: 'NEO $& <draft>', unused: 1234 })).toBe('NEO $& <draft> {unknown}');
    expect(translate(catalog, '{year}', { year: '2026' })).toBe('2026');
    expect(constructor).not.toHaveBeenCalled();
  } finally { constructor.mockRestore(); }
});
it('reuses a native number formatter per explicit locale while keeping zero and localized separators', () => {
  const constructor = vi.spyOn(Intl, 'NumberFormat');
  try {
    const catalog = LanguageCatalog.parse({ locale: 'de-DE', dict: {}, base: {} });
    expect(translate(catalog, '{count} / {goal}', { count: 0, goal: 1234.5 })).toBe('0 / 1.234,5');
    expect(translate(catalog, '{count}', { count: 20000 })).toBe('20.000');
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(constructor).toHaveBeenCalledWith('de-DE');
  } finally { constructor.mockRestore(); }
});
it('retains invalid locale numeric fallback and leaves unknown placeholders unchanged', () => {
  const catalog = LanguageCatalog.parse({ locale: 'invalid_locale', dict: {}, base: {} });
  expect(translate(catalog, '{count} {unknown}', { count: 1234.5 })).toBe('1234.5 {unknown}');
  expect(translate(catalog, '{count}', { count: 0 })).toBe('0');
});
