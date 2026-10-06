import type { OutlineCardTarget, OutlineDropSide } from '@leafloom/editor-contracts';
export type BoardDrop = { element: HTMLElement | null; target: OutlineCardTarget | 'loose'; side: OutlineDropSide };
export function elementTarget(element: HTMLElement): OutlineCardTarget {
  const kind = element.dataset.kind as OutlineCardTarget['kind'];
  return { kind, chapterId: element.dataset.ch ?? '',
    ...(element.dataset.sec ? { sectionId: element.dataset.sec } : {}), ...(element.dataset.loose ? { looseId: element.dataset.loose } : {}),
    ...(element.dataset.passage ? { passageId: element.dataset.passage } : {}), ...(element.dataset.seg !== undefined ? { segmentIndex: Number(element.dataset.seg) } : {}),
    ...(element.dataset.scene !== undefined ? { sceneIndex: Number(element.dataset.scene) } : {}) };
}
export function boardDropAt(source: HTMLElement, x: number, y: number): BoardDrop | null {
  const pane = document.querySelector<HTMLElement>('#side-pane');
  if (pane?.classList.contains('open')) {
    const rect = pane.getBoundingClientRect(), over = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
      ready = source.dataset.kind === 'section' && source.dataset.sec && !source.dataset.written;
    pane.classList.toggle('drop-over', Boolean(over && ready));
    if (over) return ready ? { element: pane, target: 'loose', side: 'into' } : null;
  }
  const cells = [...document.querySelectorAll<HTMLElement>('#outline-board .ob-cell:not(.ob-lifted):not([data-new])')];
  let best: HTMLElement | null = null, distance = Infinity;
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect(), dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0,
      dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0, score = dy * 3 + dx;
    if (score < distance) { best = cell; distance = score; }
  }
  if (!best) return null;
  const rect = best.getBoundingClientRect(), kind = source.dataset.kind,
    middle = x > rect.left + rect.width * .25 && x < rect.right - rect.width * .25 && y >= rect.top && y <= rect.bottom;
  if (middle && best.dataset.kind === 'chapter' && (kind === 'section' || kind === 'loose' || kind === 'chapter' && best.dataset.ch !== source.dataset.ch))
    return { element: best, target: elementTarget(best), side: 'into' };
  let side: OutlineDropSide = x < rect.left + rect.width / 2 ? 'before' : 'after';
  if (kind === 'chapter' && (best.dataset.kind !== 'chapter' || side === 'after')) {
    best = cells.filter((cell) => cell.dataset.ch === best!.dataset.ch).at(-1)!;
    side = 'after';
  }
  return { element: best, target: elementTarget(best), side };
}
export function startBoardPointer(event: PointerEvent, cell: HTMLElement, callbacks: {
  open(): void; begin(): void; openAside(): void; menu(event: MouseEvent): void; drop(target: BoardDrop): void; active(value: boolean): void;
}): () => void {
  const touch = event.pointerType !== 'mouse';
  let live = false, held = false, target: BoardDrop | null = null, float: HTMLElement | null = null, timer: ReturnType<typeof setTimeout> | undefined, scroller: ReturnType<typeof setInterval> | undefined, dx = 0, dy = 0, lastX = event.clientX, lastY = event.clientY;
  const mark = (next: BoardDrop | null) => {
    document.querySelectorAll('.ob-join,.ob-drop-before,.ob-drop-after').forEach((element) => element.classList.remove('ob-join', 'ob-drop-before', 'ob-drop-after'));
    if (next?.element) next.element.classList.add(next.side === 'into' ? 'ob-join' : 'ob-drop-' + next.side);
  };
  const finish = () => {
    clearTimeout(timer); clearInterval(scroller); document.querySelector('#side-pane')?.classList.remove('drop-ready', 'drop-over'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key, true);
    cell.classList.remove('ob-lifted'); document.body.classList.remove('ob-dragging'); float?.remove(); mark(null); callbacks.active(false);
  };
  const move = (next: PointerEvent) => {
    const distance = Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY);
    if (!live && touch && !held) { if (distance > 8) finish(); return; }
    if (!live && (!touch ? distance >= 5 : held)) {
      clearTimeout(timer); callbacks.begin(); live = true; callbacks.active(true); cell.classList.add('ob-lifted'); document.body.classList.add('ob-dragging');
      const card = cell.querySelector<HTMLElement>('.ob-card')!, rect = card.getBoundingClientRect();
      float = card.cloneNode(true) as HTMLElement; float.classList.add('ob-float');
      dx = event.clientX - rect.left; dy = event.clientY - rect.top;
      float.style.width = rect.width + 'px'; float.style.height = rect.height + 'px'; float.style.fontSize = getComputedStyle(card).fontSize;
      document.body.appendChild(float);
      if (cell.dataset.kind === 'section' && cell.dataset.sec && !cell.dataset.written) document.querySelector('#side-pane')?.classList.add('drop-ready');
    }
    if (!live) return;
    next.preventDefault();
    lastX = next.clientX; lastY = next.clientY;
    float!.style.left = lastX - dx + 'px'; float!.style.top = lastY - dy + 'px';
    if (document.querySelector('#side-pane')?.classList.contains('drop-ready') && lastX > window.innerWidth - 36) callbacks.openAside();
    target = boardDropAt(cell, lastX, lastY); mark(target);
    clearInterval(scroller);
    const scroll = document.querySelector<HTMLElement>('#paper-scroll');
    if (scroll) {
      const bounds = scroll.getBoundingClientRect(), edge = lastY < bounds.top + 50 ? -1 : lastY > bounds.bottom - 50 ? 1 : 0;
      if (edge) scroller = setInterval(() => { scroll.scrollTop += edge * 14; target = boardDropAt(cell, lastX, lastY); mark(target); }, 30);
    }
  };
  const up = () => { const dropped = target; finish(); if (live && dropped) callbacks.drop(dropped); else if (!live) { if (held) callbacks.menu(new MouseEvent('contextmenu', { clientX: event.clientX, clientY: event.clientY })); else callbacks.open(); } };
  const cancel = () => finish();
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && live) { event.preventDefault(); event.stopPropagation(); finish(); } };
  if (touch) timer = setTimeout(() => { held = true; }, 380);
  window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', key, true);
  return finish;
}
