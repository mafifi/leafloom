import { FontFamilies } from '@leafloom/desktop-host';
export interface FontPickerPresentation {
  current: string;
  query: string;
  families: string[];
  rows: string[];
}
export interface FontPickerContext {
  requestOS(method: 'fontFamilies', payload: Record<string, never>): Promise<unknown>;
  snapshotCurrentBodyFont(): string;
  preview(font: string): void;
  commit(font: string): Promise<void> | void;
  publish(presentation: FontPickerPresentation | null): void;
  rendered(): Promise<void>;
  hint(message: string): void;
  t(key: string, args?: Record<string, string | number>): string;
}
/** Installed family selection previews the saved manuscript without changing author history. */
export class FontPickerViewModel {
  private presentation: FontPickerPresentation | null = null;
  private generation = 0;
  constructor(private readonly context: FontPickerContext) {}
  private emit(presentation: FontPickerPresentation | null) {
    this.presentation = presentation;
    this.context.publish(presentation);
  }
  async open() {
    if (this.presentation) this.cancel();
    const generation = ++this.generation;
    let families: string[] = [];
    try {
      families = [...new Set(FontFamilies.parse(await this.context.requestOS('fontFamilies', {})))]
        .filter((name) => name && !name.startsWith('.'))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      /* Native inventory errors use the same source notice as an empty list. */
    }
    if (generation !== this.generation) return;
    if (!families.length) {
      this.context.hint(this.context.t('Leafloom couldn’t read the fonts on this computer'));
      return;
    }
    const current = this.context.snapshotCurrentBodyFont() || 'Georgia';
    this.emit({ current, query: '', families, rows: families });
    await this.context.rendered();
  }
  search(query: string) {
    const state = this.presentation;
    if (!state) return;
    const match = query.trim().toLowerCase();
    this.emit({
      ...state,
      query,
      rows: state.families.filter((name) => name.toLowerCase().includes(match)),
    });
  }
  hover(font: string) {
    if (this.presentation?.rows.includes(font)) this.context.preview(font);
  }
  leave() {
    if (this.presentation) this.context.preview(this.presentation.current);
  }
  cancel() {
    this.generation++;
    this.leave();
    this.emit(null);
  }
  async choose(font: string) {
    if (!this.presentation?.rows.includes(font)) return;
    const generation = this.generation;
    await this.context.commit(font);
    if (generation === this.generation) {
      this.generation++;
      this.emit(null);
    }
  }
  async enter() {
    const first = this.presentation?.rows[0];
    if (first) await this.choose(first);
  }
}
