/** Original NEO's new-import paragraph transformation (app.js dialogueDashes).
 * Deliberately excludes smart quotes, ellipses and French punctuation spacing. */
export function importDialogue(text: string, language: string): string {
  if (/^[\s*#•~⁂—–-]*$/.test(text)) return text;
  const base = language.replaceAll('_', '-').split('-')[0].toLowerCase();
  const style = base === 'es' ? { open: '—', space: '', mid: '—' }
    : base === 'pt' || base === 'ru' ? { open: '—', space: ' ', mid: '—' }
    : { open: '—', space: undefined, mid: '–' };
  const edits: { at: number; from: string; to: string }[] = [];
  const opening = text.match(/^-(?:(\s+)(?=[^\s-])|(?=[^\s\d-]))/u);
  if (opening) edits.push({ at: 0, from: opening[0], to: style.open + (style.space ?? opening[1] ?? '') });
  for (const match of text.matchAll(/(?<=\s)-(?=["'“”‘’«»„]*(?:[\s.,;:!?…)\]]|$)|["'“”‘’«»„]+\uE000)/gu))
    edits.push({ at: match.index, from: '-', to: style.mid });
  return edits.reduceRight((value, edit) => value.slice(0, edit.at) + edit.to + value.slice(edit.at + edit.from.length), text);
}
