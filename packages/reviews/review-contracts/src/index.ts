import { z } from 'zod';
const Id = z.string().min(1);
const Offset = z.number().int().nonnegative();
export const Inline = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    text: z.string(),
    marks: z.array(z.strictObject({ kind: Id, attributes: z.record(z.string(), z.json()) })),
  }),
  z.strictObject({ kind: z.literal('break') }),
  z.strictObject({
    kind: z.literal('atom'),
    name: z.enum(['placeholder', 'darling_anchor']),
    id: z.string(),
    attributes: z.record(z.string(), z.json()),
  }),
]);
export type InlineContent = z.infer<typeof Inline>;
export const Reference = z
  .strictObject({
    id: Id,
    chapterId: Id,
    passageId: Id,
    from: Offset,
    to: Offset,
    version: z.uuid(),
    expected: z.array(Inline),
    text: z.string(),
  })
  .refine((r) => r.to > r.from, { message: 'A reference must select content' });
export type PassageReference = z.infer<typeof Reference>;
export const ReviewItem = z.discriminatedUnion('kind', [
  z.strictObject({
    id: Id,
    kind: z.literal('suggestion'),
    category: z.enum(['voice', 'character', 'structure']),
    references: z.array(Id).length(1),
    message: z.string(),
    replacement: z.string(),
  }),
  z.strictObject({
    id: Id,
    kind: z.literal('note'),
    category: z.enum(['voice', 'character', 'structure']),
    references: z.array(Id).min(1),
    message: z.string(),
  }),
]);
export type ReviewItemValue = z.infer<typeof ReviewItem>;
export const ReviewOutput = z.strictObject({
  reviewId: Id,
  requestId: Id,
  items: z.array(ReviewItem),
});
export const Segment = z
  .strictObject({
    chapterId: z.string().min(1),
    passageId: z.string().min(1),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  })
  .refine((s) => s.to > s.from);
export const Reviews = z.strictObject({
  formatVersion: z.literal('neo-composed-reviews/v1'),
  bookId: z.string().min(1),
  version: z.uuid(),
  references: z.array(
    z.strictObject({
      reference: Reference,
      segments: z.array(Segment),
      deleted: z.boolean(),
      unresolved: z.boolean(),
    }),
  ),
  items: z.array(
    z.strictObject({
      item: ReviewItem,
      reviewId: z.string().min(1),
      rejected: z.boolean(),
      accepted: z.boolean(),
    }),
  ),
});
export type ReviewsValue = z.infer<typeof Reviews>;
export const Input = z.strictObject({
  requestId: z.uuid(),
  bookId: z.string(),
  revision: z.number().int().nonnegative(),
  category: z.enum(['voice', 'character', 'structure']),
  extracts: z
    .array(
      z.strictObject({
        reference: Reference,
        currentSegments: z.array(Segment).min(1),
        version: z.uuid(),
        chapterOrder: z.number().int().nonnegative(),
        passageKind: z.string(),
        runs: z.array(Inline),
        text: z.string(),
      }),
    )
    .min(1),
});
export type ReviewInput = z.infer<typeof Input>;
