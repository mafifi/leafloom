import {
  ManuscriptMode,
  ScreenplayElement,
  cycleScreenplayElement,
  nextScreenplayElement,
  legacyScreenplayClasses,
  type ManuscriptModeValue,
  type ScreenplayElementValue,
} from '@leafloom/document-contracts';
import { closeHistory } from 'prosemirror-history';
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import {
  headingPrefix,
  looksLikeCharacter,
  looksLikeTransition,
  parseHeading,
  scriptLines,
  suggestedText,
} from './screenplay-rules';

export class ScreenplaySession {
  readonly guessed = new Set<string>();
  readonly dismissed = new Map<string, string>();
}
export interface ScreenplayContext {
  state: EditorState;
  session: ScreenplaySession;
  mode: ManuscriptModeValue;
  editable(): boolean;
  dispatch(transaction: Transaction, command: string): void;
}
function target(context: ScreenplayContext) {
  const { $from } = context.state.selection;
  const section = $from.depth >= 1 ? $from.node(1) : null;
  return section?.attrs.role === 'chapter' &&
    $from.parent.type.name === 'paragraph' &&
    context.editable()
    ? $from
    : null;
}
function attributes(attrs: Record<string, unknown>, element: ScreenplayElementValue) {
  const old = String(attrs.class || '')
    .split(/\s+/)
    .filter(
      (name) =>
        name &&
        !Object.values(legacyScreenplayClasses).includes(name) &&
        !['poetry', 'flush', 'scene-break', 'ghost'].includes(name),
    );
  return {
    ...attrs,
    screenplay: element,
    class: [...old, legacyScreenplayClasses[element]].join(' '),
  };
}
export function setMode(context: ScreenplayContext, raw: ManuscriptModeValue): boolean {
  const mode = ManuscriptMode.parse(raw);
  if (!context.editable() || context.mode === mode) return false;
  context.dispatch(
    closeHistory(context.state.tr).setDocAttribute('metadata', {
      ...context.state.doc.attrs.metadata,
      format: mode,
    }),
    'screenplay.mode',
  );
  return true;
}
export function setElement(context: ScreenplayContext, raw: ScreenplayElementValue): boolean {
  const element = ScreenplayElement.parse(raw),
    $from = target(context);
  if (context.mode !== 'screenplay' || !$from || $from.parent.attrs.screenplay === element)
    return false;
  context.session.guessed.delete(String($from.parent.attrs.pid));
  const tr = closeHistory(context.state.tr).setNodeMarkup(
    $from.before(),
    undefined,
    attributes($from.parent.attrs, element),
  );
  const start = $from.before() + 1;
  // Boundary punctuation changes preserve marks on the author's inner text.
  let text = $from.parent.textContent;
  if ($from.parent.attrs.screenplay === 'parenthetical' || element === 'parenthetical') {
    const leading = text.match(/^\s*\(/)?.[0].length ?? text.match(/^\s*/)?.[0].length ?? 0;
    const trailing = text.match(/\)\s*$/)?.[0].length ?? text.match(/\s*$/)?.[0].length ?? 0;
    if (trailing) tr.delete(start + text.length - trailing, start + text.length);
    if (leading) tr.delete(start, start + leading);
    text = text.slice(leading, trailing ? -trailing : undefined);
    if (element === 'parenthetical') {
      tr.insertText(')', start + text.length).insertText('(', start);
      tr.setSelection(TextSelection.create(tr.doc, start + text.length + 1));
    } else tr.setSelection(TextSelection.create(tr.doc, start + text.length));
  } else tr.setSelection(TextSelection.create(tr.doc, start + $from.parent.content.size));
  context.dispatch(tr, 'screenplay.element');
  return true;
}
export function completion(context: ScreenplayContext): string {
  const point = target(context);
  if (
    context.mode !== 'screenplay' ||
    !point ||
    !context.state.selection.empty ||
    point.parentOffset !== point.parent.content.size
  )
    return '';
  const id = String(point.parent.attrs.pid);
  if (context.session.dismissed.get(id) === point.parent.textContent) return '';
  const lines = scriptLines(context.state.doc);
  return suggestedText(
    lines,
    lines.findIndex((line) => line.id === id),
  );
}
export function dismissCompletion(context: ScreenplayContext): boolean {
  const point = target(context);
  if (!point || !completion(context)) return false;
  context.session.dismissed.set(String(point.parent.attrs.pid), point.parent.textContent);
  // Presentation only: this publishes through the existing owner without history.
  context.dispatch(context.state.tr, 'screenplay.suggestion.dismiss');
  return true;
}
export function acceptCompletion(context: ScreenplayContext): boolean {
  const ghost = completion(context);
  if (!ghost) return false;
  context.dispatch(context.state.tr.insertText(ghost), 'typing');
  return true;
}
export function normalizeTyping(context: ScreenplayContext, tr: Transaction): void {
  if (context.mode !== 'screenplay') return;
  const point = tr.selection.$head,
    section = point.depth >= 1 ? point.node(1) : null;
  if (section?.attrs.role !== 'chapter' || point.parent.type.name !== 'paragraph') return;
  const node = point.parent,
    id = String(node.attrs.pid),
    element = node.attrs.screenplay ?? 'action',
    text = node.textContent;
  const previous = point.index(1) > 0 ? section.child(point.index(1) - 1) : null;
  let to: ScreenplayElementValue | null = null;
  if (element === 'action' && headingPrefix.test(text)) {
    to = 'scene-heading';
    context.session.guessed.add(id);
  } else if (
    element === 'scene-heading' &&
    context.session.guessed.has(id) &&
    !headingPrefix.test(text)
  ) {
    to = 'action';
    context.session.guessed.delete(id);
  } else if (element === 'dialogue' && text.startsWith('(')) to = 'parenthetical';
  else if (
    element === 'action' &&
    text.startsWith('(') &&
    ['dialogue', 'parenthetical'].includes(previous?.attrs.screenplay)
  )
    to = 'parenthetical';
  if (to) tr.setNodeMarkup(point.before(), undefined, attributes(node.attrs, to));
}
export function tab(context: ScreenplayContext, reverse = false): boolean {
  const point = target(context);
  if (context.mode !== 'screenplay' || !point || !context.state.selection.empty) return false;
  if (!reverse && acceptCompletion(context)) return true;
  const type = point.parent.attrs.screenplay ?? 'action',
    text = point.parent.textContent;
  const prefix = /^(INT|EXT|EST|I\/E|INT\.?\/EXT)\.?$/i.test(text.trim());
  if (!reverse && (type === 'scene-heading' || (type === 'action' && prefix))) {
    const heading = parseHeading(text);
    const replacement = prefix
      ? text.trimEnd().replace(/\.$/, '') + '. '
      : heading?.location && heading.time === null
        ? text.trimEnd() + ' - '
        : null;
    if (replacement !== null) {
      const start = point.before() + 1,
        tr = closeHistory(context.state.tr).insertText(
          replacement,
          start,
          start + point.parent.content.size,
        );
      tr.setNodeMarkup(point.before(), undefined, attributes(point.parent.attrs, 'scene-heading'));
      tr.setSelection(TextSelection.create(tr.doc, start + replacement.length));
      if (prefix) context.session.guessed.add(String(point.parent.attrs.pid));
      context.dispatch(tr, 'screenplay.tab');
      return true;
    }
  }
  return setElement(context, cycleScreenplayElement(type, reverse));
}
export function enter(context: ScreenplayContext, _soft = false): boolean {
  if (context.mode !== 'screenplay' || !target(context)) return false;
  const tr = closeHistory(context.state.tr).deleteSelection(),
    ghost = completion(context);
  if (ghost) tr.insertText(ghost);
  let point = tr.selection.$from,
    node = point.parent;
  let current: ScreenplayElementValue = node.attrs.screenplay ?? 'action';
  const start = point.before(),
    text = node.textContent;
  if (!(current === 'parenthetical' ? text.replace(/[()]/g, '') : text).trim()) {
    tr.delete(start + 1, start + 1 + node.content.size);
    tr.setNodeMarkup(
      start,
      undefined,
      attributes(node.attrs, nextScreenplayElement(current, true)),
    );
    tr.setSelection(TextSelection.create(tr.doc, start + 1)).setStoredMarks([]);
    context.dispatch(tr, 'screenplay.enter');
    return true;
  }
  if (current === 'parenthetical' && text.slice(point.parentOffset).trim() === ')') {
    tr.setSelection(TextSelection.create(tr.doc, start + 1 + node.content.size));
    point = tr.selection.$from;
  }
  if (point.parentOffset === 0) {
    const element = current === 'dialogue' || current === 'parenthetical' ? 'dialogue' : 'action';
    tr.insert(
      start,
      node.type.create({ screenplay: element, class: legacyScreenplayClasses[element] }),
    );
    tr.setSelection(TextSelection.create(tr.doc, start + 1)).setStoredMarks([]);
    context.dispatch(tr, 'screenplay.enter');
    return true;
  }
  const end = point.parentOffset === node.content.size;
  if (end && current === 'action') {
    if (looksLikeTransition(text)) current = 'transition';
    else if (looksLikeCharacter(text)) {
      current = 'character';
      context.session.guessed.add(String(node.attrs.pid));
    }
  }
  if (end && current === 'parenthetical' && !/\)\s*$/.test(text)) {
    tr.insertText(')');
    point = tr.selection.$from;
    node = point.parent;
  }
  const next =
    !end && (current === 'action' || current === 'dialogue')
      ? current
      : nextScreenplayElement(current);
  const split = tr.selection.from,
    data = { ...node.attrs.data };
  delete data['data-scene-id'];
  tr.setNodeMarkup(start, undefined, attributes(node.attrs, current));
  tr.split(split, 1, [
    { type: node.type, attrs: { ...attributes(node.attrs, next), pid: null, data } },
  ]);
  tr.setSelection(TextSelection.create(tr.doc, split + 2)).setStoredMarks(
    context.state.storedMarks ?? point.marks(),
  );
  context.dispatch(tr, 'screenplay.enter');
  return true;
}
export function backspace(context: ScreenplayContext): boolean {
  const point = target(context);
  if (
    context.mode !== 'screenplay' ||
    !point ||
    !context.state.selection.empty ||
    point.parentOffset !== 0 ||
    point.parent.textContent.trim() ||
    point.parent.attrs.screenplay !== 'dialogue' ||
    point.index(1) === 0
  )
    return false;
  const previous = point.node(1).child(point.index(1) - 1),
    id = String(previous.attrs.pid);
  if (previous.attrs.screenplay !== 'character' || !context.session.guessed.has(id)) return false;
  const start = point.before(),
    before = start - previous.nodeSize;
  const tr = closeHistory(context.state.tr).delete(start, start + point.parent.nodeSize);
  tr.setNodeMarkup(before, undefined, attributes(previous.attrs, 'action'));
  tr.setSelection(TextSelection.create(tr.doc, before + 1 + previous.content.size));
  context.session.guessed.delete(id);
  context.dispatch(tr, 'screenplay.guess.undo');
  return true;
}
