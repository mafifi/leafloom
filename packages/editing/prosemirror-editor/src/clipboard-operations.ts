import { Sticky } from '@leafloom/document-contracts';
import type { ClipboardValue } from '@leafloom/editor-contracts';
import type { Context } from '@opentelemetry/api';
import { closeHistory } from 'prosemirror-history';
import type { Mark } from 'prosemirror-model';
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import { clipboardHTML } from './clipboard';
import { exportHTML, schema as htmlSchema, importHTML } from './codec';
import { baseNode } from './fidelity';
import { bookSchema } from './model';
import { dialogueEdits, markdownHTML, type TypographyPreferences } from './typography';

const uuid = () => crypto.randomUUID();

export interface ClipboardOperationsContext {
  state: EditorState;
  clipboardStickies: Map<
    string,
    {
      [x: string]: z.core.util.JSONType;
      id: string;
      chapterId: string;
      text: string;
      resolved: boolean;
    }
  >;
  stickies: {
    [x: string]: z.core.util.JSONType;
    id: string;
    chapterId: string;
    text: string;
    resolved: boolean;
  }[];
  rememberClipboardStickies: () => void;
  document: Document;
  requireEditableSelection: () => void;
  copySelection: () => ClipboardValue;
  dispatch: (tr: Transaction, command?: string, historical?: boolean, parent?: Context) => void;
  section: (id: string) => Readonly<{ node: PMNode; pos: number; index: number }>;
  owner: (pos: number) => Readonly<{ node: PMNode; pos: number; index: number }> | undefined;
  resetEnter: () => void;
  inputMarks: readonly Mark[] | null;
  preferences: TypographyPreferences;
}

export function rememberClipboardStickies(context: ClipboardOperationsContext): void {
  const selected = new Set<string>();
  context.state.doc.nodesBetween(
    context.state.selection.from,
    context.state.selection.to,
    (node) => {
      if (node.type.name === 'placeholder') selected.add(node.attrs.sid);
    },
  );
  context.clipboardStickies = new Map(
    context.stickies.filter((note) => selected.has(note.id)).map((note) => [note.id, note]),
  );
}

export function copySelection(context: ClipboardOperationsContext): ClipboardValue {
  context.rememberClipboardStickies();
  const slice = context.state.doc.slice(context.state.selection.from, context.state.selection.to),
    content = Array.from(slice.content.content, (node) => baseNode(node));
  const doc = htmlSchema.nodes.doc.create(
    null,
    slice.openStart ? content : htmlSchema.nodes.paragraph.create(null, content),
  );
  return {
    text: slice.content.textBetween(0, slice.content.size, '\n', '⚑'),
    html: exportHTML(context.document, doc),
  };
}

export function cutSelection(context: ClipboardOperationsContext): ClipboardValue {
  context.requireEditableSelection();
  const value = context.copySelection();
  context.dispatch(closeHistory(context.state.tr).deleteSelection(), 'cut');
  return value;
}

export function selectAll(context: ClipboardOperationsContext, id?: string): void {
  const section = id ? context.section(id) : context.owner(context.state.selection.from);
  if (!section) return;
  context.dispatch(
    context.state.tr.setSelection(
      TextSelection.between(
        context.state.doc.resolve(section.pos + 2),
        context.state.doc.resolve(section.pos + section.node.nodeSize - 2),
      ),
    ),
    'select',
  );
}

export function paste(context: ClipboardOperationsContext, value: ClipboardValue): void {
  context.resetEnter();
  const owner = context.owner(context.state.selection.from);
  if (!owner) throw Error('UNSUPPORTED_CONTENT');
  context.requireEditableSelection();
  let model: PMNode;
  if (value.html && !value.matchStyle) {
    model = clipboardHTML(context.document, value.html);
  } else {
    const manuscript = owner.node.attrs.role === 'chapter',
      lines = manuscript
        ? value.text
            .replace(/\r/g, '')
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
        : value.text.replace(/\r/g, '').split('\n');
    const marks = context.inputMarks ?? context.state.selection.$from.marks();
    model = htmlSchema.nodes.doc.create(
      null,
      (lines.length ? lines : ['']).map((source, index) => {
        let line = source;
        if (manuscript && !value.matchStyle) {
          for (const edit of dialogueEdits(line, context.preferences.language ?? 'en')
            .filter(
              (edit) =>
                edit.at !== 0 || index > 0 || context.state.selection.$from.parentOffset === 0,
            )
            .reverse())
            line = line.slice(0, edit.at) + edit.text + line.slice(edit.at + edit.length);
          const styled = context.preferences.markdown ? markdownHTML(line) : null;
          if (styled) return importHTML(context.document, '<p>' + styled + '</p>').child(0);
        }
        return htmlSchema.nodes.paragraph.create(
          null,
          line
            ? htmlSchema.text(
                line,
                marks.map((mark) => htmlSchema.mark(mark.type.name, mark.attrs)),
              )
            : undefined,
        );
      }),
    );
  }
  if (owner.node.attrs.role === 'chapter' && !value.matchStyle) {
    const normalization = EditorState.create({ doc: model }).tr,
      edits: { from: number; to: number; text: string }[] = [];
    let index = 0;
    model.descendants((node, position) => {
      if (!node.isTextblock) return;
      const text = node.textContent;
      for (const edit of dialogueEdits(text, context.preferences.language ?? 'en'))
        if (edit.at !== 0 || index > 0 || context.state.selection.$from.parentOffset === 0)
          edits.push({
            from: position + 1 + edit.at,
            to: position + 1 + edit.at + edit.length,
            text: edit.text,
          });
      index++;
      return false;
    });
    for (const edit of edits.reverse())
      normalization.replaceWith(
        edit.from,
        edit.to,
        htmlSchema.text(edit.text, normalization.doc.resolve(edit.from).marks()),
      );
    model = normalization.doc;
  }
  let nodes = Array.from(model.content.content, (node) => bookSchema.nodeFromJSON(node.toJSON()));
  const pasted = EditorState.create({ doc: bookSchema.nodes.surface.create(null, nodes) }).tr,
    stickies = [...context.stickies];
  pasted.doc.descendants((node, pos) => {
    if (node.type.name === 'placeholder') {
      const original =
          context.stickies.find((sticky) => sticky.id === node.attrs.sid) ??
          context.clipboardStickies.get(String(node.attrs.sid)),
        incoming = String(node.attrs.sid ?? ''),
        id = incoming && !stickies.some((sticky) => sticky.id === incoming) ? incoming : uuid();
      pasted.setNodeAttribute(pos, 'sid', id);
      stickies.push(
        Sticky.parse({
          ...original,
          id,
          chapterId: owner.node.attrs.id,
          text: original?.text ?? '',
          resolved: original?.resolved ?? false,
        }),
      );
    }
  });
  nodes = Array.from(pasted.doc.content.content);
  const slice =
    nodes.length === 1 && nodes[0].isTextblock
      ? new Slice(nodes[0].content, 0, 0)
      : new Slice(Fragment.fromArray(nodes), 1, 1);
  context.dispatch(
    closeHistory(context.state.tr)
      .replaceSelection(slice)
      .setDocAttribute('metadata', { ...context.state.doc.attrs.metadata, stickies }),
    'paste',
  );
}
