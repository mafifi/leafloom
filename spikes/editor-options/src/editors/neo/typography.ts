/** Adapted from NEO app.js, MIT, Copyright (c) 2026 Hugh Howey. See LICENSE. */
export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escRe = (c: string) => c.replace(/\*/g, '\\*');
function balancedRuns(text: string, mark: string) {
  const counts: Record<number, number> = {};
  for (const run of text.match(new RegExp(escRe(mark) + '+', 'g')) || []) counts[run.length] = (counts[run.length] || 0) + 1;
  return Object.values(counts).every(n => n % 2 === 0);
}
export function mdEmphasisMatch(before: string, mark: string) {
  const m = escRe(mark);
  const edge = `(^|[^\\p{L}\\p{N}${m}\\\\])`;
  const inner = `(?!\\s|${m})(.*?[^\\s\\\\])`;
  const tries = [
    { open: 3, part: 2, bold: true, italic: true },
    { open: 2, part: 1, bold: true, italic: false },
    { open: 1, part: 0, bold: false, italic: true }
  ];
  for (const t of tries) {
    const r = before.match(new RegExp(`${edge}${m.repeat(t.open)}${inner}${m.repeat(t.part)}$`, 'u'));
    if (r && !r[2].endsWith(mark) && !(t.part === 0 && before.endsWith(mark)) && balancedRuns(r[2], mark))
      return { ...t, inner: r[2], start: before.length - (r[0].length - r[1].length) };
  }
  return null;
}
export function markdownInline(line: string) {
  const edge = '(^|[^\\p{L}\\p{N}*_\\\\])';
  const tail = '(?![\\p{L}\\p{N}])';
  let html = escapeHtml(line);
  const before = html;
  html = html.replace(new RegExp(`${edge}(\\*\\*\\*|___)(?!\\s)(.+?)(?<![\\s\\\\])\\2${tail}`, 'gu'), '$1<b><i>$3</i></b>');
  html = html.replace(new RegExp(`${edge}(\\*\\*|__)(?!\\s)(.+?)(?<![\\s\\\\])\\2${tail}`, 'gu'), '$1<b>$3</b>');
  html = html.replace(new RegExp(`${edge}(\\*|_)(?![\\s*_])(.+?)(?<![\\s\\\\*_])\\2${tail}`, 'gu'), '$1<i>$3</i>');
  return html === before ? null : html;
}
export function quoteOpenIn(text: string, open: string, close: string, straight = '') {
  let depth = 0, straights = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (straight && c === straight) straights++;
    else if (c === open && open !== close) depth++;
    else if (c === close) {
      if (close === '’' && /\p{L}/u.test(text[i - 1] || '') && /\p{L}/u.test(text[i + 1] || '')) continue;
      depth = Math.max(0, depth - 1);
    }
  }
  return depth > 0 || straights % 2 === 1;
}
export function dialogueDashes(text: string, start = true, end = true, spaced = false) {
  if (start && end && /^[\s*#•~⁂—–-]*$/.test(text)) return text;
  const edits: { at: number; from: string; to: string }[] = [];
  const open = start && text.match(/^-(?:(\s+)(?=[^\s-])|(?=[^\s\d-]))/u);
  if (open) edits.push({ at: 0, from: open[0], to: '—' + (open[1] || '') });
  const lead = !start && spaced ? ' ' : '';
  const probe = lead + text + (end ? '' : '\uE000');
  for (const m of probe.matchAll(/(?<=\s)-(?=["'“”‘’«»„]*(?:[\s.,;:!?…)\]]|$)|["'“”‘’«»„]+\uE000)/gu))
    edits.push({ at: m.index - lead.length, from: '-', to: '–' });
  return edits.reduceRight((s, e) => s.slice(0, e.at) + e.to + s.slice(e.at + e.from.length), text);
}
