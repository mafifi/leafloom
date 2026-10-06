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
// Formatting objects depend only on the explicit interface locale. Keep this
// small cache bounded even when a provider supplies unfamiliar locale tags.
const numberFormats = new Map<string, Intl.NumberFormat | undefined>();
function numberFormat(locale: string): Intl.NumberFormat | undefined {
  if (numberFormats.has(locale)) return numberFormats.get(locale);
  let formatter: Intl.NumberFormat | undefined;
  try { formatter = new Intl.NumberFormat(locale); } catch {}
  if (numberFormats.size >= 32) numberFormats.delete(numberFormats.keys().next().value!);
  numberFormats.set(locale, formatter);
  return formatter;
}
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
  const template = value.replaceAll('NEO', 'Leafloom');
  return template.replace(/\{([\w]+)\}/g, (match, name) => {
    const argument = args[name];
    if (argument === undefined) return match;
    if (typeof argument !== 'number') return String(argument);
    return numberFormat(catalog.locale)?.format(argument) ?? String(argument);
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
