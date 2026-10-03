import { z } from 'zod';
const chapterId = z.string().min(1).max(128);
const number = z.number().finite().nonnegative();
const base = { chapterId, at: number, scroll: number.optional() };
const stable = z
  .object({
    ...base,
    passageId: z.string().min(1).max(128),
    from: number.int(),
    to: number.int(),
    pIdx: number.int().optional(),
    off: number.int().optional(),
  })
  .refine((value) => value.to >= value.from);
const legacy = z.object({ ...base, pIdx: number.int(), off: number.int().optional() });
const scrollOnly = z.object({ ...base, scroll: number });
export type RemotePosition =
  z.infer<typeof stable> | z.infer<typeof legacy> | z.infer<typeof scrollOnly>;
/** Reject malformed identity/caret shapes rather than falling back to a fabricated scroll bookmark. */
export function parseRemotePosition(value: unknown): RemotePosition | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = ('passageId' in value ? stable : 'pIdx' in value ? legacy : scrollOnly).safeParse(
    value,
  );
  return parsed.success ? parsed.data : null;
}
export interface RemotePositionContext {
  position: RemotePosition | null;
  hereAt: number;
  lastActivity: number;
  panel: string;
  modalOpen: boolean;
  chapter: {
    id: string;
    editable: boolean;
    passageIds: readonly string[];
    paragraphCount: number;
  } | null;
  now: number;
}
/** Source244 eligibility only. The owner restores the actual caret or raw scroll after a ready result. */
export function remotePositionEligibility(
  context: RemotePositionContext,
): 'ignore' | 'wait' | 'ready' {
  const { position, chapter } = context;
  if (
    !position ||
    !chapter ||
    chapter.id !== position.chapterId ||
    context.panel !== 'manuscript' ||
    context.modalOpen ||
    position.at <= context.hereAt ||
    position.at <= context.lastActivity
  )
    return 'ignore';
  const arrived =
    'passageId' in position
      ? chapter.passageIds.includes(position.passageId) ||
        (position.pIdx !== undefined && chapter.paragraphCount > position.pIdx)
      : !('pIdx' in position) || chapter.paragraphCount > position.pIdx;
  return !chapter.editable || arrived || context.now - position.at > 120000 ? 'ready' : 'wait';
}
