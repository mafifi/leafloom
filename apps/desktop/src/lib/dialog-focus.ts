/** Keep modal keyboard navigation local and return to the invoking control. */
export function dialogFocus(node: HTMLElement, options: { trap?: boolean } = {}) {
  const previous = node.ownerDocument.activeElement;
  const controls = () =>
    Array.from(
      node.querySelectorAll<HTMLElement>(
        options.trap
          ? '[role="region"][tabindex="0"],button:not(:disabled)'
          : 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      ),
    ).filter((element) => !element.closest('[hidden]'));
  queueMicrotask(() => {
    if (node.isConnected && !node.contains(node.ownerDocument.activeElement))
      (controls()[0] ?? node).focus();
  });
  const key = (event: KeyboardEvent) => {
    if (!options.trap || event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const items = controls();
    if (!items.length) {
      event.preventDefault();
      node.focus();
      return;
    }
    const index = items.indexOf(node.ownerDocument.activeElement as HTMLElement);
    if (
      index < 0 ||
      (event.shiftKey && index === 0) ||
      (!event.shiftKey && index === items.length - 1)
    ) {
      event.preventDefault();
      items[event.shiftKey ? items.length - 1 : 0].focus();
    }
  };
  node.addEventListener('keydown', key);
  return {
    update(next: { trap?: boolean }) {
      options = next;
    },
    destroy() {
      node.removeEventListener('keydown', key);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    },
  };
}
