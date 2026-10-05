/** Screenplay codecs use the NEO 1.3.5 element vocabulary; upstream MIT attribution is in NOTICE. */
import { JSDOM } from 'jsdom';
import {
  ScreenplayScript,
  ScreenplayElement,
  inferScreenplayElement,
  legacyScreenplayClasses,
  screenplayElementFromLegacyClass,
  type ScreenplayScriptValue,
  type ScreenplayRunValue,
  type ScreenplayLineValue,
  type ScreenplayElementValue,
} from '@leafloom/document-contracts';
export class ScreenplayCodecError extends Error {
  readonly code = 'UNSUPPORTED_SCREENPLAY';
  constructor() { super('UNSUPPORTED_SCREENPLAY'); }
}
const names: Record<ScreenplayElementValue, string> = {
  'scene-heading': 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
};
const styles = {
  italic: 'Italic',
  bold: 'Bold',
  underline: 'Underline',
  strike: 'Strikeout',
} as const;
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (line: ScreenplayLineValue) => line.runs.map((r) => r.text).join('');
function normalizeRuns(runs: ScreenplayRunValue[]): ScreenplayRunValue[] {
  const result: ScreenplayRunValue[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const marks = Object.keys(styles).filter((mark) =>
      run.marks.includes(mark as keyof typeof styles),
    ) as ScreenplayRunValue['marks'];
    const last = result.at(-1);
    if (last && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += run.text;
    else result.push({ text: run.text, marks });
  }
  return result;
}
export function screenplayHTML(lines: ScreenplayLineValue[]): string {
  return lines
    .map(
      (line) =>
        `<p class="${legacyScreenplayClasses[line.element]}" data-screenplay="${line.element}">${line.runs
          .map((run) => {
            let text = escape(run.text).replace(/\n/g, '<br>');
            for (const mark of run.marks) {
              const tag = { italic: 'i', bold: 'b', underline: 'u', strike: 's' }[mark];
              text = `<${tag}>${text}</${tag}>`;
            }
            return text;
          })
          .join('')}</p>`,
    )
    .join('');
}
export function screenplayFromHTML(
  chapters: string[],
  title: ScreenplayScriptValue['title'],
): ScreenplayScriptValue {
  const lines: ScreenplayLineValue[] = [];
  for (const html of chapters) {
    const fragment = JSDOM.fragment(html);
    for (const node of Array.from(fragment.childNodes)) {
      if (node.nodeType === 3 && !node.textContent?.trim()) continue;
      if (node.nodeType !== 1 || (node as Element).tagName !== 'P')
        throw new ScreenplayCodecError();
      const paragraph = node as Element,
        semantic = paragraph.getAttribute('data-screenplay');
      const element = semantic
        ? ScreenplayElement.parse(semantic)
        : screenplayElementFromLegacyClass(paragraph.className) || 'action';
      const runs: ScreenplayRunValue[] = [];
      function walk(child: Node, marks: ScreenplayRunValue['marks']): void {
        if (child.nodeType === 3) {
          runs.push({ text: child.textContent || '', marks });
          return;
        }
        if (child.nodeType !== 1) throw new ScreenplayCodecError();
        const el = child as Element,
          mark = (
            {
              B: 'bold',
              STRONG: 'bold',
              I: 'italic',
              EM: 'italic',
              U: 'underline',
              S: 'strike',
              DEL: 'strike',
              STRIKE: 'strike',
            } as const
          )[el.tagName as 'B'];
        if (el.tagName === 'BR') {
          runs.push({ text: '\n', marks });
          return;
        }
        if (!mark) throw new ScreenplayCodecError();
        for (const nested of Array.from(el.childNodes)) walk(nested, [...marks, mark]);
      }
      for (const child of Array.from(paragraph.childNodes)) walk(child, []);
      lines.push({ element, runs: normalizeRuns(runs) });
    }
  }
  return ScreenplayScript.parse({ title, lines });
}
function fountainRuns(text: string): ScreenplayRunValue[] {
  const runs: ScreenplayRunValue[] = [],
    active = new Set<ScreenplayRunValue['marks'][number]>();
  const tokens = text.split(/(\*\*\*|\*\*|\*|_)/);
  const markers: Record<string, ScreenplayRunValue['marks']> = {
    '***': ['italic', 'bold'],
    '**': ['bold'],
    '*': ['italic'],
    _: ['underline'],
  };
  for (const token of tokens) {
    const toggles = markers[token];
    if (toggles) {
      for (const mark of toggles) active.has(mark) ? active.delete(mark) : active.add(mark);
    } else if (token) runs.push({ text: token, marks: [...active] });
  }
  if (active.size) throw new ScreenplayCodecError();
  return normalizeRuns(runs);
}
export function readScreenplay(source: string, format: 'fdx' | 'fountain'): ScreenplayScriptValue {
  if (format === 'fdx') {
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw Error('INVALID');
    let document: Document;
    try {
      document = new JSDOM(source, { contentType: 'application/xml' }).window.document;
    } catch {
      throw Error('INVALID');
    }
    if (document.documentElement.tagName !== 'FinalDraft') throw Error('INVALID');
    const content = document.querySelector('FinalDraft > Content');
    if (!content) throw Error('INVALID');
    const lines: ScreenplayLineValue[] = [];
    for (const paragraph of Array.from(content.children)) {
      if (paragraph.tagName !== 'Paragraph') throw new ScreenplayCodecError();
      const element = ScreenplayElement.options.find(
        (k) => names[k] === paragraph.getAttribute('Type'),
      );
      if (!element) throw new ScreenplayCodecError();
      const runs = Array.from(paragraph.children).map((text) => {
        if (text.tagName !== 'Text' || text.children.length) throw new ScreenplayCodecError();
        const labels = (text.getAttribute('Style') || '').split('+').filter(Boolean);
        if (labels.some((label) => !Object.values(styles).includes(label as 'Italic')))
          throw new ScreenplayCodecError();
        return {
          text: text.textContent || '',
          marks: Object.keys(styles).filter((k) =>
            labels.includes(styles[k as keyof typeof styles]),
          ) as ScreenplayRunValue['marks'],
        };
      });
      lines.push({ element, runs: normalizeRuns(runs) });
    }
    const titleRows = Array.from(document.querySelectorAll('TitlePage > Content > Paragraph'))
      .map((p) => ({
        align: (p.getAttribute('Alignment') || 'Center').toLowerCase(),
        text: p.textContent || '',
      }))
      .filter((p) => p.text.trim());
    const centered = titleRows.filter((p) => p.align === 'center').map((p) => p.text);
    const title: ScreenplayScriptValue['title'] = { title: centered[0] || '', author: '' };
    const credit =
      centered[1] && /^(?:written by|screenplay by|teleplay by|story by|by)$/i.test(centered[1]);
    if (credit) {
      title.credit = centered[1];
      title.author = centered[2] || '';
    } else title.author = centered[1] || '';
    if (
      centered.length > (credit ? 3 : 2) ||
      titleRows.some((p) => !['center', 'left', 'right'].includes(p.align))
    )
      throw new ScreenplayCodecError();
    const contact = titleRows
        .filter((p) => p.align === 'left')
        .map((p) => p.text)
        .join('\n'),
      draft = titleRows
        .filter((p) => p.align === 'right')
        .map((p) => p.text)
        .join('\n');
    if (contact) title.contact = contact;
    if (draft) title.draft = draft;
    return ScreenplayScript.parse({ title, lines });
  }
  if (/\[\[|\/\*|^\s*(?:#|=|~|===)/m.test(source)) throw new ScreenplayCodecError();
  const rows = source.replace(/\r\n?/g, '\n').split('\n'),
    title: ScreenplayScriptValue['title'] = { title: '', author: '' };
  let cursor = 0;
  while (cursor < rows.length) {
    const match = /^(Title|Author|Credit|Draft date|Contact):\s*(.*)$/i.exec(rows[cursor]);
    if (!match) break;
    const key = (
      {
        title: 'title',
        author: 'author',
        credit: 'credit',
        'draft date': 'draft',
        contact: 'contact',
      } as const
    )[match[1].toLowerCase() as 'title'];
    title[key] = match[2];
    cursor++;
  }
  const lines: ScreenplayLineValue[] = [];
  let speech = false;
  for (const row of rows.slice(cursor)) {
    const text = row.trim();
    if (!text) {
      speech = false;
      continue;
    }
    let element: ScreenplayElementValue,
      body = text;
    if (text.startsWith('.')) {
      element = 'scene-heading';
      body = text.slice(1);
    } else if (text.startsWith('@')) {
      element = 'character';
      body = text.slice(1);
    } else if (text.startsWith('>')) {
      element = 'transition';
      body = text.slice(1);
    } else if (text.startsWith('!')) {
      element = 'action';
      body = text.slice(1);
    } else if (speech) {
      element = text.startsWith('(') ? 'parenthetical' : 'dialogue';
    } else element = inferScreenplayElement(text);
    lines.push({ element, runs: fountainRuns(body) });
    speech = element === 'character' || element === 'parenthetical' || element === 'dialogue';
  }
  return ScreenplayScript.parse({ title, lines });
}
function verifiedExchange(
  script: ScreenplayScriptValue,
  source: string,
  format: 'fdx' | 'fountain',
): string {
  const decoded = readScreenplay(source, format);
  const original = {
    ...script,
    lines: script.lines.map((line) => ({ ...line, runs: normalizeRuns(line.runs) })),
  };
  if (JSON.stringify(decoded) !== JSON.stringify(original)) throw new ScreenplayCodecError();
  return source;
}
export function writeScreenplay(raw: unknown, format: 'fdx' | 'fountain'): string {
  const script = ScreenplayScript.parse(raw);
  if (format === 'fdx') {
    const paragraphs = script.lines
      .map(
        (line) =>
          `<Paragraph Type="${names[line.element]}">${line.runs.map((run) => `<Text${run.marks.length ? ` Style="${run.marks.map((mark) => styles[mark]).join('+')}"` : ''}>${escape(run.text)}</Text>`).join('')}</Paragraph>`,
      )
      .join('\n');
    if (
      script.title.credit &&
      !/^(?:written by|screenplay by|teleplay by|story by|by)$/i.test(script.title.credit)
    )
      throw new ScreenplayCodecError();
    const titleParagraph = (text: string, align: string) =>
      `<Paragraph Alignment="${align}"><Text>${escape(text)}</Text></Paragraph>`;
    const titlePage =
      titleParagraph(script.title.title, 'Center') +
      (script.title.credit ? titleParagraph(script.title.credit, 'Center') : '') +
      titleParagraph(script.title.author, 'Center') +
      (script.title.contact ? titleParagraph(script.title.contact, 'Left') : '') +
      (script.title.draft ? titleParagraph(script.title.draft, 'Right') : '');
    return verifiedExchange(
      script,
      `<?xml version="1.0" encoding="UTF-8"?><FinalDraft DocumentType="Script" Version="1"><Content>${paragraphs}</Content><TitlePage><Content>${titlePage}</Content></TitlePage></FinalDraft>\n`,
      'fdx',
    );
  }
  const labels = {
    title: 'Title',
    author: 'Author',
    credit: 'Credit',
    draft: 'Draft date',
    contact: 'Contact',
  } as const;
  const rows = Object.entries(script.title).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [];
    if (value.includes('\n') || value.trim() !== value) throw new ScreenplayCodecError();
    return [`${labels[key as keyof typeof labels]}: ${value}`];
  });
  rows.push('');
  let speech = false;
  let previous: ScreenplayElementValue | null = null;
  for (const line of script.lines) {
    if (
      line.element === 'shot' ||
      plain(line).trim() !== plain(line) ||
      plain(line).includes('\n') ||
      (['dialogue', 'parenthetical'].includes(line.element) && !speech) ||
      (line.element === 'dialogue' && previous === 'dialogue')
    )
      throw new ScreenplayCodecError();
    let text = line.runs
      .map((run) => {
        if (run.marks.includes('strike') || /[*_\\]/.test(run.text))
          throw new ScreenplayCodecError();
        let t = run.text;
        if (run.marks.includes('underline')) t = '_' + t + '_';
        if (run.marks.includes('bold')) t = '**' + t + '**';
        if (run.marks.includes('italic')) t = '*' + t + '*';
        return t;
      })
      .join('');
    if (!speech || !['dialogue', 'parenthetical'].includes(line.element)) rows.push('');
    const prefix: Partial<Record<ScreenplayElementValue, string>> = {
      'scene-heading': '.',
      character: '@',
      transition: '>',
      shot: '!',
    };
    if (
      line.element === 'action' &&
      (inferScreenplayElement(plain(line)) !== 'action' || /^[.!@~>#=\[]/.test(text))
    )
      text = '!' + text;
    text = (prefix[line.element] || '') + text;
    rows.push(text);
    speech = ['character', 'dialogue', 'parenthetical'].includes(line.element);
    previous = line.element;
  }
  return verifiedExchange(script, rows.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', 'fountain');
}
