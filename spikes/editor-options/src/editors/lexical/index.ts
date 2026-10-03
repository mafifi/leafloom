import { createEditor, $getRoot, $getSelection, $isRangeSelection, $isTextNode, $isElementNode, $isLineBreakNode, $createRangeSelection, $setSelection, $applyNodeReplacement, ParagraphNode, TextNode, FORMAT_TEXT_COMMAND, PASTE_COMMAND, COMMAND_PRIORITY_HIGH, HISTORY_MERGE_TAG, type LexicalEditor, type LexicalNode, type PointType } from 'lexical';
import { registerRichText } from '@lexical/rich-text';
import { registerHistory, createEmptyHistoryState } from '@lexical/history';
import { $generateNodesFromDOM } from '@lexical/html';
import type { ManuscriptEditor, Manuscript, Selection, EditorCallbacks, ChangeReason, Run } from '../../contracts';
import { ChapterNode, ManuscriptParagraphNode, ManuscriptTextNode } from './nodes';

/** Only author text, paragraph boundaries and bold/italic survive imported HTML. */
export function sanitizePaste(html: string): Document {
  const source = new DOMParser().parseFromString(html, 'text/html');
  const clean = document.implementation.createHTMLDocument('');
  const copy = (node: Node, into: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) { into.appendChild(clean.createTextNode(node.textContent ?? '')); return; }
    if (!(node instanceof Element) || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'TEMPLATE'].includes(node.tagName)) return;
    const tag = ['STRONG', 'B'].includes(node.tagName) ? 'strong' : ['EM', 'I'].includes(node.tagName) ? 'em' : node.tagName === 'BR' ? 'br' : ['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE', 'PRE'].includes(node.tagName) ? 'p' : null;
    const target = tag ? clean.createElement(tag) : into;
    if (tag) into.appendChild(target);
    for (const child of node.childNodes) copy(child, target);
  };
  for (const child of source.body.childNodes) copy(child, clean.body);
  return clean;
}

export function createLexicalEditor(): ManuscriptEditor {
  let editor: LexicalEditor | null = null;
  let metadata: Manuscript;
  let callbacks: EditorCallbacks;
  let root: HTMLElement | null = null;
  let cleanup: (() => void)[] = [];
  let signature = '';
  let reason: ChangeReason = 'typing';
  let composing = false;
  let lastSelection = '';
  const getEditor = (): LexicalEditor => { if (!editor) throw new Error('Lexical adapter is not mounted'); return editor; };
  function paragraphOf(node: LexicalNode): ManuscriptParagraphNode | null {
    let current: LexicalNode | null = node;
    while (current && !(current instanceof ManuscriptParagraphNode)) current = current.getParent();
    return current instanceof ManuscriptParagraphNode ? current : null;
  }
  function pointOffset(point: PointType, block: ManuscriptParagraphNode): number {
    const target = point.getNode();
    let offset = 0;
    function visit(node: LexicalNode): boolean {
      if (node === target) {
        offset += point.type === 'text' ? point.offset : $isElementNode(node) ? node.getChildren().slice(0, point.offset).reduce((sum, child) => sum + child.getTextContentSize(), 0) : 0;
        return true;
      }
      if ($isElementNode(node)) { for (const child of node.getChildren()) if (visit(child)) return true; }
      else offset += node.getTextContentSize();
      return false;
    }
    visit(block); return offset;
  }
  function currentSelection(): Selection | null {
    const selection = $getSelection(); if (!$isRangeSelection(selection)) return null;
    const a = paragraphOf(selection.anchor.getNode()), b = paragraphOf(selection.focus.getNode());
    if (!a || a !== b) return null;
    const chapter = a.getParent(); if (!(chapter instanceof ChapterNode)) return null;
    const from = pointOffset(selection.anchor, a), to = pointOffset(selection.focus, a);
    return { chapterId: chapter.__chapterId, blockId: a.__blockId, from: Math.min(from, to), to: Math.max(from, to) };
  }
  function readDocument(): Manuscript {
    const chapters = $getRoot().getChildren().filter((node): node is ChapterNode => node instanceof ChapterNode).map(chapter => ({ id: chapter.__chapterId, title: chapter.__title, blocks: chapter.getChildren().filter((node): node is ManuscriptParagraphNode => node instanceof ManuscriptParagraphNode).map(block => {
      const runs: Run[] = [];
      const collect = (node: LexicalNode): void => {
        if ($isTextNode(node)) {
          const run: Run = { text: node.getTextContent(), ...(node.hasFormat('bold') ? { bold: true } : {}), ...(node.hasFormat('italic') ? { italic: true } : {}), ...(node instanceof ManuscriptTextNode && node.__placeholder ? { placeholder: node.__placeholder } : {}) };
          const previous = runs.at(-1);
          if (previous && previous.bold === run.bold && previous.italic === run.italic && previous.placeholder === run.placeholder) previous.text += run.text; else runs.push(run);
        } else if ($isLineBreakNode(node)) runs.push({ text: '\n' });
        else if ($isElementNode(node)) node.getChildren().forEach(collect);
      };
      block.getChildren().forEach(collect);
      return { id: block.__blockId, kind: block.__kind, runs: block.__kind === 'scene-break' ? [] : runs.length ? runs : [{ text: '' }] };
    }) }));
    return { ...structuredClone(metadata), chapters };
  }
  function setSelection(selection: Selection): void {
    const chapter = $getRoot().getChildren().find(node => node instanceof ChapterNode && node.__chapterId === selection.chapterId);
    if (!(chapter instanceof ChapterNode)) return;
    const block = chapter.getChildren().find(node => node instanceof ManuscriptParagraphNode && node.__blockId === selection.blockId);
    if (!(block instanceof ManuscriptParagraphNode)) return;
    const range = $createRangeSelection();
    const assign = (point: PointType, desired: number): void => {
      let remaining = Math.max(0, Math.min(desired, block.getTextContentSize()));
      const texts = block.getAllTextNodes();
      for (const text of texts) { const size = text.getTextContentSize(); if (remaining <= size) { point.set(text.getKey(), remaining, 'text'); return; } remaining -= size; }
      point.set(block.getKey(), block.getChildrenSize(), 'element');
    };
    assign(range.anchor, selection.from); assign(range.focus, selection.to);
    const anchor = range.anchor.getNode(); if ($isTextNode(anchor)) { range.format = anchor.getFormat(); range.style = anchor.getStyle(); }
    $setSelection(range);
  }
  function replace(document: Manuscript, selection?: Selection | null): void {
    metadata = structuredClone(document);
    getEditor().update(() => {
      const lexicalRoot = $getRoot(); lexicalRoot.clear();
      for (const chapter of document.chapters) {
        const section = $applyNodeReplacement(new ChapterNode(chapter.id, chapter.title));
        for (const block of chapter.blocks) {
          const paragraph = $applyNodeReplacement(new ManuscriptParagraphNode(block.id, block.kind));
          for (const run of block.kind === 'scene-break' ? [{ text: '***' }] : block.runs) {
            const text = $applyNodeReplacement(new ManuscriptTextNode(run.text, 'placeholder' in run ? run.placeholder : undefined));
            if ('bold' in run && run.bold) text.toggleFormat('bold'); if ('italic' in run && run.italic) text.toggleFormat('italic'); paragraph.append(text);
          }
          section.append(paragraph);
        }
        lexicalRoot.append(section);
      }
      if (selection) setSelection(selection); else $setSelection(null);
      signature = JSON.stringify(readDocument().chapters);
    }, { discrete: true, tag: ['adapter-replace', HISTORY_MERGE_TAG] });
  }
  function paste(html: string): void {
    reason = 'paste'; getEditor().update(() => {
      const selection = $getSelection(); if (!$isRangeSelection(selection)) return;
      const nodes = $generateNodesFromDOM(getEditor(), sanitizePaste(html));
      selection.insertNodes(nodes);
    }, { discrete: true });
  }
  return {
    id: 'lexical',
    mount(host, document, cb) {
      this.destroy(); callbacks = cb; root = window.document.createElement('div'); root.className = 'lexical-editor'; root.contentEditable = 'true'; root.setAttribute('role', 'textbox'); root.setAttribute('aria-multiline', 'true'); root.setAttribute('aria-label', 'Manuscript'); host.append(root);
      editor = createEditor({ namespace: 'neo-editor-spike', onError: error => { throw error; }, nodes: [ChapterNode, ManuscriptParagraphNode, ManuscriptTextNode,
        { replace: ParagraphNode, with: () => new ManuscriptParagraphNode(), withKlass: ManuscriptParagraphNode },
        { replace: TextNode, with: node => new ManuscriptTextNode(node.getTextContent()), withKlass: ManuscriptTextNode }
      ], theme: { text: { bold: 'lexical-bold', italic: 'lexical-italic' } } });
      editor.setRootElement(root);
      cleanup.push(registerRichText(editor), registerHistory(editor, createEmptyHistoryState(), 300));
      cleanup.push(editor.registerCommand(PASTE_COMMAND, event => {
        const clipboard = event && 'clipboardData' in event ? event.clipboardData : null;
        if (!clipboard) return false; event.preventDefault(); paste(clipboard.getData('text/html') || clipboard.getData('text/plain').split('\n').map(line => `<p>${line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`).join('')); return true;
      }, COMMAND_PRIORITY_HIGH));
      cleanup.push(editor.registerUpdateListener(({ editorState, tags }) => {
        editorState.read(() => {
          const doc = readDocument(), selection = currentSelection(), nextSignature = JSON.stringify(doc.chapters), selectionSignature = JSON.stringify(selection);
          if (nextSignature !== signature) { signature = nextSignature; if (!tags.has('adapter-replace')) callbacks.changed(doc, selection, composing ? 'composition' : reason); }
          if (selectionSignature !== lastSelection) { lastSelection = selectionSignature; callbacks.selectionChanged(selection); }
          reason = 'typing';
        });
      }));
      const keydown = (event: KeyboardEvent): void => { if (!composing && !event.isComposing && callbacks.gesture(event)) { event.preventDefault(); event.stopImmediatePropagation(); } else if ((event.metaKey || event.ctrlKey) && ['b', 'i'].includes(event.key.toLowerCase())) reason = 'format'; };
      const start = (): void => { composing = true; }; const end = (): void => { composing = false; reason = 'composition'; };
      root.addEventListener('keydown', keydown, true); root.addEventListener('compositionstart', start, true); root.addEventListener('compositionend', end, true);
      cleanup.push(() => { root?.removeEventListener('keydown', keydown, true); root?.removeEventListener('compositionstart', start, true); root?.removeEventListener('compositionend', end, true); });
      replace(document);
    },
    read() { return getEditor().getEditorState().read(() => ({ document: readDocument(), selection: currentSelection() })); },
    replace,
    select(selection) { getEditor().update(() => setSelection(selection), { discrete: true }); },
    insertText(text) { reason = 'typing'; getEditor().update(() => { const selection = $getSelection(); if ($isRangeSelection(selection)) selection.insertText(text); }, { discrete: true }); },
    format(mark) { reason = 'format'; getEditor().update(() => { getEditor().dispatchCommand(FORMAT_TEXT_COMMAND, mark); }, { discrete: true }); },
    paste,
    destroy() { cleanup.forEach(fn => fn()); cleanup = []; editor?.setRootElement(null); editor = null; root?.remove(); root = null; signature = ''; lastSelection = ''; composing = false; }
  };
}
