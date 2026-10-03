/** Keep native editing DOM stable while the author owns its caret. */
export function editableText(node: HTMLElement, initial: string | undefined) {
  let value = initial ?? '';
  node.textContent = value;
  const synchronize = () => {
    if (node.ownerDocument.activeElement !== node && node.textContent !== value)
      node.textContent = value;
  };
  return {
    update(next: string | undefined) {
      value = next ?? '';
      synchronize();
    },
  };
}

export function focusInput(node: HTMLInputElement) {
  queueMicrotask(() => {
    if (node.isConnected) {
      node.focus();
      node.select();
    }
  });
}
