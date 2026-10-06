import type {
  TextTypographyPort,
  TypographicInput,
  TypographicReplacement,
} from '@leafloom/editor-contracts';

export type TypographyPreferences = {
  language?: string;
  interfaceLanguage?: string;
  markdown?: boolean;
};
export type QuoteStyle = { open: string; close: string; singles?: boolean };
const quotes: Record<string, QuoteStyle> = {
  en: { open: '“', close: '”', singles: true },
  nl: { open: '“', close: '”', singles: true },
  pt: { open: '“', close: '”', singles: true },
  'pt-PT': { open: '«', close: '»' },
  fr: { open: '«\u202f', close: '\u202f»' },
  es: { open: '«', close: '»' },
  it: { open: '«', close: '»' },
  de: { open: '„', close: '“' },
  pl: { open: '„', close: '”' },
  ro: { open: '„', close: '”' },
  ru: { open: '«', close: '»' },
  el: { open: '«', close: '»' },
};
export function quoteStyle(language: string, chapterText: string, bookText: string): QuoteStyle {
  const preferred = quotes[language] ?? quotes[language.split('-')[0]] ?? quotes.en;
  const count = (text: string) => ({
    reverse: (text.match(/»(?=[\p{L}\p{N}])/gu) || []).length,
    forward: preferred.open.trim() === '«' ? 0 : (text.match(/«(?=[\p{L}\p{N}])/gu) || []).length,
    own: (text.match(new RegExp(preferred.open.trim() + '\\s?(?=[\\p{L}\\p{N}])', 'gu')) || [])
      .length,
  });
  let tally = count(chapterText);
  if (!tally.reverse && !tally.forward && !tally.own) tally = count(bookText);
  if (tally.reverse > tally.own && tally.reverse >= tally.forward)
    return { open: '»', close: '«', singles: preferred.singles };
  if (tally.forward > tally.own && tally.forward > tally.reverse)
    return { open: '«', close: '»', singles: preferred.singles };
  return preferred;
}
export function quoteIsOpen(text: string, style: QuoteStyle, straight = ''): boolean {
  let depth = 0,
    straights = 0;
  const open = style.open.trim(),
    close = style.close.trim();
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (straight && char === straight) straights++;
    else if (char === open && open !== close) depth++;
    else if (char === close) {
      if (close === '’' && /\p{L}/u.test(text[i - 1] || '') && /\p{L}/u.test(text[i + 1] || ''))
        continue;
      depth = Math.max(0, depth - 1);
    }
  }
  return depth > 0 || straights % 2 === 1;
}
/** Source smartKeys query. Hosts own selection replacement and native input guards. */
export function typographicInput(input: TypographicInput): TypographicReplacement | null {
  const character = input.character,
    before = input.collapsed ? input.previousTextNodePrefix : '',
    previous = before.at(-1) || '';
  if (character === '-' && previous === '-') return { replaceBefore: 1, text: '—' };
  if (character === '.' && before.endsWith('..')) return { replaceBefore: 2, text: '…' };
  if (
    input.language.startsWith('fr') &&
    (/^fr-CA$/i.test(input.interfaceLanguage) ? /^:$/ : /^[;:!?]$/).test(character) &&
    /^[ \u00a0]$/.test(previous)
  )
    return { replaceBefore: 1, text: '\u202f' + character };
  if (character !== '"' && character !== "'") return null;
  const style = quoteStyle(input.language, input.chapterText, input.bookText);
  let opening = !previous || /[\s\(\[\{‘“«„>]/.test(previous);
  if (previous === '—' || previous === '–')
    opening = !quoteIsOpen(
      input.paragraphPrefix,
      character === '"' ? style : { open: '‘', close: '’' },
      character === '"' ? '"' : '',
    );
  return {
    replaceBefore: 0,
    text:
      character === "'"
        ? style.singles && opening
          ? '‘'
          : '’'
        : opening
          ? style.open
          : style.close,
  };
}
export const textTypography: TextTypographyPort = { query: typographicInput };
export type TextEdit = { at: number; length: number; text: string };
export function dialogueEdits(text: string, language: string): TextEdit[] {
  if (/^[\s*#•~⁂—–-]*$/.test(text)) return [];
  const base = language.split('-')[0],
    style =
      base === 'es'
        ? { open: '—', space: '', mid: '—' }
        : base === 'pt' || base === 'ru'
          ? { open: '—', space: ' ', mid: '—' }
          : { open: '—', space: undefined, mid: '–' };
  const edits: TextEdit[] = [],
    opening = text.match(/^-(?:(\s+)(?=[^\s-])|(?=[^\s\d-]))/u);
  if (opening)
    edits.push({
      at: 0,
      length: opening[0].length,
      text: style.open + (style.space ?? opening[1] ?? ''),
    });
  for (const match of text.matchAll(/(?<=\s)-(?=["'“”‘’«»„]*(?:[\s.,;:!?…)\]]))/gu))
    edits.push({ at: match.index, length: 1, text: style.mid });
  return edits;
}
export function markdownMatch(
  text: string,
): { from: number; to: number; open: number; bold: boolean; italic: boolean; strike?: boolean } | null {
  const struck = text.match(/(^|[^~\\])~~(?![\s~])(.+?)(?<![\s\\~])~~$/u);
  if (struck) return { from: text.length - struck[0].length + struck[1].length, to: text.length, open: 2, bold: false, italic: false, strike: true };
  for (const count of [3, 2, 1])
    for (const delimiter of ['*', '_']) {
      const mark = delimiter === '*' ? '\\*' : '_',
        pattern = new RegExp(
          `(^|[^\\p{L}\\p{N}*_\\\\])(${mark}{${count}})(?![\\s*_])(.+?)(?<![\\s\\\\*_])\\2$`,
          'u',
        ),
        match = text.match(pattern);
      if (match) {
        const occurrences = new Map<number, number>();
        for (const run of match[3].match(new RegExp(mark + '+', 'g')) ?? [])
          occurrences.set(run.length, (occurrences.get(run.length) ?? 0) + 1);
        if (Array.from(occurrences.values()).some((value) => value % 2)) continue;
        return {
          from: text.length - match[0].length + match[1].length,
          to: text.length,
          open: count,
          bold: count > 1,
          italic: count !== 2,
        };
      }
    }
  return null;
}
/** NEO pasted emphasis grammar; text is escaped before adding recognized marks. */
export function markdownHTML(line: string): string | null {
  const edge = '(^|[^\\p{L}\\p{N}*_\\\\])',
    tail = '(?![\\p{L}\\p{N}])';
  let html = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const before = html;
  html = html.replace(
    new RegExp(`${edge}(\\*\\*\\*|___)(?!\\s)(.+?)(?<![\\s\\\\])\\2${tail}`, 'gu'),
    '$1<b><i>$3</i></b>',
  );
  html = html.replace(
    new RegExp(`${edge}(\\*\\*|__)(?!\\s)(.+?)(?<![\\s\\\\])\\2${tail}`, 'gu'),
    '$1<b>$3</b>',
  );
  html = html.replace(
    new RegExp(`${edge}(\\*|_)(?![\\s*_])(.+?)(?<![\\s\\\\*_])\\2${tail}`, 'gu'),
    '$1<i>$3</i>',
  );
  html = html.replace(/(^|[^~\\])~~(?![\s~])(.+?)(?<![\s\\~])~~(?!~)/gu, '$1<s>$2</s>');
  return html === before ? null : html;
}
