import type {
  EditorPort,
  SurfacePort,
  OutlineTarget,
  SearchMatch,
  OutlineSearchMatch,
  DarlingSearchMatch,
} from '@leafloom/editor-contracts';
import type { AppState } from './application';
export type FindMatch = SearchMatch | OutlineSearchMatch | DarlingSearchMatch;
export interface SearchContext {
  snapshot(): AppState;
  patch(value: Partial<AppState>): void;
  editor(): EditorPort | null;
  surfaces(): SurfacePort<HTMLElement> | null;
  rendered(): Promise<void>;
  focusOutline(target?: OutlineTarget): void;
  writable(): boolean;
}
export class SearchViewModel {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private computedQuery = '';
  private computedPanel = '';
  input(query: string) {
    this.context.patch({ search: query });
    this.cancelPending();
    this.timer = setTimeout(() => { this.timer = null; if (this.value.searchOpen) this.search(this.value.search); }, 250);
  }
  private cancelPending() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private freshIfStale() { if (this.computedQuery !== this.value.search || this.computedPanel !== this.value.panel) this.search(this.value.search); }
  constructor(private context: SearchContext) {}
  private get value() {
    return this.context.snapshot();
  }
  private get editor() {
    return this.context.editor();
  }
  private get surfaces() {
    return this.context.surfaces();
  }
  openSearch() {
    if (!this.editor) {
      this.context.patch({ hint: 'Open a book first' });
      return;
    }
    const selected = this.editor?.copySelection().text.slice(0, 80).trim();
    this.context.patch({ searchOpen: true });
    this.search(selected || this.value.search);
    void this.context.rendered().then(() => {
      const input = document.querySelector<HTMLInputElement>('#search-input');
      input?.focus();
      input?.select();
    });
  }
  searchKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.nextMatch(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Tab' && !event.shiftKey) {
      const match = this.value.matches[Math.max(0, this.value.matchIndex)];
      if (!match) return;
      event.preventDefault();
      if (match && 'passageId' in match) this.editor?.selectPassage(match.passageId, match.to);
      if ('passageId' in match) this.surfaces?.focus();
      else if ('darlingId' in match) this.matchElement(match)?.focus();
      else this.context.focusOutline(match);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSearch();
    }
  }
  closeSearch() {
    this.cancelPending();
    this.context.patch({ searchOpen: false, matches: [], matchIndex: -1 });
    this.clearHighlights();
    this.editor?.setAnnotations(this.editor.annotations.filter((a) => a.kind !== 'search'));
    if (this.value.panel === 'manuscript' || this.value.panel === 'notes') this.surfaces?.focus();
  }
  search(query: string) {
    this.cancelPending();
    this.computedQuery = query;
    this.computedPanel = this.value.panel;
    const matches =
      this.value.panel === 'darlings'
        ? (this.editor?.searchDarlings(query) ?? [])
        : this.value.panel === 'outline'
          ? (this.editor?.searchOutline(query) ?? [])
          : (this.editor?.search(query, this.value.panel === 'notes' ? 'notes' : 'manuscript') ??
            []);
    this.context.patch({ search: query, searchedQuery: query, matches, matchIndex: -1 });
    if (this.editor)
      this.editor.setAnnotations([
        ...this.editor.annotations.filter((a) => a.kind !== 'search'),
        ...matches
          .filter((match): match is SearchMatch => 'passageId' in match)
          .map((match, index) => ({
            id: 'search-' + index,
            kind: 'search' as const,
            passageId: match.passageId,
            from: match.from,
            to: match.to,
          })),
      ]);
    void this.context.rendered().then(() => this.paintHighlights());
  }
  nextMatch(direction: number) {
    this.freshIfStale();
    const count = this.value.matches.length;
    if (!count) return;
    const index =
      this.value.matchIndex < 0
        ? direction > 0
          ? 0
          : count - 1
        : (this.value.matchIndex + direction + count) % count;
    this.context.patch({ matchIndex: index });
    const match = this.value.matches[index];
    this.paintHighlights();
    const range = this.matchRange(match);
    const scroll = document.querySelector<HTMLElement>('#paper-scroll');
    if (range && scroll && typeof range.getBoundingClientRect === 'function') {
      const rect = range.getBoundingClientRect();
      scroll.scrollTop += rect.top - window.innerHeight * 0.45;
    } else this.matchElement(match)?.scrollIntoView({ block: 'center' });
  }
  private matchElement(match: FindMatch): HTMLElement | null {
    const selector =
      'passageId' in match
        ? `[data-pid="${CSS.escape(match.passageId)}"]`
        : 'darlingId' in match
          ? `.darling[data-darling-id="${CSS.escape(match.darlingId)}"] .darling-text`
          : match.sectionId
            ? `.ol-line[data-sec-id="${CSS.escape(match.sectionId)}"] .ol-text`
            : `.ol-chapter[data-ch-id="${CSS.escape(match.chapterId)}"] .ol-text`;
    return document.querySelector<HTMLElement>(selector);
  }
  private matchRange(match: FindMatch): Range | null {
    const root = this.matchElement(match);
    if (!root) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null,
      run = 0,
      offset = 0;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0;
      if (
        'darlingId' in match
          ? run === match.runIndex
          : match.from >= offset && match.to <= offset + length
      ) {
        const start = 'darlingId' in match ? match.from : match.from - offset;
        const end = 'darlingId' in match ? match.to : match.to - offset;
        if (start < 0 || end > length) return null;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        return range;
      }
      run++;
      offset += length;
    }
    return null;
  }
  private clearHighlights() {
    const css = CSS as typeof CSS & { highlights?: Map<string, unknown> };
    css.highlights?.delete('neo-search');
    css.highlights?.delete('neo-search-current');
  }
  private paintHighlights() {
    this.clearHighlights();
    if (!this.value.searchOpen) return;
    const css = CSS as typeof CSS & { highlights?: Map<string, unknown> };
    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown })
      .Highlight;
    if (!css.highlights || !HighlightCtor) return;
    const all: Range[] = [],
      current: Range[] = [];
    this.value.matches.forEach((match, index) => {
      const range = this.matchRange(match);
      if (range) (index === this.value.matchIndex ? current : all).push(range);
    });
    css.highlights.set('neo-search', new HighlightCtor(...all));
    css.highlights.set('neo-search-current', new HighlightCtor(...current));
  }
  replace(value: string, all = false) {
    if (!this.context.writable()) return;
    if (!this.editor || this.value.panel !== 'manuscript') return;
    this.freshIfStale();
    if (!this.value.matches.length) {
      this.context.patch({ hint: all ? '0 replaced' : 'No matches' });
      return;
    }
    const matches = all
      ? this.value.matches
      : [this.value.matches[Math.max(0, this.value.matchIndex)]].filter(Boolean);
    this.editor.replaceMatches(
      matches.filter((match): match is SearchMatch => 'passageId' in match),
      value,
    );
    this.search(this.value.search);
  }
}
