import { z } from 'zod';

export const RunSchema = z.strictObject({ text: z.string(), bold: z.boolean().optional(), italic: z.boolean().optional(), placeholder: z.string().optional() });
export const BlockSchema = z.strictObject({ id: z.string().min(1), kind: z.enum(['paragraph', 'scene-break', 'poetry']), runs: z.array(RunSchema) }).refine(b => b.kind !== 'scene-break' || b.runs.length === 0, { message: 'Scene breaks cannot contain prose' });
export const ChapterSchema = z.strictObject({ id: z.string().min(1), title: z.string(), blocks: z.array(BlockSchema).min(1) });
export const DarlingSchema = z.strictObject({ id: z.string().min(1), chapterId: z.string(), blockId: z.string(), offset: z.number().int().nonnegative(), runs: z.array(RunSchema), prefix: z.string(), suffix: z.string() });
export const ManuscriptSchema = z.strictObject({ schemaVersion: z.literal('neo-spike/v1'), id: z.string().min(1), title: z.string(), author: z.string(), revision: z.number().int().nonnegative(), chapters: z.array(ChapterSchema).min(1), darlings: z.array(DarlingSchema) }).superRefine((doc, ctx) => {
  const ids = [doc.id, ...doc.chapters.flatMap(c => [c.id, ...c.blocks.map(b => b.id)]), ...doc.darlings.map(d => d.id)];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Document identities must be unique' });
});
export type Run = z.infer<typeof RunSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Manuscript = z.infer<typeof ManuscriptSchema>;
export type Selection = { chapterId: string; blockId: string; from: number; to: number };
export type EngineId = 'neo' | 'prosemirror' | 'lexical';
export type ChangeReason = 'typing' | 'format' | 'paste' | 'composition';
export interface EditorCallbacks {
  changed(document: Manuscript, selection: Selection | null, reason: ChangeReason): void;
  gesture(event: KeyboardEvent): boolean;
  selectionChanged(selection: Selection | null): void;
}
/** Editor owns editable DOM. Host owns manuscript operations and structural history. */
export interface ManuscriptEditor {
  readonly id: EngineId;
  mount(host: HTMLElement, document: Manuscript, callbacks: EditorCallbacks): void;
  read(): { document: Manuscript; selection: Selection | null };
  replace(document: Manuscript, selection?: Selection | null): void;
  select(selection: Selection): void;
  insertText(text: string): void;
  format(mark: 'bold' | 'italic'): void;
  paste(html: string): void;
  destroy(): void;
}
export const ProposalSchema = z.strictObject({ id: z.string().min(1), sourceRevision: z.number().int().nonnegative(), skill: z.string().min(1), blockId: z.string().min(1), from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), expected: z.string(), sourceBlockText: z.string(), replacement: z.array(RunSchema), explanation: z.string() }).refine(p => p.to > p.from && p.to <= p.sourceBlockText.length && p.sourceBlockText.slice(p.from,p.to) === p.expected, { message: 'Proposal range must name exact nonempty source text' });
export type Proposal = z.infer<typeof ProposalSchema>;
export interface WritingAgent { review(document: Manuscript, selection: Selection, signal: AbortSignal): Promise<Proposal>; }
export interface ManuscriptStore { save(document: Manuscript): Promise<void>; load(): Promise<Manuscript | null>; }
export type ManuscriptEvent =
  | { type: 'document.changed'; revision: number; cause: string }
  | { type: 'document.saved'; revision: number }
  | { type: 'document.loaded'; revision: number }
  | { type: 'proposal.received'; proposalId: string; sourceRevision: number }
  | { type: 'proposal.applied'; proposalId: string; rebased: boolean }
  | { type: 'proposal.rejected'; proposalId: string; reason: string };
