import type { EditorView } from 'prosemirror-view';

/** Margins and the room below a chapter belong to its author caret. */
export function blankPageCaret(
  event: MouseEvent,
  root: HTMLElement,
  views: ReadonlyMap<string, { host: HTMLElement; view: EditorView }>,
  select: (id: string, position: number) => void,
  focus: () => void,
): void {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)
    return;
  const target = event.target;
  if (!(target instanceof Element) || !root.closest('#editor-view')?.contains(target)) return;
  if (
    target.closest(
      '[contenteditable="true"],input,textarea,button,a,[role="menu"],.ph-mark,#title-page',
    )
  )
    return;
  if (target.closest('.chapter-head') && !target.matches('.chapter-head')) return;
  if (!target.matches('.chapter,.chapter-head,#chapters,#paper,#paper-scroll,#editor-view')) return;
  let chapter = target.closest<HTMLElement>('.chapter');
  if (!chapter)
    for (const candidate of root.querySelectorAll<HTMLElement>('.chapter')) {
      if (candidate.getBoundingClientRect().top > event.clientY) break;
      chapter = candidate;
    }
  const id = chapter?.dataset.chid,
    entry = id ? views.get(id) : undefined;
  if (!id || !entry || !entry.view.editable) return;
  const box = entry.host.getBoundingClientRect(),
    view = entry.view;
  const point = view.posAtCoords({
    left: Math.min(Math.max(event.clientX, box.left + 2), box.right - 2),
    top: event.clientY,
  });
  const position =
    event.clientY < box.top
      ? 1
      : event.clientY > box.bottom
        ? view.state.doc.content.size - 1
        : (point?.pos ?? view.state.doc.content.size - 1);
  event.preventDefault();
  select(id, position);
  focus();
}
