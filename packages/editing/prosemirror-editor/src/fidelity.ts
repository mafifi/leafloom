import { importHTML, exportHTML, schema } from './codec';
import type { Node as PMNode } from 'prosemirror-model';
const blocks = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'PRE',
  'HR',
]);
const allowed = new Set([
  ...blocks,
  'BR',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'DEL',
  'STRIKE',
  'CODE',
  'A',
  'SPAN',
]);
const ephemeral = new Set(['data-attr', 'data-speech']);
function attrs(el: Element) {
  return Object.fromEntries(
    Array.from(el.attributes)
      .filter((a) => a.name.startsWith('data-') && !ephemeral.has(a.name))
      .map((a) => [a.name, a.value])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
/** Independent DOM inventory: text/marks, block boundaries, classes, data and atoms. */
export function inventory(document: Document, html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  const tokens: unknown[] = [];
  const canonical = (tag: string) =>
    ({ DIV: 'P', STRONG: 'B', EM: 'I', DEL: 'S', STRIKE: 'S' })[tag] || tag;
  function text(value: string, marks: unknown[]) {
    const m = JSON.stringify(
      marks.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
    const last = tokens.at(-1) as { text?: string; marks?: string } | undefined;
    if (last?.marks === m && typeof last.text === 'string') last.text += value;
    else tokens.push({ text: value, marks: m });
  }
  function visit(node: Node, marks: unknown[], inPre = false) {
    if (node.nodeType === 3) {
      text(node.textContent || '', marks);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = canonical(el.tagName);
    if (el.matches('.ProseMirror-widget,br.ProseMirror-trailingBreak')) return;
    const classes = Array.from(el.classList)
        .filter((c) => !c.startsWith('ProseMirror-'))
        .join(' '),
      data = attrs(el),
      align = el.style.textAlign || el.getAttribute('align') || null;
    if (el.matches('span.ph-mark,span.darling-anchor')) {
      tokens.push({
        atom: el.matches('.ph-mark') ? 'placeholder' : 'darling_anchor',
        classes,
        data,
      });
      return;
    }
    if (tag === 'BR') {
      tokens.push({ break: true, marks: JSON.stringify(marks) });
      return;
    }
    if (blocks.has(el.tagName)) {
      tokens.push({
        start: tag,
        classes,
        data,
        align,
        ...(tag === 'OL' ? { order: el.getAttribute('start') || '1' } : {}),
      });
    }
    const next = marks.slice();
    const add = (m: unknown) => {
      if (!next.some((v) => JSON.stringify(v) === JSON.stringify(m))) next.push(m);
    };
    if (['B', 'I', 'U', 'S'].includes(tag)) add(tag);
    if (tag === 'CODE' && !inPre) add('CODE');
    if (tag === 'A' && el.hasAttribute('href'))
      add({ link: el.getAttribute('href'), title: el.getAttribute('title') });
    if (tag === 'SPAN' && (classes || Object.keys(data).length || align))
      add({ annotation: { classes, data, align } });
    if (/^(bold|bolder|[6-9]\d{2})$/.test(el.style.fontWeight)) add('B');
    if (el.style.fontStyle === 'italic') add('I');
    if (el.style.textDecoration.includes('underline')) add('U');
    if (el.style.textDecoration.includes('line-through')) add('S');
    for (const child of Array.from(el.childNodes)) visit(child, next, inPre || tag === 'PRE');
    if (blocks.has(el.tagName)) tokens.push({ end: tag });
  }
  const hasBlock = Array.from(root.children).some((e) => blocks.has(e.tagName));
  if (!hasBlock) tokens.push({ start: 'P', classes: '', data: {}, align: null });
  for (const child of Array.from(root.childNodes)) {
    if (hasBlock && child.nodeType === 3 && /^[\t\n\r ]*$/.test(child.textContent || '')) continue;
    visit(child, []);
  }
  if (!hasBlock) tokens.push({ end: 'P' });
  return JSON.stringify(tokens);
}
export function inspectHTML(
  document: Document,
  html: string,
): { supported: boolean; model: PMNode; reason: string | null } {
  const template = document.createElement('template');
  template.innerHTML = html;
  let reason: string | null = document.createTreeWalker(template.content, 128).nextNode()
    ? 'UNSUPPORTED_COMMENT'
    : null;
  for (const el of Array.from(template.content.querySelectorAll('*'))) {
    const tag = el.tagName,
      style = (el as HTMLElement).style;
    if (!allowed.has(tag)) {
      reason = 'UNSUPPORTED_TAG';
      break;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      const block = blocks.has(tag),
        atom = el.matches('span.ph-mark,span.darling-anchor');
      const common =
        (name === 'class' || /^data-[a-z][a-z0-9-]*$/.test(name)) && (block || tag === 'SPAN');
      const specific =
        ((name === 'href' || name === 'title') && tag === 'A') ||
        (name === 'start' && tag === 'OL') ||
        (name === 'contenteditable' && atom) ||
        (name === 'align' && block);
      if (!common && !specific && name !== 'style') {
        reason = 'UNSUPPORTED_ATTRIBUTE';
        break;
      }
    }
    for (const property of Array.from(style))
      if (!['text-align', 'font-weight', 'font-style', 'text-decoration'].includes(property))
        reason = 'UNSUPPORTED_STYLE';
    if (
      (style.fontStyle && style.fontStyle !== 'italic') ||
      (style.fontWeight && !/^(bold|bolder|[6-9]\d{2})$/.test(style.fontWeight)) ||
      (style.textDecoration &&
        !/^(underline|line-through)( (underline|line-through))?$/.test(style.textDecoration))
    )
      reason = 'UNSUPPORTED_STYLE';
    if (tag === 'A' && el.hasAttribute('href')) {
      const href = (el.getAttribute('href') || '').trim().replace(/[\u0000-\u0020]/g, '');
      if (
        /^(?:javascript|vbscript|data):/i.test(href) ||
        (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^(?:https?|mailto|tel):/i.test(href))
      )
        reason = 'UNSUPPORTED_LINK';
    }
  }
  const safeRoot = document.createElement('div');
  safeRoot.append(template.content.cloneNode(true));
  const model = importHTML(document, safeRoot.innerHTML);
  if (!reason && inventory(document, html) !== inventory(document, exportHTML(document, model)))
    reason = 'SEMANTIC_MISMATCH';
  return { supported: reason === null, model, reason };
}
export function baseNode(node: PMNode): PMNode {
  return schema.nodeFromJSON(node.toJSON());
}
