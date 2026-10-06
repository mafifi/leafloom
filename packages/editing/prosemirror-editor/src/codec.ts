import {
  ScreenplayElement,
  screenplayElementFromLegacyClass,
  legacyScreenplayClasses,
} from '@leafloom/document-contracts';
import {
  DOMParser,
  DOMSerializer,
  Schema,
  type Attrs,
  type DOMOutputSpec,
  type MarkSpec,
  type Node as PMNode,
  type NodeSpec,
  type ParseOptions,
} from 'prosemirror-model';

/** NEO's readable HTML is the boundary format; the editor owns native PM nodes. */
type DataAttributes = Record<string, string>;
const baseAttrs = { class: { default: '' }, align: { default: null }, data: { default: {} } };
const ephemeral = new Set(['data-attr', 'data-speech', 'data-first', 'data-walk', 'data-pg', 'data-fill', 'data-contd', 'data-ghost', 'data-ghost-empty']);
const alignments = new Set(['left', 'center', 'right', 'justify']);

function element(value: HTMLElement | string): HTMLElement {
  if (typeof value === 'string') throw new TypeError('An element parse rule received text');
  return value;
}
function readAttributes(el: HTMLElement): Attrs {
  const data: DataAttributes = {};
  for (const attr of Array.from(el.attributes).sort((a, b) => a.name.localeCompare(b.name))) {
    if (/^data-[a-z][a-z0-9-]*$/.test(attr.name) && !ephemeral.has(attr.name))
      data[attr.name] = attr.value;
  }
  const classes = Array.from(el.classList)
    .filter((name) => /^[A-Za-z_][\w-]*$/.test(name) && !name.startsWith('ProseMirror-'))
    .join(' ');
  const alignment = el.style.textAlign || el.getAttribute('align');
  return { class: classes, align: alignment && alignments.has(alignment) ? alignment : null, data };
}
function writeAttributes(attrs: Attrs): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof attrs.class === 'string' && attrs.class) out.class = attrs.class;
  if (typeof attrs.align === 'string' && alignments.has(attrs.align))
    out.style = `text-align: ${attrs.align}`;
  const data = attrs.data as DataAttributes | undefined;
  for (const key of Object.keys(data || {}).sort()) {
    if (/^data-[a-z][a-z0-9-]*$/.test(key) && !ephemeral.has(key)) out[key] = String(data![key]);
  }
  return out;
}
function readParagraphAttributes(el: HTMLElement): Attrs {
  const attrs = readAttributes(el);
  const semantic = ScreenplayElement.safeParse(el.getAttribute('data-screenplay'));
  const screenplay = semantic.success
    ? semantic.data
    : screenplayElementFromLegacyClass(el.className);
  return { ...attrs, screenplay };
}
function writeParagraphAttributes(attrs: Attrs): Record<string, string> {
  const out = writeAttributes(attrs);
  if (attrs.screenplay) out['data-screenplay'] = ScreenplayElement.parse(attrs.screenplay);
  return out;
}
function block(tag: string, content = 'inline*'): NodeSpec {
  return {
    group: 'block',
    content,
    attrs: baseAttrs,
    parseDOM: [{ tag, getAttrs: (value) => readAttributes(element(value)) }],
    toDOM: (node) => [tag, writeAttributes(node.attrs), 0] as DOMOutputSpec,
  };
}
function safeHref(value: string): string | null {
  const compact = value.trim().replace(/[\u0000-\u0020]/g, '');
  if (/^(?:javascript|vbscript|data):/i.test(compact)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(compact) && !/^(?:https?|mailto|tel):/i.test(compact))
    return null;
  return value;
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: {
    ...block('p'),
    attrs: { ...baseAttrs, screenplay: { default: null } },
    toDOM: (node) => ['p', writeParagraphAttributes(node.attrs), 0],
    parseDOM: ['p', 'div'].map((tag) => ({
      tag,
      getAttrs: (value) => readParagraphAttributes(element(value)),
    })),
  },
  heading: {
    ...block('h1'),
    attrs: { ...baseAttrs, level: { default: 1 } },
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      getAttrs: (value) => ({ ...readAttributes(element(value)), level }),
    })),
    toDOM: (node) => [
      `h${Math.min(6, Math.max(1, Number(node.attrs.level)))}`,
      writeAttributes(node.attrs),
      0,
    ],
  },
  blockquote: { ...block('blockquote', 'block+'), defining: true },
  bullet_list: block('ul', 'list_item+'),
  ordered_list: {
    ...block('ol', 'list_item+'),
    attrs: { ...baseAttrs, order: { default: 1 } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (value) => {
          const el = element(value);
          const parsed = Number.parseInt(el.getAttribute('start') || '1', 10);
          return { ...readAttributes(el), order: Number.isFinite(parsed) ? parsed : 1 };
        },
      },
    ],
    toDOM: (node) => [
      'ol',
      {
        ...writeAttributes(node.attrs),
        ...(node.attrs.order !== 1 ? { start: String(node.attrs.order) } : {}),
      },
      0,
    ],
  },
  list_item: { ...block('li', 'paragraph block*'), defining: true },
  code_block: {
    ...block('pre', 'text*'),
    attrs: { ...baseAttrs, codeWrapper: { default: true } },
    code: true,
    marks: '',
    defining: true,
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (value) => {
          const el = element(value);
          return { ...readAttributes(el), codeWrapper: el.querySelector(':scope > code') !== null };
        },
      },
    ],
    toDOM: (node) =>
      node.attrs.codeWrapper
        ? ['pre', writeAttributes(node.attrs), ['code', 0]]
        : ['pre', writeAttributes(node.attrs), 0],
  },
  horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['hr'] },
  text: { group: 'inline' },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },
  placeholder: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    attrs: { sid: { default: '' }, class: { default: 'ph-mark' }, data: { default: {} } },
    parseDOM: [
      {
        tag: 'span.ph-mark',
        priority: 100,
        getAttrs: (value) => {
          const el = element(value);
          const attrs = readAttributes(el);
          const data = { ...(attrs.data as DataAttributes) };
          delete data['data-sid'];
          return { sid: el.getAttribute('data-sid') || '', class: attrs.class, data };
        },
      },
    ],
    toDOM: (node) => [
      'span',
      {
        ...writeAttributes(node.attrs),
        class: node.attrs.class || 'ph-mark',
        'data-sid': node.attrs.sid,
        contenteditable: 'false',
      },
      '⚑',
    ],
  },
  darling_anchor: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: false,
    attrs: { did: { default: '' }, class: { default: 'darling-anchor' }, data: { default: {} } },
    parseDOM: [
      {
        tag: 'span.darling-anchor',
        priority: 100,
        getAttrs: (value) => {
          const el = element(value);
          const attrs = readAttributes(el);
          const data = { ...(attrs.data as DataAttributes) };
          delete data['data-did'];
          return { did: el.getAttribute('data-did') || '', class: attrs.class, data };
        },
      },
    ],
    toDOM: (node) => [
      'span',
      {
        ...writeAttributes(node.attrs),
        class: node.attrs.class || 'darling-anchor',
        'data-did': node.attrs.did,
        contenteditable: 'false',
      },
    ],
  },
};

const marks: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [
      {
        tag: 'b',
        getAttrs: (value) => !/^(?:normal|400)$/i.test(element(value).style.fontWeight) && null,
      },
      { tag: 'strong' },
      {
        style: 'font-weight',
        getAttrs: (value) => (/^(?:bold|bolder|[6-9]\d{2})$/.test(value) ? null : false),
      },
    ],
    toDOM: () => ['b', 0],
  },
  italic: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM: () => ['i', 0],
  },
  underline: {
    parseDOM: [
      { tag: 'u' },
      {
        style: 'text-decoration',
        getAttrs: (value) => (value.includes('underline') ? null : false),
      },
    ],
    toDOM: () => ['u', 0],
  },
  strike: {
    parseDOM: [
      { tag: 's' },
      { tag: 'del' },
      { tag: 'strike' },
      {
        style: 'text-decoration',
        getAttrs: (value) => (value.includes('line-through') ? null : false),
      },
    ],
    toDOM: () => ['s', 0],
  },
  code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (value) => {
          const el = element(value);
          const href = safeHref(el.getAttribute('href') || '');
          return href === null ? false : { href, title: el.getAttribute('title') };
        },
      },
    ],
    toDOM: (mark) => [
      'a',
      {
        href: safeHref(String(mark.attrs.href)) || '',
        ...(mark.attrs.title ? { title: mark.attrs.title } : {}),
      },
      0,
    ],
  },
  annotation: {
    attrs: baseAttrs,
    parseDOM: [
      {
        tag: 'span',
        getAttrs: (value) => {
          const el = element(value);
          if (el.matches('.ph-mark,.darling-anchor')) return false;
          const attrs = readAttributes(el);
          return attrs.class || Object.keys(attrs.data as DataAttributes).length || attrs.align
            ? attrs
            : false;
        },
      },
    ],
    toDOM: (mark) => ['span', writeAttributes(mark.attrs), 0],
  },
};

export const schema = new Schema({ nodes, marks });

/** Parse a detached copy while keeping public parser position probes tied to the live DOM. */
export function parseHTMLDOM(root: HTMLElement, options: ParseOptions = {}): PMNode {
  const copy = root.cloneNode(true) as HTMLElement;
  const copies = new WeakMap<Node, Node>();
  function pair(source: Node, clone: Node): void {
    copies.set(source, clone);
    Array.from(source.childNodes).forEach((child, index) => pair(child, clone.childNodes[index]));
  }
  pair(root, copy);
  copy
    .querySelectorAll(
      'script,style,meta,link,iframe,object,embed,img,svg,math,br.ProseMirror-trailingBreak,.ProseMirror-widget',
    )
    .forEach((node) => node.remove());
  // NEO renders its block container with normal whitespace, and each author paragraph pre-wrap.
  // Pretty-printed separators therefore have no visible height and must not become new paragraphs.
  if (
    Array.from(copy.children).some((child) =>
      /^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|PRE|HR)$/.test(child.tagName),
    )
  ) {
    Array.from(copy.childNodes)
      .filter((node) => node.nodeType === 3 && /^[\t\n\r ]*$/.test(node.textContent || ''))
      .forEach((node) => node.remove());
  }
  const originalPoints = options.findPositions || [];
  const mappedPoints = originalPoints.map((point) => {
    let source = point.node,
      offset = point.offset,
      clone = copies.get(source);
    // A probe inside a discarded formatting node belongs at its original parent's boundary.
    while (source !== root && (!clone || !copy.contains(clone))) {
      const parent = source.parentNode;
      if (!parent) break;
      offset = Array.from(parent.childNodes).indexOf(source as ChildNode);
      source = parent;
      clone = copies.get(source);
    }
    if (!clone || (clone !== copy && !copy.contains(clone)))
      throw new TypeError('A parser position probe must belong to the supplied DOM root');
    if (source.nodeType !== 3) {
      offset = Array.from(source.childNodes)
        .slice(0, offset)
        .filter((child) => copies.get(child)?.parentNode === clone).length;
    }
    return { node: clone, offset, pos: undefined as number | undefined };
  });
  const model = DOMParser.fromSchema(schema).parse(copy, {
    preserveWhitespace: 'full',
    ...options,
    findPositions: mappedPoints,
  });
  mappedPoints.forEach((point, index) => {
    originalPoints[index].pos = point.pos;
  });
  return model;
}

export function importHTML(document: Document, html: string): PMNode {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content
    .querySelectorAll('script,style,meta,link,iframe,object,embed,img,svg,math')
    .forEach((node) => node.remove());
  const container = document.createElement('div');
  container.appendChild(template.content);
  return parseHTMLDOM(container);
}

export function exportHTML(document: Document, node: PMNode): string {
  if (node.type.schema !== schema)
    throw new TypeError('Cannot serialize a document from another editor schema');
  const container = document.createElement('div');
  container.appendChild(
    DOMSerializer.fromSchema(schema).serializeFragment(node.content, { document }),
  );
  return container.innerHTML;
}
/** A detached, editor-schema preview of imported rich fragments. */
export function sanitizeHTML(document: Document, html: string): string {
  return exportHTML(document, importHTML(document, html));
}
