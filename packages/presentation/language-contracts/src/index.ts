import { z } from 'zod';
export const Dictionary = z.record(
  z.string(),
  z.union([z.string(), z.record(z.string(), z.string())]),
);
export const LanguageCatalog = z.strictObject({
  locale: z.string(),
  dict: Dictionary,
  base: Dictionary,
});
export type LanguageCatalogValue = z.infer<typeof LanguageCatalog>;
export const english: LanguageCatalogValue = { locale: 'en', dict: {}, base: {} };
export function translate(
  catalog: LanguageCatalogValue,
  key: string,
  args: Record<string, string | number> = {},
) {
  const upstream = key.replaceAll('Leafloom', 'NEO');
  const translated = catalog.dict[upstream];
  let value = translated ?? catalog.base[upstream] ?? upstream;
  if (typeof value !== 'string') {
    const n = typeof args.n === 'number' ? args.n : 0;
    let form = 'other';
    try {
      form = new Intl.PluralRules(translated === undefined ? 'en' : catalog.locale).select(n);
    } catch {}
    value = value[form] ?? value.other ?? Object.values(value)[0] ?? upstream;
  }
  let numbers: Intl.NumberFormat | undefined;
  try {
    numbers = new Intl.NumberFormat(catalog.locale);
  } catch {}
  const template = value.replaceAll('NEO', 'Leafloom');
  return template.replace(/\{([\w]+)\}/g, (match, name) => {
    const argument = args[name];
    return argument === undefined
      ? match
      : typeof argument === 'number' && numbers
        ? numbers.format(argument)
        : String(argument);
  });
}

/** Mirrors the source's thirteen shipped dictionary choices without saving a preference. */
export function defaultSpellLanguage(locale: string): string {
  const shipped = new Set([
    'en-US',
    'en-GB',
    'en-CA',
    'en-AU',
    'fr',
    'es',
    'de',
    'nl',
    'pl',
    'pt-BR',
    'ro',
    'ru',
    'el',
  ]);
  if (shipped.has(locale)) return locale;
  if (locale === 'pt') return 'pt-BR';
  const base = locale.split('-')[0];
  return shipped.has(base) ? base : 'en-US';
}
