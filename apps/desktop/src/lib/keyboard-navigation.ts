import type { EditorPort, SurfacePort } from '@leafloom/editor-contracts';
import type { AppState } from './application';
export interface KeyboardContext {
  snapshot(): AppState;
  patch(value: Partial<AppState>): void;
  rendered(): Promise<void>;
  editor(): EditorPort | null;
  surfaces(): SurfacePort<HTMLElement> | null;
}
const first = (selectors: string) => {
  for (const selector of selectors.split(',')) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return null;
};
export class KeyboardNavigation {
  private pagePlace: unknown = null;
  constructor(private context: KeyboardContext) {}
  key(event: KeyboardEvent): boolean {
    const value = this.context.snapshot();
    if (
      value.modal ||
      value.goals ||
      value.information ||
      value.librarySettings ||
      !value.library.firstRunDone
    )
      return false;
    const region =
      event.key === 'F6' ||
      (event.key === 'Tab' && event.ctrlKey && !event.metaKey && !event.altKey);
    const boxes =
      value.view === 'library'
        ? ['#shelves', '#shelf-header']
        : ['#paper-scroll', '#nav-pane', '#side-pane', '#bottombar'];
    const current = boxes.findIndex((selector) =>
      document.querySelector(selector)?.contains(document.activeElement),
    );
    if (
      !region &&
      !(
        event.key === 'Escape' &&
        !event.isComposing &&
        value.view === 'editor' &&
        current > 0 &&
        !value.searchOpen
      )
    )
      return false;
    event.preventDefault();
    event.stopPropagation();
    if (current === 0 && value.view === 'editor') this.pagePlace = this.context.editor()?.selection;
    const next =
      event.key === 'Escape'
        ? 0
        : current < 0
          ? event.shiftKey
            ? boxes.length - 1
            : 0
          : (current + (event.shiftKey ? boxes.length - 1 : 1)) % boxes.length;
    if (value.view === 'library')
      first(next === 0 ? '#shelves .book,#shelves .new-book' : '#author-chip')?.focus();
    else {
      this.context.patch({ navOpen: next === 1, sideOpen: next === 2 });
      void this.context.rendered().then(() => {
        if (next === 0) {
          if (value.panel === 'manuscript' || value.panel === 'notes') {
            if (this.pagePlace) this.context.editor()?.restoreSelection(this.pagePlace);
            this.context.surfaces()?.focus({ preventScroll: true });
            if (!this.context.editor()?.chapters.length && value.panel === 'manuscript')
              document.querySelector<HTMLElement>('#tp-title')?.focus();
          } else
            document
              .querySelector<HTMLElement>(
                value.panel === 'outline' ? '#outline-list .ol-text' : '#darlings-list button',
              )
              ?.focus();
        } else
          first(
            next === 1
              ? '#nav-list .nav-item.current .nav-title,#nav-list .nav-title,#nav-add'
              : next === 2
                ? '#sticky-list textarea,#side-pin'
                : '#tabs .tab.active,#back-to-shelf',
          )?.focus();
      });
    }
    return true;
  }
}
