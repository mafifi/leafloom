import { Decoration, type EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { ScreenplayElement } from '@leafloom/document-contracts';
import type { BookCore } from './core';
import { continuedSpeech, scriptLines } from './screenplay-rules';
/** Script keys are author commands; hints and continuations are projection only. */
export function screenplayKey(core: BookCore, event: KeyboardEvent): boolean | null {
  if (core.manuscriptMode !== 'screenplay' || core.activeSection?.role !== 'chapter') return false;
  const mac = core.document.defaultView?.navigator.platform.toLowerCase().includes('mac');
  const command = mac ? event.metaKey : event.ctrlKey;
  if (command && !event.shiftKey && !event.altKey && /^Digit[1-7]$/.test(event.code)) {
    core.setScreenplayElement(ScreenplayElement.options[Number(event.code.slice(5)) - 1]);
    return true;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return event.key === 'Enter' ? null : false;
  if (event.key === 'Enter') return core.enter();
  if (!core.state.selection.empty) return false;
  if (event.key === 'Escape' && core.dismissScreenplayCompletion()) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  if (event.key === 'Tab') return core.screenplayTab(event.shiftKey);
  if (event.key === 'ArrowRight' && !event.shiftKey && core.acceptScreenplayCompletion())
    return true;
  return false;
}
export function screenplayDecorations(core: BookCore, id: string, doc: PMNode): Decoration[] {
  if (core.manuscriptMode !== 'screenplay' || core.section(id).node.attrs.role !== 'chapter')
    return [];
  const lines = scriptLines(core.state.doc),
    base = core.section(id).pos + 1,
    decorations: Decoration[] = [];
  const focused =
    core.document.activeElement?.closest('.chapter-body')?.getAttribute('data-chid') === id;
  const ghost = focused ? core.screenplayCompletion : '';
  const point = core.state.selection.$head,
    selected = String(point.parent.attrs.pid);
  lines.forEach((line, index) => {
    if (line.chapterId !== id) return;
    const attrs: Record<string, string> = {};
    const measured = core.screenplayMeasurement(line.id);
    if (measured?.page !== undefined) {
      attrs['data-pg'] = String(measured.page);
      attrs['data-fill'] = String(measured.fill ?? 0);
      attrs.style = '--fill:' + String(measured.fill ?? 0);
    }
    if (line.element === 'character' && continuedSpeech(lines, index)) attrs['data-contd'] = '';
    if (ghost && line.id === selected) {
      attrs['data-ghost'] = ghost;
      if (!line.text) attrs['data-ghost-empty'] = '';
    }
    const local = line.pos - base,
      node = doc.nodeAt(local);
    if (node && Object.keys(attrs).length)
      decorations.push(Decoration.node(local, local + node.nodeSize, attrs));
  });
  return decorations;
}

/** Native focus changes redraw hints through the owner without an author step. */
export function refreshScreenplayFocus(core: BookCore, view: EditorView) {
  if (core.manuscriptMode !== 'screenplay') return;
  queueMicrotask(() => {
    if (!view.isDestroyed && core.manuscriptMode === 'screenplay')
      core.dispatch(core.state.tr, 'screenplay.suggestion.focus');
  });
}
