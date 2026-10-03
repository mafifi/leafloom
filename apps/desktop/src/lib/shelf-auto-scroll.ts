/** NEO's edge scrolling belongs to the shelf viewport, not individual shelf rows. */
const bindings = new WeakMap<HTMLElement, { users: number; destroy(): void }>();

export function shelfAutoScroll(row: HTMLElement): { destroy(): void } {
  const view = row.closest<HTMLElement>('#bookshelf-view');
  if (!view) return { destroy() {} };
  let binding = bindings.get(view);
  if (!binding) {
    let direction = 0;
    let frame: number | null = null;
    const stop = () => {
      direction = 0;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
    const step = () => {
      frame = null;
      if (!direction) return;
      view.scrollTop += direction;
      frame = window.requestAnimationFrame(step);
    };
    const dragOver = (event: DragEvent) => {
      const edge = 90;
      direction =
        event.clientY < edge
          ? -Math.ceil((edge - event.clientY) / 5)
          : event.clientY > window.innerHeight - edge
            ? Math.ceil((event.clientY - (window.innerHeight - edge)) / 5)
            : 0;
      if (!direction) stop();
      else if (frame === null) frame = window.requestAnimationFrame(step);
    };
    const leave = (event: DragEvent) => {
      if (!event.relatedTarget) stop();
    };
    view.addEventListener('dragover', dragOver);
    view.addEventListener('dragleave', leave);
    window.addEventListener('drop', stop, true);
    window.addEventListener('dragend', stop);
    window.addEventListener('blur', stop);
    binding = {
      users: 0,
      destroy() {
        stop();
        view.removeEventListener('dragover', dragOver);
        view.removeEventListener('dragleave', leave);
        window.removeEventListener('drop', stop, true);
        window.removeEventListener('dragend', stop);
        window.removeEventListener('blur', stop);
        bindings.delete(view);
      },
    };
    bindings.set(view, binding);
  }
  const shared = binding;
  shared.users++;
  let active = true;
  return {
    destroy() {
      if (!active) return;
      active = false;
      if (--shared.users === 0) shared.destroy();
    },
  };
}
