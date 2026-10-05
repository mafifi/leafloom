import {
  ManuscriptMode,
  ScreenplayElement,
  cycleScreenplayElement,
  nextScreenplayElement,
  legacyScreenplayClasses,
  inferScreenplayElement,
  type ManuscriptModeValue,
  type ScreenplayElementValue,
} from '@leafloom/document-contracts';
import { splitBlock } from 'prosemirror-commands';
import { closeHistory } from 'prosemirror-history';
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
export interface ScreenplayContext {
  state: EditorState;
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
    .filter((name) => name && !Object.values(legacyScreenplayClasses).includes(name));
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
  const tr = closeHistory(context.state.tr).setNodeMarkup(
    $from.before(),
    undefined,
    attributes($from.parent.attrs, element),
  );
  const start = $from.before() + 1,
    text = $from.parent.textContent;
  if (element === 'parenthetical' && !text.startsWith('(')) {
    tr.insertText(')', start + $from.parent.content.size).insertText('(', start);
    if (context.state.selection.empty)
      tr.setSelection(
        TextSelection.create(
          tr.doc,
          start + 1 + Math.min($from.parentOffset, $from.parent.content.size),
        ),
      );
  } else if (
    $from.parent.attrs.screenplay === 'parenthetical' &&
    element !== 'parenthetical' &&
    text.startsWith('(') &&
    text.endsWith(')')
  ) {
    tr.delete(start + $from.parent.content.size - 1, start + $from.parent.content.size).delete(
      start,
      start + 1,
    );
  }
  context.dispatch(tr, 'screenplay.element');
  return true;
}
export function tab(context: ScreenplayContext, reverse = false): boolean {
  const $from = target(context);
  if (context.mode !== 'screenplay' || !$from) return false;
  return setElement(
    context,
    cycleScreenplayElement($from.parent.attrs.screenplay || 'action', reverse),
  );
}
export function enter(context: ScreenplayContext, soft = false): boolean {
  const $from = target(context);
  if (context.mode !== 'screenplay' || !$from) return false;
  if (soft) {
    context.dispatch(
      context.state.tr.replaceSelectionWith(context.state.schema.nodes.hard_break.create()),
      'screenplay.soft-break',
    );
    return true;
  }
  const current = $from.parent.attrs.screenplay
    ? $from.parent.attrs.screenplay
    : inferScreenplayElement($from.parent.textContent);
  const next = nextScreenplayElement(current, !$from.parent.textContent.trim());
  if (!$from.parent.textContent.trim()) return setElement(context, next);
  return splitBlock(context.state, (tr) => {
    tr.setNodeMarkup($from.before(), undefined, attributes($from.parent.attrs, current));
    const position = tr.selection.$from;
    tr.setNodeMarkup(position.before(), undefined, attributes(position.parent.attrs, next));
    context.dispatch(closeHistory(tr), 'screenplay.enter');
  });
}
