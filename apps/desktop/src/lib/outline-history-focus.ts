import type { EditorPort, OutlineTarget } from '@leafloom/editor-contracts';
type Origin = { before: string; after: string; target: OutlineTarget };
type FocusState = { origins: Origin[]; applying: boolean };
const focusStates = new WeakMap<EditorPort, FocusState>();
function stateFor(editor: EditorPort) {
  let state = focusStates.get(editor);
  if (!state) {
    state = { origins: [], applying: false };
    focusStates.set(editor, state);
    const saved = state;
    // Only focus metadata is retained. The editor remains the sole history owner.
    editor.subscribe(() => {
      if (!saved.applying && saved.origins.at(-1)?.after !== editor.historyVersion) saved.origins = [];
    });
  }
  return state;
}
export function outlineStructure<T>(editor: EditorPort, target: OutlineTarget, operation: () => T): T {
  const state = stateFor(editor), before = editor.historyVersion;
  if (state.origins.at(-1) && state.origins.at(-1)!.after !== before) state.origins = [];
  state.applying = true;
  try {
    const result = operation();
    if (editor.historyVersion !== before) state.origins.push({ before, after: editor.historyVersion, target: { ...target } });
    return result;
  } finally { state.applying = false; }
}
export function outlineNativeUndo(
  context: { editor: EditorPort | null; writable(): boolean; value: { panel: string }; focusOutline(target: OutlineTarget): void },
  element: HTMLElement,
  event: KeyboardEvent,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return false;
  // Let the native field engine answer first; do not route an empty field to unrelated prose history.
  event.stopPropagation();
  const editor = context.editor;
  if (!editor) return true;
  const state = stateFor(editor), origin = state.origins.at(-1);
  if (!origin || origin.after !== editor.historyVersion || !editor.canUndo) return true;
  const revision = editor.revision, version = editor.historyVersion;
  let nativeUndid = false;
  const heard = () => { nativeUndid = true; };
  element.addEventListener('beforeinput', heard, { once: true });
  setTimeout(() => {
    element.removeEventListener('beforeinput', heard);
    if (nativeUndid || context.editor !== editor || !context.writable() || context.value.panel !== 'outline' || !element.isConnected ||
      editor.revision !== revision || editor.historyVersion !== version || state.origins.at(-1) !== origin) return;
    state.applying = true;
    try {
      editor.undo();
      if (editor.historyVersion === origin.before) { state.origins.pop(); context.focusOutline(origin.target); }
      else state.origins = [];
    } finally { state.applying = false; }
  }, 0);
  return true;
}
