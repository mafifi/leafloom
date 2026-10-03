import type { PresentationPreferences } from '@leafloom/editor-contracts';
/** The sentence containing a caret, with trailing whitespace excluded. */
export function focusSentence(
  text: string,
  offset: number,
  language = 'en',
): { from: number; to: number } | null {
  if (!text.trim()) return null;
  const segmenter = new Intl.Segmenter(language.split('-')[0], { granularity: 'sentence' });
  let result: { from: number; to: number } | null = null;
  for (const segment of segmenter.segment(text)) {
    const end = segment.index + segment.segment.length;
    result = { from: segment.index, to: segment.index + segment.segment.trimEnd().length };
    if (offset >= segment.index && offset < end) break;
  }
  return result;
}
export function typewriterRoom(
  viewportHeight: number,
  clientHeight: number,
  blankBelow: number,
  lineHeight: number,
) {
  return Math.max(120, Math.ceil(clientHeight - viewportHeight * 0.45 - blankBelow + lineHeight));
}
/** Native highlights are presentation state; no wrapper enters the manuscript. */
export class ManuscriptPresentation {
  private capOffBody: Element | null = null;
  private preferences: Required<Omit<PresentationPreferences, 'publicationPage'>> = {
    typewriter: false,
    focus: 'off',
    language: 'en',
  };
  keyboard = false;
  configure(preferences: PresentationPreferences) {
    this.preferences = { ...this.preferences, ...preferences };
  }
  get enabled() {
    return this.preferences.typewriter;
  }
  get typewriter() {
    return this.preferences.typewriter && this.keyboard;
  }
  room(document: Document) {
    const paper = document.querySelector<HTMLElement>('#paper'),
      last = Array.from(document.querySelectorAll<HTMLElement>('#chapters .chapter-body')).at(-1),
      scroll = document.querySelector<HTMLElement>('#paper-scroll'),
      window = document.defaultView;
    if (!paper || !last || !scroll || !window) return;
    if (!this.preferences.typewriter) {
      paper.style.removeProperty('--typewriter-room');
      return;
    }
    if (paper.hidden) return;
    const lineHeight = parseFloat(window.getComputedStyle(last).lineHeight) || 30,
      below = paper.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
    paper.style.setProperty(
      '--typewriter-room',
      typewriterRoom(window.innerHeight, scroll.clientHeight, below, lineHeight) + 'px',
    );
  }
  /** Source selection presentation: floated initials stand aside while the author edits their paragraph. */
  paintDropcap(document: Document) {
    const selection = document.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
    const ElementType = document.defaultView?.Element;
    const paragraph = ElementType && element instanceof ElementType ? element.closest('p') : null;
    const body = paragraph?.closest('.chapter-body');
    const next = body && paragraph === body.querySelector('p:not(.poetry)') ? body : null;
    if (next === this.capOffBody) return;
    this.capOffBody?.classList.remove('cap-off');
    next?.classList.add('cap-off');
    this.capOffBody = next;
  }
  paint(document: Document) {
    const window = document.defaultView;
    if (!window?.CSS?.highlights || !window.Highlight) return;
    if (this.preferences.focus === 'off') {
      window.CSS.highlights.delete('neo-focus');
      document
        .querySelectorAll('.chapter-body.focus-cap')
        .forEach((body) => body.classList.remove('focus-cap'));
      return;
    }
    const selection = document.getSelection(),
      element =
        selection?.focusNode?.nodeType === 1
          ? selection.focusNode
          : selection?.focusNode?.parentElement;
    if (!(element instanceof window.Element)) return;
    const paragraph = element.closest('p'),
      body = paragraph?.closest('.chapter-body');
    if (!paragraph || !body) return;
    if (paragraph.classList.contains('scene-break')) {
      this.clear(document);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    if (this.preferences.focus === 'sentence' && selection?.focusNode) {
      const prefix = range.cloneRange();
      prefix.setEnd(selection.focusNode, selection.focusOffset);
      const offsets = focusSentence(
        paragraph.textContent ?? '',
        prefix.toString().length,
        this.preferences.language,
      );
      if (!offsets) return;
      const walker = document.createTreeWalker(paragraph, 4);
      let position = 0,
        start = false;
      while (walker.nextNode()) {
        const node = walker.currentNode,
          length = node.textContent?.length ?? 0;
        if (!start && offsets.from <= position + length) {
          range.setStart(node, offsets.from - position);
          start = true;
        }
        if (start && offsets.to <= position + length) {
          range.setEnd(node, offsets.to - position);
          break;
        }
        position += length;
      }
    }
    window.CSS.highlights.set('neo-focus', new window.Highlight(range));
    document
      .querySelectorAll('.chapter-body.focus-cap')
      .forEach((body) => body.classList.remove('focus-cap'));
    const first = body.querySelector('p:not(.poetry)'),
      text = first && document.createTreeWalker(first, 4).nextNode();
    if (text && range.comparePoint(text, 0) === 0) body.classList.add('focus-cap');
  }
  clear(document: Document) {
    this.capOffBody?.classList.remove('cap-off');
    this.capOffBody = null;
    document.defaultView?.CSS?.highlights?.delete('neo-focus');
    document
      .querySelectorAll('.chapter-body.focus-cap')
      .forEach((body) => body.classList.remove('focus-cap'));
  }
}
