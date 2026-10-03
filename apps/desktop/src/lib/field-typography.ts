import type { TextTypographyPort, TypographicInput } from '@leafloom/editor-contracts';

type FieldContext = Pick<TypographicInput, 'language' | 'interfaceLanguage' | 'chapterText' | 'bookText'>;
/** Native metadata fields keep their DOM and selection; the provider chooses the typography. */
export class FieldTypographyViewModel {
  constructor(private readonly context: {
    provider: TextTypographyPort;
    editable(): boolean;
    text(field: HTMLElement, character: string): FieldContext;
  }) {}
  key(event: KeyboardEvent) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.keyCode === 229 || !this.context.editable()) return;
    if (!['-', '.', '"', "'", ';', ':', '!', '?'].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.isContentEditable || target.closest('.ProseMirror')) return;
    const field = target.closest<HTMLElement>('[contenteditable="true"]');
    if (!field) return;
    const document = field.ownerDocument;
    const selection = document.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!field.contains(range.startContainer) || !field.contains(range.endContainer)) return;
    const previousTextNodePrefix = range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE
      ? (range.startContainer.textContent ?? '').slice(0, range.startOffset) : '';
    const prefix = document.createRange();
    prefix.selectNodeContents(field);
    prefix.setEnd(range.startContainer, range.startOffset);
    const replacement = this.context.provider.query({
      ...this.context.text(field, event.key), character: event.key,
      previousTextNodePrefix, paragraphPrefix: prefix.toString(), collapsed: range.collapsed,
    });
    if (!replacement) return;
    if (replacement.replaceBefore > 0) {
      if (!range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE || replacement.replaceBefore > range.startOffset) return;
      range.setStart(range.startContainer, range.startOffset - replacement.replaceBefore);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    event.preventDefault();
    document.execCommand('insertText', false, replacement.text);
  }
}
