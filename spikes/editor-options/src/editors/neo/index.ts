import type { ManuscriptEditor, Manuscript, EditorCallbacks, Selection, ChangeReason, Block } from '../../contracts';
import { cleanPasteHtml, offsetAt, pointAt, readRuns, runsHtml } from './dom';
import { dialogueDashes, markdownInline, mdEmphasisMatch, quoteOpenIn } from './typography';

/** Native browser editing, adapted from NEO app.js (MIT, Hugh Howey). */
export function createNeoEditor(): ManuscriptEditor {
  let host: HTMLElement | null = null, current: Manuscript, callbacks: EditorCallbacks;
  let composing = false, commandDepth = 0, remembered: Selection | null = null;
  let disposers: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(element: HTMLElement, name: K, fn: (e: HTMLElementEventMap[K]) => void) => {
    element.addEventListener(name, fn as EventListener);
    disposers.push(() => element.removeEventListener(name, fn as EventListener));
  };
  const blockAt = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('p[data-block-id]') || null;
  const selection = (): Selection | null => {
    const sel = window.getSelection();
    if (!host || !sel?.rangeCount) return null;
    const range = sel.getRangeAt(0), start = blockAt(range.startContainer), end = blockAt(range.endContainer);
    if (!start || start !== end || !host.contains(start) || start.classList.contains('scene-break')) return null;
    const chapter = start.closest<HTMLElement>('.chapter');
    if (!chapter?.dataset.id || !start.dataset.blockId) return null;
    const offset = (node: Node, n: number) => offsetAt(start, node, n);
    return { chapterId: chapter.dataset.id, blockId: start.dataset.blockId, from: offset(range.startContainer, range.startOffset), to: offset(range.endContainer, range.endOffset) };
  };
  const select = (s: Selection) => {
    if (!host) return;
    const block = Array.from(host.querySelectorAll<HTMLElement>('p[data-block-id]')).find(p => p.dataset.blockId === s.blockId && p.closest<HTMLElement>('.chapter')?.dataset.id === s.chapterId);
    if (!block || block.classList.contains('scene-break')) return;
    block.closest<HTMLElement>('.chapter-body')?.focus({ preventScroll: true });
    const a = pointAt(block, s.from), b = pointAt(block, s.to), range = document.createRange();
    range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); remembered = selection();
  };
  const snapshot = (): Manuscript => {
    const result = structuredClone(current);
    const seen = new Set<string>();
    for (const chapter of result.chapters) {
      const body = Array.from(host?.querySelectorAll<HTMLElement>('.chapter-body') || []).find(el => el.closest<HTMLElement>('.chapter')?.dataset.id === chapter.id);
      if (!body) continue;
      // Chromium normally emits P via defaultParagraphSeparator. Heal other native block wrappers.
      for (const node of Array.from(body.childNodes)) {
        if (node instanceof HTMLElement && node.tagName === 'P') continue;
        if (node.nodeType === Node.TEXT_NODE && !node.textContent) { node.remove(); continue; }
        const p = document.createElement('p');
        if (node instanceof HTMLElement && node.tagName === 'DIV') { while (node.firstChild) p.append(node.firstChild); node.replaceWith(p); }
        else { node.before(p); p.append(node); }
      }
      if (!body.children.length) { const p = document.createElement('p'); p.append(document.createElement('br')); body.append(p); }
      chapter.blocks = Array.from(body.children).map(el => {
        const p = el as HTMLElement;
        let id = p.dataset.blockId;
        if (!id || seen.has(id)) { id = crypto.randomUUID(); p.dataset.blockId = id; }
        seen.add(id);
        const kind: Block['kind'] = p.classList.contains('scene-break') ? 'scene-break' : p.classList.contains('poetry') ? 'poetry' : 'paragraph';
        return { id, kind, runs: kind === 'scene-break' ? [] : readRuns(p) };
      });
    }
    return result;
  };
  const publish = (reason: ChangeReason) => {
    if (!host) return;
    const doc = snapshot(); remembered = selection(); current = structuredClone(doc);
    callbacks.changed(doc, remembered, reason);
  };
  const command = (name: string, value: string | undefined, reason: ChangeReason) => {
    if (!host) return;
    if (!selection() && remembered) select(remembered);
    commandDepth++;
    try { document.execCommand(name, false, value); } finally { commandDepth--; }
    publish(reason);
  };
  const batch = (fn: () => void, reason: ChangeReason) => {
    commandDepth++;
    try { fn(); } finally { commandDepth--; }
    publish(reason);
  };
  const replace = (doc: Manuscript, requested?: Selection | null) => {
    const restore = requested === undefined ? selection() || remembered : requested;
    current = structuredClone(doc);
    if (!host) return;
    host.replaceChildren();
    for (const chapter of current.chapters) {
      const section = document.createElement('section'); section.className = 'chapter'; section.dataset.id = chapter.id;
      const heading = document.createElement('h2'); heading.className = 'chapter-title'; heading.textContent = chapter.title;
      const body = document.createElement('div'); body.className = 'chapter-body'; body.contentEditable = 'true'; body.setAttribute('role', 'textbox'); body.setAttribute('aria-multiline', 'true'); body.setAttribute('aria-label', chapter.title);
      for (const block of chapter.blocks) {
        const p = document.createElement('p'); p.dataset.blockId = block.id;
        if (block.kind === 'scene-break') { p.className = 'scene-break'; p.contentEditable = 'false'; p.textContent = '***'; }
        else { if (block.kind === 'poetry') p.className = 'poetry'; p.innerHTML = runsHtml(block.runs); }
        body.append(p);
      }
      section.append(heading, body); host.append(section);
    }
    remembered = restore;
    if (restore) select(restore);
  };
  const richPaste = (html: string) => command('insertHTML', cleanPasteHtml(html), 'paste');
  const plainPaste = (text: string) => {
    if (!selection() && remembered) select(remembered);
    batch(() => text.replace(/\r/g, '').split(/\n+/).filter(p => p.trim()).forEach((p, i) => {
      if (i) document.execCommand('insertParagraph');
      const line = dialogueDashes(p.trim());
      const styled = markdownInline(line);
      document.execCommand(styled ? 'insertHTML' : 'insertText', false, styled || line);
    }), 'paste');
  };
  const smartKeys = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const s = selection(); if (!s || s.from !== s.to) return;
    const block = blockAt(window.getSelection()?.anchorNode || null); if (!block) return;
    const before = (block.textContent || '').slice(0, s.from);
    const replaceBefore = (count: number, text: string) => { select({ ...s, from: s.from - count }); command('insertText', text, 'typing'); };
    if (e.key === '*' || e.key === '_') {
      const hit = mdEmphasisMatch(before, e.key);
      if (hit) {
        e.preventDefault();
        batch(() => {
          if (hit.part) { select({ ...s, from: s.to - hit.part }); document.execCommand('delete'); }
          select({ ...s, from: hit.start, to: hit.start + hit.open }); document.execCommand('delete');
          const end = s.to - hit.part - hit.open;
          for (const mark of [hit.italic && 'italic', hit.bold && 'bold'].filter((x): x is string => !!x)) {
            select({ ...s, from: hit.start, to: end });
            if (!document.queryCommandState(mark)) document.execCommand(mark);
          }
          select({ ...s, from: end, to: end });
          for (const mark of [hit.italic && 'italic', hit.bold && 'bold'].filter((x): x is string => !!x)) if (document.queryCommandState(mark)) document.execCommand(mark);
        }, 'format'); return;
      }
    }
    if (e.key === '-' && before.endsWith('-')) { e.preventDefault(); replaceBefore(1, '—'); return; }
    if (e.key === '.' && before.endsWith('..')) { e.preventDefault(); replaceBefore(2, '…'); return; }
    if (e.key === '"' || e.key === "'") {
      e.preventDefault(); const prev = before.slice(-1);
      let opening = !prev || /[\s\(\[\{‘“«„>]/.test(prev);
      if (prev === '—' || prev === '–') opening = !quoteOpenIn(before, e.key === '"' ? '“' : '‘', e.key === '"' ? '”' : '’', e.key === '"' ? '"' : '');
      command('insertText', e.key === '"' ? opening ? '“' : '”' : opening ? '‘' : '’', 'typing'); return;
    }
    const key = e.key === 'Enter' ? '' : e.key;
    if (key.length <= 1) {
      const from = /^-\s*$/.test(before) ? 0 : /\s-$/.test(before) ? before.length - 2 : -1;
      if (from >= 0) {
        const fragment = before.slice(from), next = dialogueDashes(fragment + key, from === 0, !key, from > 0);
        // Only replace existing text; the browser still inserts the pressed key.
        if (next !== fragment + key) replaceBefore(fragment.length, key ? next.slice(0, -key.length) : next);
      }
    }
  };
  const destroy = () => { disposers.forEach(fn => fn()); disposers = []; host?.replaceChildren(); host = null; remembered = null; composing = false; };
  return {
    id: 'neo',
    mount(element, doc, cb) {
      destroy(); host = element; callbacks = cb; replace(doc, null);
      document.execCommand('defaultParagraphSeparator', false, 'p');
      listen(element, 'keydown', e => {
        if (composing || e.isComposing || e.keyCode === 229) return;
        if (callbacks.gesture(e)) { e.preventDefault(); e.stopPropagation(); return; }
        if (e.defaultPrevented) return;
        if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.code === 'KeyB' || e.code === 'KeyI')) {
          e.preventDefault(); command(e.code === 'KeyB' ? 'bold' : 'italic', undefined, 'format'); return;
        }
        smartKeys(e);
      });
      listen(element, 'input', () => { if (!commandDepth && !composing) publish('typing'); });
      listen(element, 'paste', e => { if (composing) return; e.preventDefault(); const html = e.clipboardData?.getData('text/html'); if (html) richPaste(html); else plainPaste(e.clipboardData?.getData('text/plain') || ''); });
      listen(element, 'compositionstart', () => { composing = true; });
      listen(element, 'compositionend', () => { composing = false; publish('composition'); });
      const changed = () => { const next = selection(); if (next) remembered = next; callbacks.selectionChanged(next); };
      document.addEventListener('selectionchange', changed); disposers.push(() => document.removeEventListener('selectionchange', changed));
    },
    read: () => ({ document: snapshot(), selection: selection() || remembered }),
    replace, select,
    insertText: text => command('insertText', text, 'typing'),
    format: mark => command(mark, undefined, 'format'),
    paste: richPaste, destroy
  };
}
