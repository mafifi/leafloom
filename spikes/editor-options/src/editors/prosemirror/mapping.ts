import { Schema, type Node as PMNode, type DOMOutputSpec } from 'prosemirror-model';
import { TextSelection, type Selection as PMSelection } from 'prosemirror-state';
import type { Block, Manuscript, Run, Selection } from '../../contracts';

function blockDOM(kind: Block['kind'], node: PMNode): DOMOutputSpec {
  const attrs = { 'data-block-id': node.attrs.id as string, 'data-kind': kind };
  if (kind === 'scene-break') return ['p', { ...attrs, class: 'scene-break', contenteditable: 'false' }, '***'];
  return ['p', { ...attrs, ...(kind === 'poetry' ? { class: 'poetry', style: 'white-space: pre-wrap' } : {}) }, 0];
}

export const schema = new Schema({
  nodes: {
    doc: { content: 'chapter+' },
    chapter: {
      content: 'block+', isolating: true, attrs: { id: { default: null }, title: { default: '' } },
      parseDOM: [{ tag: 'section.chapter', contentElement: '.chapter-body', getAttrs: dom => ({ id: dom.getAttribute('data-id'), title: dom.querySelector('.chapter-title')?.textContent ?? '' }) }],
      toDOM: node => ['section', { class: 'chapter', 'data-id': node.attrs.id }, ['h2', { class: 'chapter-title', contenteditable: 'false' }, node.attrs.title], ['div', { class: 'chapter-body' }, 0]],
    },
    paragraph: { content: 'text*', group: 'block', attrs: { id: { default: null } }, parseDOM: [{ tag: 'p', getAttrs: dom => ({ id: dom.getAttribute('data-block-id') }) }], toDOM: node => blockDOM('paragraph', node) },
    poetry: { content: 'text*', group: 'block', whitespace: 'pre', attrs: { id: { default: null } }, parseDOM: [{ tag: 'p[data-kind="poetry"]', priority: 60, getAttrs: dom => ({ id: dom.getAttribute('data-block-id') }) }], toDOM: node => blockDOM('poetry', node) },
    scene_break: { group: 'block', atom: true, attrs: { id: { default: null } }, parseDOM: [{ tag: 'p[data-kind="scene-break"]', priority: 60, getAttrs: dom => ({ id: dom.getAttribute('data-block-id') }) }], toDOM: node => blockDOM('scene-break', node) },
    text: { group: 'inline' },
  },
  marks: {
    bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight', getAttrs: value => /^(bold|[6-9]00)$/.test(value) ? null : false }], toDOM: () => ['strong', 0] },
    italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }], toDOM: () => ['em', 0] },
    placeholder: { attrs: { value: {} }, parseDOM: [{ tag: 'span[data-placeholder]', getAttrs: dom => ({ value: dom.getAttribute('data-placeholder') }) }], toDOM: mark => ['span', { 'data-placeholder': mark.attrs.value, class: 'placeholder' }, 0] },
  },
});

export function toEngine(document: Manuscript): PMNode {
  return schema.nodes.doc.create(null, document.chapters.map(chapter => schema.nodes.chapter.create({ id: chapter.id, title: chapter.title }, chapter.blocks.map(block => schema.nodes[block.kind === 'scene-break' ? 'scene_break' : block.kind].create({ id: block.id }, block.runs.filter(run => run.text.length).map(run => schema.text(run.text, [run.bold ? schema.marks.bold.create() : null, run.italic ? schema.marks.italic.create() : null, run.placeholder !== undefined ? schema.marks.placeholder.create({ value: run.placeholder }) : null].filter(mark => mark !== null))))))));
}

export function fromEngine(doc: PMNode, metadata: Manuscript): Manuscript {
  const chapters: Manuscript['chapters'] = [];
  doc.forEach(chapter => {
    const blocks: Block[] = [];
    chapter.forEach(block => {
      const runs: Run[] = [];
      block.forEach(text => {
        const run: Run = { text: text.text ?? '' };
        for (const mark of text.marks) {
          if (mark.type.name === 'bold') run.bold = true;
          if (mark.type.name === 'italic') run.italic = true;
          if (mark.type.name === 'placeholder') run.placeholder = mark.attrs.value;
        }
        runs.push(run);
      });
      blocks.push({ id: block.attrs.id, kind: block.type.name === 'scene_break' ? 'scene-break' : block.type.name as Block['kind'], runs });
    });
    chapters.push({ id: chapter.attrs.id, title: chapter.attrs.title, blocks });
  });
  return { ...structuredClone(metadata), chapters };
}

export function fromSelection(selection: PMSelection): Selection | null {
  const { $from, $to } = selection;
  if (!$from.parent.isTextblock || $from.parent !== $to.parent || $from.depth < 2) return null;
  return { chapterId: $from.node(1).attrs.id, blockId: $from.parent.attrs.id, from: $from.parentOffset, to: $to.parentOffset };
}

export function toSelection(doc: PMNode, selection: Selection): TextSelection | null {
  let result: TextSelection | null = null;
  doc.forEach((chapter, chapterPosition) => {
    if (chapter.attrs.id !== selection.chapterId) return;
    chapter.forEach((block, blockPosition) => {
      if (block.attrs.id !== selection.blockId) return;
      const start = chapterPosition + blockPosition + 2;
      const clamp = (offset: number) => Math.max(0, Math.min(block.content.size, offset));
      result = TextSelection.create(doc, start + clamp(selection.from), start + clamp(selection.to));
    });
  });
  return result;
}
