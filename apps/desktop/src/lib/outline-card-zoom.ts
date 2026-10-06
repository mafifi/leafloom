import type { AppState } from './application';
const wheelByOwner = new WeakMap<object, number>();
export function cardBoardShowing(value: Pick<AppState, 'view' | 'panel' | 'manuscriptMode' | 'library'>) {
  return value.view === 'editor' && value.panel === 'outline' && (value.manuscriptMode === 'screenplay' || value.library.outlineView !== 'list');
}
/** Pinch and bottom-bar wheel share the source's accumulated size-step threshold. */
export function stepCardWheel(owner: object, delta: number, step: (direction: number) => void) {
  const accumulated = (wheelByOwner.get(owner) ?? 0) + delta;
  if (Math.abs(accumulated) > 40) {
    wheelByOwner.set(owner, 0);
    step(accumulated < 0 ? 1 : -1);
  } else wheelByOwner.set(owner, accumulated);
}
