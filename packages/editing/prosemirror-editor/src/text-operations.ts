import { capitalCorrection } from './capitalization';
import type { SearchMatch } from '@leafloom/editor-contracts';
import type { Context } from '@opentelemetry/api';
import { toggleMark } from 'prosemirror-commands';
import { closeHistory } from 'prosemirror-history';
import type { Mark } from 'prosemirror-model';
import { type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import { bookSchema, type PassageInfo } from './model';
import { findPassages } from './search';
import {
  dialogueEdits,
  markdownMatch,
  typographicInput,
  type TypographyPreferences,
} from './typography';


export interface TextOperationsContext {
  owner: (pos: number) => Readonly<{ node: PMNode; pos: number; index: number }> | undefined;
  state: EditorState;
  canEdit: (id: string) => boolean;
  passages: (sectionId?: string) => PassageInfo[];
  dispatch: (tr: Transaction, command?: string, historical?: boolean, parent?: Context) => void;
  preferences: TypographyPreferences;
  enterSequence: { stage: 1 | 2; sectionId: string; tailId: string; time: number } | null;
  resetEnter: () => void;
  breakTyping: boolean;
  requireEditableSelection: () => void;
  inputMarks: readonly Mark[] | null;
  section: (id: string) => Readonly<{ node: PMNode; pos: number; index: number }>;
  supported: (id: string) => boolean;
  passage: (id: string) => PassageInfo | undefined;
  canEditSelection: () => boolean;
  insert: (
    text: string,
    options?: { typography?: boolean; capitalize?: boolean; previousTextNodePrefix?: string },
  ) => void;
}

export function alignParagraph(
  context: TextOperationsContext,
  value: 'left' | 'center' | 'right' | 'justify',
): boolean {
  if (context.state.doc.attrs.metadata.format === 'screenplay') return false;
  const alignment = z.enum(['left', 'center', 'right', 'justify']).parse(value),
    owner = context.owner(context.state.selection.from);
  if (!owner || owner.node.attrs.role !== 'chapter' || !context.canEdit(owner.node.attrs.id))
    return false;
  const { from, to, empty } = context.state.selection,
    tr = closeHistory(context.state.tr),
    align = alignment === 'left' ? null : alignment;
  for (const passage of context.passages(owner.node.attrs.id))
    if (
      passage.node.type.name === 'paragraph' &&
      !String(passage.node.attrs.class).split(/\s+/).includes('scene-break') &&
      (empty
        ? from >= passage.pos + 1 && from <= passage.pos + passage.node.nodeSize - 1
        : passage.pos < to && passage.pos + passage.node.nodeSize > from) &&
      passage.node.attrs.align !== align
    )
      tr.setNodeAttribute(passage.pos, 'align', align);
  if (tr.docChanged) context.dispatch(tr, 'format.align');
  return true;
}

export function configureTypography(
  context: TextOperationsContext,
  preferences: TypographyPreferences,
): void {
  context.preferences = { ...context.preferences, ...preferences };
}

export function insert(
  context: TextOperationsContext,
  text: string,
  options?: { typography?: boolean; capitalize?: boolean; previousTextNodePrefix?: string },
): void {
  const escalation = context.enterSequence;
  context.resetEnter();
  if (escalation) context.breakTyping = true;
  const owner = context.owner(context.state.selection.from);
  if (!owner) throw Error('UNSUPPORTED_CONTENT');
  context.requireEditableSelection();
  if (options?.typography === false) {
    let tr = context.state.tr;
    if (context.breakTyping) {
      tr = closeHistory(tr);
      context.breakTyping = false;
    }
    const marks = context.inputMarks;
    if (marks !== null) tr.setStoredMarks(marks);
    context.dispatch(tr.insertText(text), 'typing');
    return;
  }
  let nativePrefix = options?.previousTextNodePrefix;
  for (const character of text) {
    const { from, $from, empty } = context.state.selection,
      before = empty ? $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc') : '';
    const language = context.preferences.language ?? context.preferences.interfaceLanguage ?? 'en',
      replacement = typographicInput({
        character,
        language,
        interfaceLanguage: context.preferences.interfaceLanguage ?? 'en',
        previousTextNodePrefix: nativePrefix ?? before,
        paragraphPrefix: before,
        chapterText: character === '"' ? owner.node.textContent : '',
        bookText: character === '"' ? context.state.doc.textContent : '',
        collapsed: empty,
      }),
      value = replacement?.text ?? character,
      replace = replacement?.replaceBefore ?? 0;
    if (nativePrefix !== undefined)
      nativePrefix = (empty ? nativePrefix.slice(0, nativePrefix.length - replace) : '') + value;
    let transaction = context.state.tr;
    if (context.breakTyping) {
      transaction = closeHistory(transaction);
      context.breakTyping = false;
    }
    const inputMarks = context.inputMarks;
    if (inputMarks !== null) transaction.setStoredMarks(inputMarks);
    else if (replace === 1 && value.startsWith('\u202f'))
      transaction.setStoredMarks(context.state.doc.resolve(from - replace).marks());
    transaction.insertText(value, from - replace, context.state.selection.to);
    context.dispatch(transaction, 'typing');
    const classes = String($from.parent.attrs.class).split(/\s+/);
    const correction = options?.capitalize && empty && owner.node.attrs.role === 'chapter' && $from.parent.type.name === 'paragraph' && !classes.some(c => ['poetry','scene-break','sp-paren'].includes(c)) ? capitalCorrection(before, character, language) : null;
    if (correction) {
      const at = from - correction.replaceBefore;
      context.dispatch(closeHistory(context.state.tr).insertText(correction.text, at, from + value.length), 'typography.capital');
      context.breakTyping = true;
    }
    const selection = context.state.selection,
      paragraph = selection.$from.parent,
      paragraphStart = selection.$from.start();
    const prefix = paragraph.textBetween(0, selection.$from.parentOffset, '\n', '\ufffc');
    if (
      context.preferences.markdown !== false &&
      (owner.node.attrs.role === 'chapter' || owner.node.attrs.role === 'notes') &&
      (character === '*' || character === '_' || character === '~')
    ) {
      const match = markdownMatch(prefix);
      if (match) {
        const tr = closeHistory(context.state.tr),
          begin = paragraphStart + match.from,
          finish = paragraphStart + match.to;
        tr.delete(finish - match.open, finish).delete(begin, begin + match.open);
        const end = finish - match.open * 2;
        if (match.bold) tr.addMark(begin, end, bookSchema.marks.bold.create());
        if (match.italic) tr.addMark(begin, end, bookSchema.marks.italic.create());
        if (match.strike) tr.addMark(begin, end, bookSchema.marks.strike.create());
        tr.setSelection(TextSelection.create(tr.doc, end)).setStoredMarks([]);
        context.dispatch(tr, 'typography.markdown');
        context.breakTyping = true;
        continue;
      }
    }
    if (owner.node.attrs.role === 'chapter' && !(
      context.state.doc.attrs.metadata.format === 'screenplay' &&
      ['scene-heading', 'character', 'transition', 'shot'].includes(paragraph.attrs.screenplay)
    )) {
      const edits = dialogueEdits(prefix, language);
      if (edits.length) {
        const tr = closeHistory(context.state.tr);
        for (const edit of edits.reverse())
          tr.insertText(
            edit.text,
            paragraphStart + edit.at,
            paragraphStart + edit.at + edit.length,
          );
        context.dispatch(tr, 'typography.dialogue');
        context.breakTyping = true;
      }
    }
  }
}

export function togglePoetry(context: TextOperationsContext): void { toggleParagraphKind(context, 'poetry'); }
export function toggleFlush(context: TextOperationsContext): void { toggleParagraphKind(context, 'flush'); }
function toggleParagraphKind(context: TextOperationsContext, kind: 'poetry' | 'flush'): void {
  if (context.state.doc.attrs.metadata.format === 'screenplay') return;
  context.resetEnter();
  const { from, to } = context.state.selection, owner = context.owner(from);
  if (!owner || owner.node.attrs.role !== 'chapter' || !context.canEditSelection()) return;
  const passages = context.passages(owner.node.attrs.id).filter(p => p.node.type.name === 'paragraph' && p.pos < to && p.pos + p.node.nodeSize > from && !String(p.node.attrs.class).split(/\s+/).includes('scene-break'));
  if (!passages.length) return;
  const on = !passages.every(p => String(p.node.attrs.class).split(/\s+/).includes(kind)), tr = closeHistory(context.state.tr);
  for (const passage of passages) {
    const original = String(passage.node.attrs.class).split(/\s+/), classes = original.filter(c => c && c !== 'poetry' && c !== 'flush');
    if (on) classes.push(kind);
    tr.setNodeMarkup(passage.pos, undefined, { ...passage.node.attrs, class: classes.join(' ') });
    if (on && kind === 'poetry') tr.addMark(passage.pos + 1, passage.pos + 1 + passage.size, bookSchema.marks.italic.create());
    else if (original.includes('poetry')) tr.removeMark(passage.pos + 1, passage.pos + 1 + passage.size, bookSchema.marks.italic);
  }
  tr.setSelection(TextSelection.create(tr.doc, passages[0].pos + 1));
  tr.setStoredMarks(on && kind === 'poetry' ? [bookSchema.marks.italic.create()] : []);
  context.dispatch(tr, 'author.' + kind + '.toggle');
}

export function insertOpeningPoetry(context: TextOperationsContext, id: string): void {
  const section = context.section(id);
  if (!context.supported(id)) throw Error('UNSUPPORTED_CONTENT');
  const paragraph = bookSchema.nodes.paragraph.create({ class: 'poetry' }),
    tr = closeHistory(context.state.tr).insert(section.pos + 1, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, section.pos + 2)).setStoredMarks([
    bookSchema.marks.italic.create(),
  ]);
  context.dispatch(tr, 'author.poetry.open');
}

export function selectPassage(
  context: TextOperationsContext,
  id: string,
  from: number,
  to = from,
  extend = false,
): void {
  const passage = context.passage(id);
  if (
    !passage ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > passage.size
  )
    throw Error('INVALID_SELECTION');
  context.resetEnter();
  context.dispatch(
    context.state.tr.setSelection(
      TextSelection.create(context.state.doc, extend ? context.state.selection.anchor : passage.pos + 1 + from, passage.pos + 1 + to),
    ),
    'select',
  );
}

export function replaceMatches(
  context: TextOperationsContext,
  matches: SearchMatch[],
  text: string,
): void {
  const schema = z.array(
    z.strictObject({
      chapterId: z.string().min(1),
      passageId: z.string().min(1),
      from: z.number().int().nonnegative(),
      to: z.number().int().nonnegative(),
    }),
  );
  const replacements = schema
    .parse(matches)
    .map((match) => {
      const passage = context.passage(match.passageId);
      if (
        !passage ||
        passage.chapterId !== match.chapterId ||
        match.to <= match.from ||
        match.to > passage.size
      )
        throw Error('INVALID_SELECTION');
      return {
        from: passage.pos + 1 + match.from,
        to: passage.pos + 1 + match.to,
        marks: passage.node.content.cut(match.from, match.to).firstChild?.marks ?? [],
      };
    })
    .sort((a, b) => b.from - a.from);
  if (
    replacements.some(
      (replacement, index) => index > 0 && replacement.to > replacements[index - 1].from,
    )
  )
    throw Error('OVERLAPPING_MATCHES');
  if (!replacements.length) return;
  const tr = closeHistory(context.state.tr);
  for (const replacement of replacements) {
    if (text)
      tr.replaceWith(replacement.from, replacement.to, bookSchema.text(text, replacement.marks));
    else tr.delete(replacement.from, replacement.to);
  }
  context.dispatch(tr, 'replace.all');
}

export function search(
  context: TextOperationsContext,
  query: string,
  scope: 'manuscript' | 'notes' | 'outline' | 'all' = 'manuscript',
): SearchMatch[] {
  return findPassages(
    query,
    context.passages(),
    (id) => context.section(id).node.attrs.role,
    scope,
  );
}

export function indent(context: TextOperationsContext, reverse = false): void {
  context.resetEnter();
  if (!context.canEditSelection()) return;
  if (reverse) {
    const { from, empty, $from } = context.state.selection;
    if (!empty) return;
    const before = $from.parent.textBetween(0, $from.parentOffset);
    const spaces = before.endsWith('\u2003\u2003') ? 2 : before.endsWith('\u2003') ? 1 : 0;
    if (spaces) context.dispatch(context.state.tr.delete(from - spaces, from), 'author.indent');
  } else context.insert('\u2003\u2003');
}

export function format(context: TextOperationsContext, mark: 'bold' | 'italic' | 'underline' | 'strike'): void {
  if (!context.canEditSelection()) return;
  if (context.state.storedMarks === null && context.inputMarks !== null)
    context.state = context.state.apply(context.state.tr.setStoredMarks(context.inputMarks));
  toggleMark(bookSchema.marks[mark])(context.state, (tr) =>
    context.dispatch(closeHistory(tr), 'format'),
  );
}
