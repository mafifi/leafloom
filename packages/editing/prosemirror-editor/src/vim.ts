import { TextSelection } from 'prosemirror-state';
import { closeHistory } from 'prosemirror-history';
import type { EditorView } from 'prosemirror-view';
import type { SurfaceHooks, VimState } from '@leafloom/editor-contracts';
import { BookCore, bookSchema } from './core';

const characterClass = (character: string | undefined) =>
  !character || /\s/u.test(character) ? 0 : /[\p{L}\p{M}\p{N}_'’]/u.test(character) ? 1 : 2;
/** NEO word motions count Unicode characters, punctuation runs and apostrophes. */
export function wordOffset(text: string, offset: number, key: 'w' | 'b' | 'e'): number {
  const before = Array.from(text.slice(0, offset)),
    after = Array.from(text.slice(offset));
  let count = 0;
  if (key === 'b') {
    before.reverse();
    while (count < before.length && !characterClass(before[count])) count++;
    const category = characterClass(before[count]);
    while (count < before.length && category && characterClass(before[count]) === category) count++;
    return offset - before.slice(0, count).join('').length;
  }
  if (key === 'w') {
    const category = characterClass(after[0]);
    while (count < after.length && category && characterClass(after[count]) === category) count++;
    while (count < after.length && !characterClass(after[count])) count++;
  } else {
    count = 1;
    while (count < after.length && !characterClass(after[count])) count++;
    const category = characterClass(after[count]);
    while (count + 1 < after.length && characterClass(after[count + 1]) === category) count++;
  }
  return Math.min(text.length, offset + after.slice(0, count).join('').length);
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Native character motions and forward-delete operate on rendered grapheme clusters. */
export function graphemeOffset(text: string, offset: number, direction: -1 | 1): number {
  let previous = 0;
  for (const segment of graphemes.segment(text)) {
    const end = segment.index + segment.segment.length;
    if (direction > 0 && end > offset) return end;
    if (direction < 0 && end >= offset) return segment.index;
    previous = end;
  }
  return direction < 0 ? previous : text.length;
}

export class VimController {
  private enabled = false;
  private navigation = false;
  private visual = false;
  private count = '';
  private pending = '';
  constructor(
    private readonly core: BookCore,
    private readonly hooks: () => SurfaceHooks,
    private readonly focus: () => void,
    private readonly manuscriptPositionAt?: (coords: {
      left: number;
      top: number;
    }) => number | null,
  ) {}
  get state(): VimState {
    return { enabled: this.enabled, navigation: this.navigation, visual: this.visual };
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.navigation = this.visual = false;
    this.count = this.pending = '';
    this.publish();
  }
  leaveEditor() {
    if (this.navigation) this.setNavigation(false);
  }
  private publish() {
    this.core.document.body?.classList.toggle('vim-nav', this.navigation);
    this.hooks().vimState?.(this.state);
  }
  private setNavigation(value: boolean) {
    this.navigation = value;
    this.visual = false;
    this.count = this.pending = '';
    if (!value && !this.core.state.selection.empty)
      this.select(this.core.state.selection.to, false);
    this.publish();
  }
  private select(position: number, extend = this.visual) {
    const anchor = extend ? this.core.state.selection.anchor : position;
    this.core.dispatch(
      this.core.state.tr.setSelection(
        TextSelection.between(
          this.core.state.doc.resolve(anchor),
          this.core.state.doc.resolve(position),
        ),
      ),
      'vim.motion',
    );
  }
  private passages() {
    const owner = this.core.activeSection;
    return owner ? this.core.passages(owner.id) : [];
  }
  private current() {
    const head = this.core.state.selection.head;
    return this.passages().find(
      (passage) => head >= passage.pos + 1 && head <= passage.pos + 1 + passage.size,
    );
  }
  private text() {
    const passage = this.current();
    return passage?.node.textBetween(0, passage.node.content.size, '\n', '\ufffc') ?? '';
  }
  private character(direction: number, times = 1) {
    for (let i = 0; i < times; i++) {
      const passage = this.current();
      if (!passage) return;
      const head = this.core.state.selection.head,
        offset = head - passage.pos - 1,
        text = this.text();
      if (direction < 0 && offset > 0) {
        this.select(passage.pos + 1 + graphemeOffset(text, offset, -1));
        continue;
      }
      if (direction > 0 && offset < passage.size) {
        this.select(passage.pos + 1 + graphemeOffset(text, offset, 1));
        continue;
      }
      const passages = this.passages(),
        next = passages[passages.indexOf(passage) + direction];
      if (next) this.select(next.pos + 1 + (direction < 0 ? next.size : 0));
    }
  }
  private chapter(direction: number, times = 1, end = false) {
    const current = this.core.activeSection;
    if (!current || current.role !== 'chapter' || this.visual) return;
    const chapters = this.core.chapters,
      index = chapters.findIndex((chapter) => chapter.id === current.id),
      target = chapters[Math.max(0, Math.min(chapters.length - 1, index + direction * times))];
    if (!target || target.kind === 'contents' || !this.core.supported(target.id)) return;
    const passage = this.core.passages(target.id)[
      end ? this.core.passages(target.id).length - 1 : 0
    ];
    if (passage) {
      this.select(passage.pos + 1 + (end ? passage.size : 0), false);
      this.focus();
    }
  }
  private paragraph(direction: number) {
    const passages = this.passages(),
      current = this.current();
    if (!current) return;
    const target = passages[passages.indexOf(current) + direction];
    if (target) this.select(target.pos + 1 + (direction < 0 ? target.size : 0));
    else this.chapter(direction, 1, direction < 0);
  }
  private boundary(end: boolean) {
    const passage = this.current();
    if (passage) this.select(passage.pos + 1 + (end ? passage.size : 0));
  }
  private documentBoundary(end: boolean) {
    const passages = this.passages(),
      passage = passages[end ? passages.length - 1 : 0];
    if (passage) this.select(passage.pos + 1 + (end ? passage.size : 0));
  }
  private word(key: 'w' | 'b' | 'e') {
    const passage = this.current();
    if (!passage) return;
    const offset = this.core.state.selection.head - passage.pos - 1,
      next = wordOffset(this.text(), offset, key);
    if (next === offset || (key === 'w' && next === passage.size)) {
      this.paragraph(key === 'b' ? -1 : 1);
      return;
    }
    this.select(passage.pos + 1 + next);
  }
  private sentence(direction: number) {
    const passage = this.current();
    if (!passage) return;
    const offset = this.core.state.selection.head - passage.pos - 1,
      text = this.text();
    if (direction > 0) {
      const match = text.slice(offset).match(/[.!?…][”’»«“]?\s+/u);
      if (match) this.select(passage.pos + 1 + offset + (match.index ?? 0) + match[0].length);
      else this.paragraph(1);
    } else {
      const boundaries = Array.from(text.slice(0, offset).matchAll(/[.!?…][”’»«“]?\s+/gu));
      const last = boundaries.filter((match) => match.index + match[0].length < offset).at(-1);
      this.select(passage.pos + 1 + (last ? last.index + last[0].length : 0));
    }
  }
  private nativeMotion(view: EditorView, direction: number, unit: 'line' | 'lineboundary') {
    const selection = view.dom.ownerDocument.getSelection(),
      before = this.core.state.selection.head;
    if (selection && typeof selection.modify === 'function') {
      selection.modify(
        this.visual ? 'extend' : 'move',
        direction < 0 ? 'backward' : 'forward',
        unit,
      );
      if (
        selection.anchorNode &&
        selection.focusNode &&
        view.dom.contains(selection.anchorNode) &&
        view.dom.contains(selection.focusNode)
      ) {
        const section = this.core.section(this.core.activeSection!.id),
          base = section.pos + 1,
          anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset) + base,
          head = view.posAtDOM(selection.focusNode, selection.focusOffset) + base;
        this.core.dispatch(
          this.core.state.tr.setSelection(TextSelection.create(this.core.state.doc, anchor, head)),
          'vim.motion',
        );
        if (head !== before) return;
      }
    }
    if (unit === 'lineboundary') this.boundary(direction > 0);
    else this.paragraph(direction);
  }
  private openParagraph(above: boolean) {
    const passage = this.current();
    if (!passage) return;
    this.setNavigation(false);
    const at = above ? passage.pos : passage.pos + passage.node.nodeSize,
      paragraph = bookSchema.nodes.paragraph.create(),
      tr = closeHistory(this.core.state.tr).insert(at, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, at + 1)).setStoredMarks([]);
    this.core.dispatch(tr, 'vim.paragraph');
  }
  private inclusive() {
    const selection = this.core.state.selection;
    if (selection.empty) return;
    if (selection.head > selection.anchor) this.character(1);
  }
  private halfPage(view: EditorView, direction: number) {
    if (this.core.activeSection?.role !== 'chapter') return;
    const scroll = view.dom.closest<HTMLElement>('#paper-scroll');
    if (!scroll) return;
    scroll.scrollTop += (direction * scroll.clientHeight) / 2;
    const box = scroll.getBoundingClientRect();
    const coords = { left: box.left + box.width / 2, top: box.top + box.height / 2 };
    if (this.manuscriptPositionAt) {
      const position = this.manuscriptPositionAt(coords);
      if (position !== null) this.select(position);
      return;
    }
    const point = view.posAtCoords(coords);
    if (point) {
      const section = this.core.section(this.core.activeSection!.id);
      this.select(point.pos + section.pos + 1);
    }
  }
  handle(event: KeyboardEvent, view: EditorView): boolean {
    if (!this.enabled || event.isComposing || event.keyCode === 229) return false;
    const key = event.key;
    if (!this.navigation) {
      if (
        key === 'Escape' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.setNavigation(true);
        return true;
      }
      return false;
    }
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.visual = false;
      this.count = this.pending = '';
      this.select(this.core.state.selection.head, false);
      this.publish();
      return true;
    }
    if (event.ctrlKey && !event.metaKey && !event.altKey && (key === 'd' || key === 'u')) {
      event.preventDefault();
      event.stopPropagation();
      this.halfPage(view, key === 'd' ? 1 : -1);
      return true;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (key.length > 1 && !['Enter', 'Backspace', 'Delete', 'Tab'].includes(key)) return false;
    event.preventDefault();
    event.stopPropagation();
    if (/^[0-9]$/.test(key) && (key !== '0' || this.count)) {
      this.count += key;
      return true;
    }
    const times = Math.max(1, Math.min(999, Number.parseInt(this.count || '1', 10))),
      pending = this.pending;
    this.count = this.pending = '';
    if (pending) {
      if (pending === 'g' && key === 'g') this.documentBoundary(false);
      else if (key === pending && (key === '[' || key === ']'))
        this.chapter(key === ']' ? 1 : -1, times);
      return true;
    }
    switch (key) {
      case 'h':
      case 'Backspace':
        this.character(-1, times);
        break;
      case 'l':
      case ' ':
        this.character(1, times);
        break;
      case 'j':
      case 'Enter':
        for (let i = 0; i < times; i++) this.nativeMotion(view, 1, 'line');
        break;
      case 'k':
        for (let i = 0; i < times; i++) this.nativeMotion(view, -1, 'line');
        break;
      case 'w':
      case 'b':
      case 'e':
        for (let i = 0; i < times; i++) this.word(key);
        break;
      case '0':
      case '^':
        this.nativeMotion(view, -1, 'lineboundary');
        break;
      case '$':
        this.nativeMotion(view, 1, 'lineboundary');
        break;
      case '(':
      case ')':
        for (let i = 0; i < times; i++) this.sentence(key === '(' ? -1 : 1);
        break;
      case '{':
      case '}':
        for (let i = 0; i < times; i++) this.paragraph(key === '{' ? -1 : 1);
        break;
      case 'G':
        this.documentBoundary(true);
        break;
      case 'g':
      case '[':
      case ']':
        this.pending = key;
        break;
      case 'v':
        this.visual = !this.visual;
        if (!this.visual) this.select(this.core.state.selection.to, false);
        this.publish();
        break;
      case 'y':
        if (this.visual) {
          this.inclusive();
          this.hooks().copy?.(this.core.copySelection());
          this.visual = false;
          this.select(this.core.state.selection.from, false);
          this.publish();
        }
        break;
      case 'd':
      case 'x':
      case 'Delete':
        if (this.visual) {
          this.inclusive();
          const payload = this.core.cutSelection();
          this.hooks().copy?.(payload);
          this.visual = false;
          this.publish();
        } else if (key !== 'd')
          for (let i = 0; i < times; i++) {
            const current = this.core.state.selection.head;
            this.character(1);
            const to = this.core.state.selection.head;
            this.select(current, false);
            if (to > current)
              this.core.dispatch(
                closeHistory(this.core.state.tr).delete(current, to),
                'vim.delete',
              );
          }
        break;
      case 'i':
        this.setNavigation(false);
        break;
      case 'a':
        this.setNavigation(false);
        this.character(1);
        break;
      case 'I':
        this.setNavigation(false);
        this.nativeMotion(view, -1, 'lineboundary');
        break;
      case 'A':
        this.setNavigation(false);
        this.nativeMotion(view, 1, 'lineboundary');
        break;
      case 'o':
        this.openParagraph(false);
        break;
      case 'O':
        this.openParagraph(true);
        break;
      case '/':
        this.setNavigation(false);
        this.hooks().search?.();
        break;
    }
    return true;
  }
}
