import { z } from 'zod';
import { Metadata, type MetadataValue } from '@leafloom/document-contracts';
import type { MetadataField } from '@leafloom/editor-contracts';
import type { Node, Schema } from 'prosemirror-model';
import { Step, StepResult, type Mappable } from 'prosemirror-transform';

export const metadataField = z.enum(['title', 'subtitle', 'author', 'credit', 'draft']);
const slot = z.discriminatedUnion('present', [
  z.strictObject({ present: z.literal(false) }),
  z.strictObject({ present: z.literal(true), value: z.json() }),
]);
export type MetadataSlot = z.infer<typeof slot>;
export function fieldSlot(metadata: MetadataValue, field: MetadataField): MetadataSlot {
  return Object.hasOwn(metadata, field)
    ? { present: true, value: metadata[field] }
    : { present: false };
}
export function sameSlot(left: MetadataSlot, right: MetadataSlot) {
  return JSON.stringify(left) === JSON.stringify(right);
}
const serialized = z.strictObject({
  stepType: z.literal('leafloomMetadataField/v1'),
  field: metadataField,
  before: slot,
  after: slot,
  beforeVersion: z.string().min(1),
  afterVersion: z.string().min(1),
});

/** Finish a live native field edit without replaying its already-persisted value. */
export class MetadataFieldStep extends Step {
  constructor(
    readonly field: MetadataField,
    readonly before: MetadataSlot,
    readonly after: MetadataSlot,
    readonly beforeVersion: string,
    readonly afterVersion: string,
  ) {
    super();
  }
  apply(doc: Node): StepResult {
    const current = Metadata.safeParse(doc.attrs.metadata);
    if (!current.success) return StepResult.fail('INVALID_METADATA');
    if (
      sameSlot(fieldSlot(current.data, this.field), this.after) &&
      doc.attrs.version === this.afterVersion
    )
      return StepResult.ok(doc);
    const metadata = this.after.present
      ? { ...current.data, [this.field]: this.after.value }
      : { ...current.data };
    if (!this.after.present) delete metadata[this.field];
    const parsed = Metadata.safeParse(metadata);
    if (!parsed.success) return StepResult.fail('INVALID_METADATA');
    return StepResult.ok(
      doc.type.create(
        { ...doc.attrs, metadata: parsed.data, version: this.afterVersion },
        doc.content,
        doc.marks,
      ),
    );
  }
  invert(_doc: Node): MetadataFieldStep {
    return new MetadataFieldStep(
      this.field,
      this.after,
      this.before,
      this.afterVersion,
      this.beforeVersion,
    );
  }
  map(_mapping: Mappable): MetadataFieldStep {
    return this;
  }
  toJSON(): z.infer<typeof serialized> {
    return {
      stepType: 'leafloomMetadataField/v1',
      field: this.field,
      before: this.before,
      after: this.after,
      beforeVersion: this.beforeVersion,
      afterVersion: this.afterVersion,
    };
  }
  static fromJSON(_schema: Schema, raw: unknown): MetadataFieldStep {
    const value = serialized.parse(raw);
    return new MetadataFieldStep(
      value.field,
      value.before,
      value.after,
      value.beforeVersion,
      value.afterVersion,
    );
  }
}
Step.jsonID('leafloomMetadataField/v1', MetadataFieldStep);
