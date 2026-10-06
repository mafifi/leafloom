import { screenplayElementFromLegacyClass, screenplayPaginate, screenplayLength, type ScreenplayPagination } from '@leafloom/document-contracts';
import type { EditorPort } from '@leafloom/editor-contracts';
import type {Telemetry} from '@leafloom/telemetry-contracts';

export type ScriptLayout = ScreenplayPagination & {
  passages: string[];
  scenes: { passageId: string; index: number; lines: number }[];
};
export interface ScriptLayoutContext {
  editor(): EditorPort | null;
  telemetry?():Telemetry|undefined;
  changed(layout: ScriptLayout | null): void;
}
/** Browser geometry is a projection. Only measured line counts cross the editor port. */
export class ScreenplayLayoutViewModel {
  private root: HTMLElement | null = null;
  private editor: EditorPort | null = null;
  private stop: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private resize: ResizeObserver | null = null;
  private room: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private signature = '';
  private layout: ScriptLayout | null = null;
  constructor(private readonly context: ScriptLayoutContext) {}
  mount(root: HTMLElement) {
    this.dispose();this.root = root;
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(root, { childList: true, characterData: true, subtree: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.schedule());this.resize.observe(root);
    }
    void root.ownerDocument.fonts?.ready.then(() => this.schedule());
    this.refresh();
    return { destroy: () => { if (this.root === root) this.dispose(); } };
  }
  refresh() {
    const editor = this.context.editor();
    if (this.editor !== editor) {
      this.stop?.();this.editor = editor;this.signature = '';
      this.stop = editor?.subscribe(event => {
        if (event.kind === 'changed') this.schedule();
        else if (event.kind === 'selection' && this.layout) this.context.changed(this.layout);
      }) ?? null;
    }
    if (!editor || editor.manuscriptMode !== 'screenplay') {
      if (this.layout) { this.layout = null;this.context.changed(null); }
      return;
    }
    this.schedule();
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null;this.measure(); }, 80);
  }
  private measure() {
    const telemetry=this.context.telemetry?.();
    if(telemetry)telemetry.sync('ui.screenplay.measure',()=>this.measureLayout());
    else this.measureLayout();
  }
  private measureLayout() {
    const editor = this.context.editor(), root = this.root;
    if (!editor || !root || editor.manuscriptMode !== 'screenplay') return;
    const paragraphs = [...root.querySelectorAll<HTMLParagraphElement>('.chapter-body p[data-pid]')].filter(p => !p.closest('.ghost') && !p.classList.contains('scene-break'));
    const document = root.ownerDocument;
    if (!this.room) {
      this.room = document.createElement('div');this.room.className = 'sp-measure script-body';
      this.room.setAttribute('aria-hidden','true');document.body.append(this.room);
    }
    this.room.replaceChildren(...paragraphs.map(p => {
      const clone = p.cloneNode(true) as HTMLParagraphElement;
      for (const attr of ['data-pg','data-fill','data-ghost','data-ghost-empty']) clone.removeAttribute(attr);
      clone.style.removeProperty('--fill');return clone;
    }));
    const clones = [...this.room.children] as HTMLParagraphElement[];
    const counts = clones.map(p => Math.max(1,Math.round(p.getBoundingClientRect().height / 20)));
    const items = paragraphs.map((p,index) => ({ type: screenplayElementFromLegacyClass(p.className) ?? 'action' as const, lines: counts[index] }));
    const pg = screenplayPaginate(items);
    const scenes: ScriptLayout['scenes'] = [];
    paragraphs.forEach((p,index) => {
      const at = pg.at[index];
      if (items[index].type === 'scene-heading') scenes.push({passageId:p.dataset.pid!,index,lines:0});
      if (scenes.length) scenes[scenes.length-1].lines += counts[index] + at.before;
    });
    root.style.setProperty('--sp-last',String(Math.max(0,54-pg.used)));
    this.room.replaceChildren();
    const layout: ScriptLayout = {...pg,passages:paragraphs.map(p=>p.dataset.pid!),scenes};
    const signature = JSON.stringify([layout, counts]);
    if (signature === this.signature) return;
    this.signature = signature;this.layout = layout;
    editor.setOutlineSceneMeasurements(paragraphs.map((p,index)=>({passageId:p.dataset.pid!,lines:counts[index],before:pg.at[index].before,...(pg.at[index].brk ? {page:pg.at[index].page,fill:pg.at[index].fill} : {})})));
    this.context.changed(layout);
  }
  dispose() {
    if (this.timer) clearTimeout(this.timer);this.timer = null;
    this.stop?.();this.stop = null;this.observer?.disconnect();this.resize?.disconnect();
    this.room?.remove();this.room = null;this.root = null;this.editor = null;this.signature = '';this.layout = null;
  }
}
export function scriptCounters(layout: ScriptLayout, editor: EditorPort, sceneMode: boolean, wordMode: string, t: (key: string, values: Record<string,string|number>)=>string) {
  const length = screenplayLength(layout);
  const index = layout.passages.indexOf(editor.caret?.passageId ?? '');
  const page = index >= 0 ? layout.at[index].page : 1;
  const scene = layout.scenes.filter(row => row.index <= index).length;
  return {
    wordLabel: wordMode === 'book' ? t('{pages} pages · ~{n} min',{pages:length.text,n:length.minutes}) : t('{n} words',{n:editor.words}),
    positionLabel: sceneMode ? t('scene {n} of {total}',{n:scene,total:layout.scenes.length}) : t('page {p} of {total}',{p:page,total:layout.pages}),
  };
}
