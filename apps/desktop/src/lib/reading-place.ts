/** Preserve the visible text anchor while font metrics or page zoom reflow the book. */
export function keepReadingPlace(change: () => void, point?: { x: number; y: number }) {
  const scroll = document.querySelector<HTMLElement>('#paper-scroll');
  if (!scroll) {
    change();
    return;
  }
  const box = scroll.getBoundingClientRect();
  const topOf = (range: Range): number | null => {
    if (typeof range.getBoundingClientRect !== 'function') return null;
    const rect = range.getBoundingClientRect();
    if (rect.height) return rect.top;
    const element =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement;
    return element?.getBoundingClientRect().top ?? null;
  };
  let anchor: Range | null = null;
  const selection = window.getSelection();
  if (!point && selection?.rangeCount && scroll.contains(selection.anchorNode)) {
    const caret = selection.getRangeAt(0).cloneRange();
    caret.collapse(true);
    const top = topOf(caret);
    if (top !== null && top >= box.top && top <= box.bottom) anchor = caret;
  }
  if (!anchor) {
    const x = Math.min(box.right - 1, Math.max(box.left + 1, point?.x ?? box.left + box.width / 2));
    const y = Math.min(box.bottom - 1, Math.max(box.top + 1, point?.y ?? box.top + box.height / 2));
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    };
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range && scroll.contains(range.startContainer)) anchor = range;
    else {
      const caret = doc.caretPositionFromPoint?.(x, y);
      if (caret && scroll.contains(caret.offsetNode)) {
        anchor = document.createRange();
        anchor.setStart(caret.offsetNode, caret.offset);
        anchor.collapse(true);
      }
    }
  }
  const before = anchor ? topOf(anchor) : null;
  change();
  if (anchor && before !== null) {
    const after = topOf(anchor);
    if (after !== null) scroll.scrollTop += after - before;
  }
}
