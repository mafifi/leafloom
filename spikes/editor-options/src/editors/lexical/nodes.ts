import { ElementNode, ParagraphNode, TextNode, $applyNodeReplacement, type NodeKey, type EditorConfig, type SerializedElementNode, type SerializedParagraphNode, type SerializedTextNode, type RangeSelection, type LexicalEditor } from 'lexical';
import type { Block } from '../../contracts';

export function newBlockId(): string { return `lexical-block-${crypto.randomUUID()}`; }

export class ChapterNode extends ElementNode {
  __chapterId: string;
  __title: string;
  static getType(): string { return 'manuscript-chapter'; }
  static clone(node: ChapterNode): ChapterNode { return new ChapterNode(node.__chapterId, node.__title, node.__key); }
  constructor(id = '', title = '', key?: NodeKey) { super(key); this.__chapterId = id; this.__title = title; }
  static importJSON(json: SerializedElementNode & { chapterId: string; title: string }): ChapterNode { return new ChapterNode(json.chapterId, json.title).updateFromJSON(json); }
  exportJSON(): SerializedElementNode & { chapterId: string; title: string } { return { ...super.exportJSON(), chapterId: this.__chapterId, title: this.__title, type: ChapterNode.getType(), version: 1 }; }
  createDOM(): HTMLElement {
    const section = document.createElement('section'); section.className = 'chapter'; section.dataset.id = this.__chapterId;
    const heading = document.createElement('h2'); heading.className = 'chapter-title'; heading.textContent = this.__title; heading.contentEditable = 'false';
    const body = document.createElement('div'); body.className = 'chapter-body'; section.append(heading, body); return section;
  }
  getDOMSlot(element: HTMLElement) { return super.getDOMSlot(element).withElement(element.querySelector<HTMLElement>('.chapter-body')!); }
  updateDOM(previous: ChapterNode, dom: HTMLElement): boolean { if (previous.__title !== this.__title) dom.querySelector('h2')!.textContent = this.__title; dom.dataset.id = this.__chapterId; return false; }
  isShadowRoot(): boolean { return true; }
}

export class ManuscriptParagraphNode extends ParagraphNode {
  __blockId: string;
  __kind: Block['kind'];
  static getType(): string { return 'manuscript-paragraph'; }
  static clone(node: ManuscriptParagraphNode): ManuscriptParagraphNode { return new ManuscriptParagraphNode(node.__blockId, node.__kind, node.__key); }
  constructor(id = newBlockId(), kind: Block['kind'] = 'paragraph', key?: NodeKey) { super(key); this.__blockId = id; this.__kind = kind; }
  static importJSON(json: SerializedParagraphNode & { blockId: string; kind: Block['kind'] }): ManuscriptParagraphNode { return new ManuscriptParagraphNode(json.blockId, json.kind).updateFromJSON(json); }
  exportJSON(): SerializedParagraphNode & { blockId: string; kind: Block['kind'] } { return { ...super.exportJSON(), blockId: this.__blockId, kind: this.__kind, type: ManuscriptParagraphNode.getType(), version: 1 }; }
  createDOM(config: EditorConfig): HTMLElement { const dom = super.createDOM(config); this.decorate(dom); return dom; }
  decorate(dom: HTMLElement): void { dom.dataset.blockId = this.__blockId; dom.dataset.kind = this.__kind; if (this.__kind === 'scene-break') dom.contentEditable = 'false'; else dom.removeAttribute('contenteditable'); dom.classList.toggle('scene-break', this.__kind === 'scene-break'); dom.classList.toggle('poetry', this.__kind === 'poetry'); }
  updateDOM(previous: ParagraphNode, dom: HTMLElement, config: EditorConfig): boolean { super.updateDOM(previous, dom, config); this.decorate(dom); return false; }
  insertNewAfter(selection: RangeSelection, restoreSelection: boolean): ManuscriptParagraphNode { const node = $applyNodeReplacement(new ManuscriptParagraphNode()); node.setTextFormat(selection.format); node.setTextStyle(selection.style); this.insertAfter(node, restoreSelection); return node; }
}

export class ManuscriptTextNode extends TextNode {
  __placeholder?: string;
  static getType(): string { return 'manuscript-text'; }
  static clone(node: ManuscriptTextNode): ManuscriptTextNode { return new ManuscriptTextNode(node.__text, node.__placeholder, node.__key); }
  constructor(text = '', placeholder?: string, key?: NodeKey) { super(text, key); this.__placeholder = placeholder; }
  afterCloneFrom(node: this): void { super.afterCloneFrom(node); this.__placeholder = node.__placeholder; }
  splitText(...offsets: number[]): TextNode[] {
    const placeholder = this.__placeholder;
    return super.splitText(...offsets).map(node => {
      if (node instanceof ManuscriptTextNode) { node.getWritable().__placeholder = placeholder; return node; }
      const replacement = $applyNodeReplacement(new ManuscriptTextNode(node.getTextContent(), placeholder));
      replacement.setFormat(node.getFormat()); replacement.setStyle(node.getStyle()); replacement.setDetail(node.getDetail()); replacement.setMode(node.getMode());
      node.replace(replacement); return replacement;
    });
  }
  isUnmergeable(): boolean { return !!this.__placeholder || super.isUnmergeable(); }
  static importJSON(json: SerializedTextNode & { placeholder?: string }): ManuscriptTextNode { return new ManuscriptTextNode(json.text, json.placeholder).updateFromJSON(json); }
  exportJSON(): SerializedTextNode & { placeholder?: string } { return { ...super.exportJSON(), type: ManuscriptTextNode.getType(), ...(this.__placeholder ? { placeholder: this.__placeholder } : {}) }; }
  createDOM(config: EditorConfig): HTMLElement { const dom = super.createDOM(config); if (this.__placeholder) dom.dataset.placeholder = this.__placeholder; return dom; }
  updateDOM(previous: this, dom: HTMLElement, config: EditorConfig): boolean { const result = super.updateDOM(previous, dom, config); if (this.__placeholder) dom.dataset.placeholder = this.__placeholder; else delete dom.dataset.placeholder; return result; }
  exportDOM(editor: LexicalEditor) { const result = super.exportDOM(editor); if (result.element instanceof HTMLElement && this.__placeholder) result.element.dataset.placeholder = this.__placeholder; return result; }
}
