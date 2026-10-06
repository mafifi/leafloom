import type { OutlineCard, OutlineCardInsertion, OutlineCardTarget, OutlineDropSide } from '@leafloom/editor-contracts';
export type OutlineBoardPresentation = { visible: boolean; script: boolean; view: 'list' | 'cards'; zoom: number; cards: OutlineCard[]; looseCards: OutlineCard[] };
export type OutlineBoardActions = {
  edit(target: OutlineCardTarget, text: string, slug?: string): void;
  insert(location: OutlineCardInsertion, text?: string, slug?: string): OutlineCardTarget | null;
  removeNote(target: OutlineCardTarget): void;
  drop(source: OutlineCardTarget, target: OutlineCardTarget | 'loose', side: OutlineDropSide): boolean;
  go(target: OutlineCardTarget): void;
  menu(event: MouseEvent, target: OutlineCardTarget): void;
  view(value: 'list' | 'cards'): void;
  zoom(value: number): void;
  showAside?(): void;
  bindFlush?(flush: () => void): () => void;
};
export function cardTarget(card: OutlineCard): OutlineCardTarget {
  if (card.kind === 'part') throw Error('INVALID_OUTLINE_TARGET');
  return { kind: card.kind, chapterId: card.chapterId,
    ...(card.sectionId ? { sectionId: card.sectionId } : {}), ...(card.segmentIndex !== undefined ? { segmentIndex: card.segmentIndex } : {}),
    ...(card.passageId ? { passageId: card.passageId } : {}), ...(card.sceneIndex !== undefined ? { sceneIndex: card.sceneIndex } : {}), ...(card.looseId ? { looseId: card.looseId } : {}) };
}
export function newCardLocation(card: OutlineCard, cards: OutlineCard[]): OutlineCardInsertion {
  if (card.kind === 'scene') return { kind: 'scene', afterScene: card.sceneIndex ?? -1 };
  if (card.kind === 'loose') return { kind: 'loose' };
  const physical = cards.filter((candidate) => candidate.chapterId === card.chapterId && !candidate.virtual).map((candidate) => candidate.segmentIndex ?? -1),
    after = card.kind === 'chapter' ? card.segmentIndex ?? -1 : card.virtual ? Math.max(...physical, -1) : card.segmentIndex ?? -1;
  return { kind: 'section', chapterId: card.chapterId, afterSegment: after };
}
export function eighthsText(eighths: number) {
  const pages = Math.floor(eighths / 8), remainder = eighths % 8;
  return pages ? String(pages) + (remainder ? ` ${remainder}/8` : '') : `${remainder}/8`;
}
export const cardZooms = [0.55, 0.7, 0.85, 1, 1.15, 1.3, 1.5] as const;

/** Part separators are headings, so card traversal passes over them. */
export function nextOutlineCard(cards: readonly OutlineCard[], key: string, direction: -1 | 1) {
  const at = cards.findIndex(card => card.key === key);
  if (at < 0) return undefined;
  const ahead = direction < 0 ? cards.slice(0, at).reverse() : cards.slice(at + 1);
  return ahead.find(card => card.kind !== 'part');
}
