/** Draft fields use native typing history; mounted manuscript surfaces own book history. */
export function nativeHistoryField(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement) || target.closest('.ProseMirror, #sticky-list')) return null;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target;
  const field = target.closest<HTMLElement>('[contenteditable]');
  return field && ['true', 'plaintext-only', ''].includes(field.getAttribute('contenteditable') ?? 'false') ? field : null;
}

/** Consume even an empty field history so a menu command cannot undo other writing. */
export function executeNativeFieldHistory(direction: 'undo' | 'redo', owner: Document = document): boolean {
  const field = nativeHistoryField(owner.activeElement);
  if (!field) return false;
  if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && (field.readOnly || field.disabled)) return true;
  owner.execCommand(direction);
  return true;
}

/** Native draft fields own their formatting just as they own their typing history. */
export function executeNativeFieldFormat(command: string, owner: Document = document): boolean {
  const field = nativeHistoryField(owner.activeElement);
  if (!field) return false;
  if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && (field.readOnly || field.disabled)) return true;
  owner.execCommand(command);
  return true;
}
