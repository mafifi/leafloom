import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { EditorState, type Command, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { ChangeReason, EditorCallbacks, Manuscript, ManuscriptEditor, Selection } from '../../contracts';
import { fromEngine, fromSelection, schema, toEngine, toSelection } from './mapping';

function sanitize(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  element.querySelectorAll('script,style,iframe,object,embed,svg,math,noscript,link,meta').forEach(node => node.remove());
  element.querySelectorAll('*').forEach(node => {
    for (const attr of Array.from(node.attributes)) {
      if (!['data-placeholder', 'data-kind', 'data-scene-content', 'style'].includes(attr.name)) node.removeAttribute(attr.name);
    }
  });
  return element;
}

export function createProseMirrorEditor(): ManuscriptEditor {
  let view: EditorView | null = null;
  let metadata: Manuscript | null = null;
  let callbacks: EditorCallbacks | null = null;
  let composing = false;
  const formatCommand = (mark: 'bold' | 'italic'): Command => (state, dispatch, editor) => toggleMark(schema.marks[mark])(state, dispatch ? tr => dispatch(tr.setMeta('reason', 'format')) : undefined, editor);
  const plugins = () => [history(), keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo, 'Mod-b': formatCommand('bold'), 'Mod-i': formatCommand('italic') }), keymap(baseKeymap)];
  function dispatch(tr: Transaction) {
    if (!view || !metadata) return;
    // Native splitBlock copies node attrs. Repair the later copy in the same transaction.
    const used = new Set([metadata.id, ...metadata.darlings.map(darling => darling.id)]);
    tr.doc.descendants((node, position) => {
      if (node.type.name !== 'chapter' && !node.isTextblock && node.type.name !== 'scene_break') return;
      let id = node.attrs.id as string | null;
      if (!id || used.has(id)) {
        do { id = `pm-${crypto.randomUUID()}`; } while (used.has(id));
        tr.setNodeMarkup(position, undefined, { ...node.attrs, id });
      }
      used.add(id);
    });
    view.updateState(view.state.apply(tr));
    const selection = fromSelection(view.state.selection);
    if (tr.docChanged) callbacks?.changed(fromEngine(view.state.doc, metadata), selection, tr.getMeta('reason') as ChangeReason | undefined ?? (composing || view.composing ? 'composition' : 'typing'));
    else if (tr.selectionSet) callbacks?.selectionChanged(selection);
  }
  return {
    id: 'prosemirror',
    mount(host, document, nextCallbacks) {
      view?.destroy();
      metadata = structuredClone(document);
      callbacks = nextCallbacks;
      view = new EditorView(host, {
        state: EditorState.create({ schema, doc: toEngine(document), plugins: plugins() }),
        attributes: { class: 'manuscript prosemirror-manuscript', role: 'textbox', 'aria-label': 'Manuscript', 'aria-multiline': 'true' },
        dispatchTransaction: dispatch,
        handleKeyDown(editor, event) { return event.isComposing || editor.composing ? false : callbacks?.gesture(event) ?? false; },
        handleDOMEvents: {
          compositionstart() { composing = true; return false; },
          compositionend() { composing = false; return false; },
        },
        transformPastedHTML: html => sanitize(html).innerHTML,
        handlePaste(editor, _event, slice) { editor.dispatch(editor.state.tr.replaceSelection(slice).setMeta('reason', 'paste').scrollIntoView()); return true; },
      });
    },
    read() {
      if (!view || !metadata) throw new Error('ProseMirror editor is not mounted');
      return { document: fromEngine(view.state.doc, metadata), selection: fromSelection(view.state.selection) };
    },
    replace(document, selection) {
      if (!view) return;
      metadata = structuredClone(document);
      const doc = toEngine(document);
      if (doc.eq(view.state.doc)) {
        if (selection) {
          const mapped = toSelection(doc, selection);
          if (mapped) view.updateState(view.state.apply(view.state.tr.setSelection(mapped)));
        }
      } else {
        const mapped = selection ? toSelection(doc, selection) : null;
        view.updateState(EditorState.create({ schema, doc, ...(mapped ? { selection: mapped } : {}), plugins: plugins() }));
      }
    },
    select(selection: Selection) {
      if (!view) return;
      const mapped = toSelection(view.state.doc, selection);
      if (mapped) view.dispatch(view.state.tr.setSelection(mapped).scrollIntoView());
      view.focus();
    },
    insertText(text) { if (view) view.dispatch(view.state.tr.insertText(text).setMeta('reason', 'typing').scrollIntoView()); },
    format(mark) {
      if (!view) return;
      toggleMark(schema.marks[mark])(view.state, tr => view?.dispatch(tr.setMeta('reason', 'format')));
      view.focus();
    },
    paste(html) {
      if (!view) return;
      const slice = PMDOMParser.fromSchema(schema).parseSlice(sanitize(html), { preserveWhitespace: true });
      view.dispatch(view.state.tr.replaceSelection(slice).setMeta('reason', 'paste').scrollIntoView());
      view.focus();
    },
    destroy() { view?.destroy(); view = null; callbacks = null; metadata = null; composing = false; },
  };
}
