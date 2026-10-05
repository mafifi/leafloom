import { Metadata, type JSONValue } from '@leafloom/document-contracts';
import type { MetadataField, MetadataPatch } from '@leafloom/editor-contracts';
import { type CoreEvent } from '@leafloom/editor-contracts';
import type { Context } from '@opentelemetry/api';
import { closeHistory, undoDepth } from 'prosemirror-history';
import { EditorState, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import {
  MetadataFieldStep,
  fieldSlot,
  metadataField,
  sameSlot,
  type MetadataSlot,
} from './metadata-fields';
import { ReferenceHistory } from './reference-history';
import type { CompositionTelemetry } from './telemetry';

const uuid = () => crypto.randomUUID();

export interface MetadataOperationsContext {
  applyBookkeeping: (parsed: Record<string, JSONValue | undefined>) => void;
  state: EditorState;
  bookkeeping: Record<string, z.core.util.JSONType>;
  dispatch: (tr: Transaction, command?: string, historical?: boolean, parent?: Context) => void;
  metadataEdit: { field: MetadataField; before: MetadataSlot; version: string } | null;
  finishMetadataField: (field?: MetadataField) => void;
  metadata: { [x: string]: z.core.util.JSONType; id: string; title: string; author: string };
  remember: () => void;
  version: string;
  revision: number;
  listeners: Set<(e: CoreEvent) => void>;
  telemetry: CompositionTelemetry | undefined;
  commandParent: Context | undefined;
  referenceHistory: ReferenceHistory;
  breakTyping: boolean;
}

export function setBookkeeping(
  context: MetadataOperationsContext,
  patch: Partial<
    Record<'wordCount' | 'dailyCounts' | 'lastPosition' | 'modified' | 'uuid', JSONValue>
  >,
): void {
  const schema = z.strictObject({
    wordCount: z.number().int().nonnegative().optional(),
    dailyCounts: z
      .record(
        z.string(),
        z.strictObject({
          start: z.number().int().nonnegative(),
          end: z.number().int().nonnegative(),
        }),
      )
      .optional(),
    lastPosition: z.json().optional(),
    modified: z.string().optional(),
    uuid: z.uuid().optional(),
  });
  context.applyBookkeeping(schema.parse(patch));
}

export function setCoverBookkeeping(
  context: MetadataOperationsContext,
  patch: { coverArt?: JSONValue; coverMode?: 'painted' },
): void {
  context.applyBookkeeping(
    z
      .strictObject({ coverArt: z.json().optional(), coverMode: z.literal('painted').optional() })
      .parse(patch),
  );
}

export function applyBookkeeping(
  context: MetadataOperationsContext,
  parsed: Record<string, JSONValue | undefined>,
): void {
  const value: Record<string, JSONValue> = {};
  for (const [key, next] of Object.entries(parsed)) if (next !== undefined) value[key] = next;
  if (
    Object.entries(value).every(
      ([key, next]) =>
        JSON.stringify(context.state.doc.attrs.metadata[key]) === JSON.stringify(next),
    )
  )
    return;
  context.bookkeeping = { ...context.bookkeeping, ...value };
  context.dispatch(
    context.state.tr
      .setDocAttribute('metadata', { ...context.state.doc.attrs.metadata, ...value })
      .setMeta('addToHistory', false)
      .setMeta('bookkeeping', true)
      .setStoredMarks(context.state.storedMarks),
    'book.bookkeeping',
  );
}

export function editMetadataField(
  context: MetadataOperationsContext,
  field: MetadataField,
  value: string,
): void {
  const parsedField = metadataField.parse(field),
    parsedValue = z.string().parse(value);
  if (context.metadataEdit?.field !== parsedField) context.finishMetadataField();
  const before = fieldSlot(context.metadata, parsedField);
  if (before.present && before.value === parsedValue) return;
  if (!context.metadataEdit) {
    context.remember();
    context.metadataEdit = { field: parsedField, before, version: context.version };
  }
  const scope = context.metadataEdit,
    metadata = Metadata.parse({ ...context.metadata, [parsedField]: parsedValue }),
    version = sameSlot(scope.before, fieldSlot(metadata, parsedField)) ? scope.version : uuid(),
    transaction = context.state.tr
      .setDocAttribute('metadata', metadata)
      .setDocAttribute('version', version)
      .setMeta('addToHistory', false)
      .setStoredMarks(context.state.storedMarks);
  const apply = () => {
    context.state = context.state.apply(transaction);
    context.revision++;
    for (const fn of context.listeners)
      fn({ kind: 'changed', revision: context.revision, command: 'book.metadata.live' });
  };
  if (context.telemetry) context.telemetry.sync('editor.transaction', apply, context.commandParent);
  else apply();
}

export function finishMetadataField(
  context: MetadataOperationsContext,
  field?: MetadataField,
): void {
  if (field !== undefined) metadataField.parse(field);
  const scope = context.metadataEdit;
  if (!scope || (field !== undefined && field !== scope.field)) return;
  context.metadataEdit = null;
  const after = fieldSlot(context.metadata, scope.field);
  if (sameSlot(scope.before, after)) return;
  const depth = undoDepth(context.state),
    step = new MetadataFieldStep(scope.field, scope.before, after, scope.version, context.version);
  context.remember();
  context.state = context.state.apply(
    closeHistory(context.state.tr).step(step).setStoredMarks(context.state.storedMarks),
  );
  context.referenceHistory.record(
    scope.version,
    context.version,
    depth,
    undoDepth(context.state),
    false,
  );
  context.breakTyping = true;
  for (const fn of context.listeners)
    fn({ kind: 'selection', revision: context.revision, command: 'book.metadata.finish' });
}

export function updateMetadata(
  context: MetadataOperationsContext,
  patch: Record<string, JSONValue>,
): void {
  const parsed = z.record(z.string(), z.json()).parse(patch),
    metadata = Metadata.parse({ ...context.state.doc.attrs.metadata, ...parsed });
  if (metadata.id !== context.state.doc.attrs.metadata.id || 'chapterOrder' in metadata)
    throw Error('INVALID_METADATA');
  context.dispatch(
    closeHistory(context.state.tr).setDocAttribute('metadata', metadata),
    'book.metadata',
  );
  for (const key of Object.keys(parsed)) delete context.bookkeeping[key];
}

export function setMetadata(context: MetadataOperationsContext, patch: MetadataPatch): void {
  const parsed = z
    .strictObject({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      author: z.string().optional(),
    })
    .parse(patch);
  context.dispatch(
    closeHistory(context.state.tr).setDocAttribute('metadata', {
      ...context.state.doc.attrs.metadata,
      ...parsed,
    }),
    'book.metadata',
  );
}
