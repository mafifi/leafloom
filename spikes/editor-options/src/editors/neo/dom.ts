import type { Run } from '../../contracts';
import { escapeHtml } from './typography';

export function runsHtml(runs: Run[]) {
  return runs.map(run => {
    let html = escapeHtml(run.text).replace(/\n/g, '<br>');
    if (run.italic) html = `<i>${html}</i>`;
    if (run.bold) html = `<b>${html}</b>`;
    if (run.placeholder) html = `<span data-placeholder="${escapeHtml(run.placeholder)}">${html}</span>`;
    return html;
  }).join('') || '<br>';
}
export function readRuns(root: Node): Run[] {
  const runs: Run[] = [];
  const append = (text: string, marks: Omit<Run, 'text'>) => {
    if (!text) return;
    const previous = runs.at(-1);
    if (previous && previous.bold === marks.bold && previous.italic === marks.italic && previous.placeholder === marks.placeholder) previous.text += text;
    else runs.push({ text, ...marks });
  };
  const walk = (node: Node, inherited: Omit<Run, 'text'>) => {
    if (node.nodeType === Node.TEXT_NODE) { append((node.textContent || '').replace(/\u00a0/g, ' '), inherited); return; }
    if (!(node instanceof Element)) return;
    if (node.matches('script,style,meta,link,img,table,iframe,object,svg,math,template')) return;
    if (node.tagName === 'BR') { if (root.childNodes.length !== 1) append('\n', inherited); return; }
    const marks = { ...inherited };
    const style = node instanceof HTMLElement ? node.style : null;
    const weight = style?.fontWeight || '';
    if (node.matches('b,strong') && weight !== 'normal' && weight !== '400' || /^(bold|bolder)$/.test(weight) || parseInt(weight) >= 600) marks.bold = true;
    if (node.matches('i,em') || style?.fontStyle === 'italic') marks.italic = true;
    if (node instanceof HTMLElement && node.dataset.placeholder) marks.placeholder = node.dataset.placeholder;
    node.childNodes.forEach(child => walk(child, marks));
  };
  root.childNodes.forEach(node => walk(node, {}));
  return runs.length ? runs : [{ text: '' }];
}
/** NEO cleanPasteHtml's detached parsing, block markers, style promotion and inline-single-block policy. */
export function cleanPasteHtml(html: string) {
  const holder = new DOMParser().parseFromString(html, 'text/html').body;
  holder.querySelectorAll('script,style,meta,link,img,table,head,title,iframe,object,svg,math,template').forEach(n => n.remove());
  const BREAK = '\uE000';
  holder.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,section,article,header,footer,tr,dd,dt').forEach(b => {
    b.before(document.createTextNode(BREAK)); b.after(document.createTextNode(BREAK));
  });
  holder.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode(BREAK)));
  // Clipboard placeholder identities are never trusted as manuscript identities.
  holder.querySelectorAll('[data-placeholder]').forEach(el => el.removeAttribute('data-placeholder'));
  const paras: Run[][] = [[]];
  for (const run of readRuns(holder)) {
    run.text.split(BREAK).forEach((text, i) => {
      if (i) paras.push([]);
      if (text) paras.at(-1)!.push({ ...run, text: text.replace(/\s+/g, ' ') });
    });
  }
  const output = paras.map(runs => {
    if (runs[0]) runs[0].text = runs[0].text.trimStart();
    if (runs.at(-1)) runs.at(-1)!.text = runs.at(-1)!.text.trimEnd();
    return runs;
  }).filter(runs => runs.some(r => r.text.trim())).map(runs => `<p>${runsHtml(runs)}</p>`);
  return output.length === 1 ? output[0].slice(3, -4) : output.join('');
}
export function pointAt(el: Element, offset: number): { node: Node; offset: number } {
  if (el.childNodes.length === 1 && el.firstChild instanceof HTMLBRElement) return { node: el, offset: 0 };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let left = Math.max(0, offset), last: Node | null = null, node: Node | null;
  while ((node = walker.nextNode())) {
    if (node instanceof HTMLBRElement) {
      const parent = node.parentNode!;
      const index = Array.from(parent.childNodes).indexOf(node);
      if (left === 0) return { node: parent, offset: index };
      left--;
      if (left === 0) return { node: parent, offset: index + 1 };
    } else if (node.nodeType === Node.TEXT_NODE) {
      if (left <= (node.textContent?.length || 0)) return { node, offset: left };
      left -= node.textContent?.length || 0; last = node;
    }
  }
  return last ? { node: last, offset: last.textContent?.length || 0 } : { node: el, offset: 0 };
}

export function offsetAt(root: Element, node: Node, offset: number) {
  if (root.childNodes.length === 1 && root.firstChild instanceof HTMLBRElement) return 0;
  const pre = document.createRange(); pre.selectNodeContents(root); pre.setEnd(node, offset);
  const fragment = pre.cloneContents();
  const walk = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let length = 0, part: Node | null;
  while ((part = walk.nextNode())) {
    if (part.nodeType === Node.TEXT_NODE) length += part.textContent?.length || 0;
    else if (part instanceof HTMLBRElement) length++;
  }
  return length;
}
