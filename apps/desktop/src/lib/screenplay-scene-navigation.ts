import type { OutlineCardTarget, OutlineDropSide } from '@leafloom/editor-contracts';
export type NavigableScene = { chapterId: string; passageId: string; label: string };
const target = (scene: NavigableScene): OutlineCardTarget => ({
  kind: 'scene',
  chapterId: scene.chapterId,
  passageId: scene.passageId,
});
/** A scene gesture carries identity into the existing author command owner. */
export function screenplaySceneNavigation(
  move: (source: OutlineCardTarget, target: OutlineCardTarget, side: OutlineDropSide) => boolean,
) {
  let source: OutlineCardTarget | null = null,
    indicator: HTMLDivElement | null = null;
  const clear = () => {
    indicator?.remove();
    indicator = null;
    document
      .querySelectorAll('#nav-list .sp-scene.dragging')
      .forEach((row) => row.classList.remove('dragging'));
  };
  const side = (event: DragEvent) => {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
  };
  return {
    start(event: DragEvent, scene: NavigableScene) {
      source = target(scene);
      event.dataTransfer?.setData('application/x-neo-scene', scene.passageId);
      (event.currentTarget as HTMLElement).classList.add('dragging');
    },
    over(event: DragEvent) {
      if (!source || !event.dataTransfer?.types.includes('application/x-neo-scene')) return;
      event.preventDefault();
      indicator ??= document.createElement('div');
      indicator.className = 'nav-drop-ind';
      const row = event.currentTarget as HTMLElement;
      row.parentElement?.insertBefore(indicator, side(event) === 'before' ? row : row.nextSibling);
    },
    drop(event: DragEvent, scene: NavigableScene) {
      if (!source) return;
      event.preventDefault();
      const from = source,
        to = target(scene),
        where = side(event);
      source = null;
      clear();
      if (from.passageId !== to.passageId) move(from, to, where);
    },
    end() {
      source = null;
      clear();
    },
  };
}
