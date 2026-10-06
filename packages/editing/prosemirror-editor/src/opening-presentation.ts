import type { Fragment, Node } from 'prosemirror-model';
const OPENING_DASH = /^\s*[-‐‑‒–—―]/;
interface OpeningPresentation {
  opensDialogue: boolean;
  first: { from: number; to: number } | null;
  attributions: { from: number; to: number }[];
  speech: { from: number; to: number }[];
}
const cache = new WeakMap<Fragment, OpeningPresentation>();
/** NEO's screen-only speech marks follow the first non-poetry paragraph. */
export function openingPresentation(doc: Node): OpeningPresentation {
  const cached = cache.get(doc.content);
  if (cached) return cached;
  const result: OpeningPresentation = {
    opensDialogue: false,
    first: null,
    attributions: [],
    speech: [],
  };
  let fallback: {from:number;to:number} | null = null;
  doc.descendants((node, position, parent, index) => {
    if (node.type.name !== 'paragraph') return;
    if (/^(?:[—–]|--?\s)/.test(node.textContent))
      result.attributions.push({ from: position, to: position + node.nodeSize });
    if (!String(node.attrs.class).split(/\s+/).some(c => ['poetry','scene-break','ghost'].includes(c))) {
      fallback ??= {from:position,to:position+node.nodeSize};
      if (!result.first && node.textContent.trim()) {
        result.first={from:position,to:position+node.nodeSize};
        result.opensDialogue=OPENING_DASH.test(node.textContent);
      }
    }
    const previous = index > 0 ? parent?.child(index - 1) : undefined;
    if (
      previous &&
      String(previous.attrs.class).split(/\s+/).includes('scene-break') &&
      OPENING_DASH.test(node.textContent)
    )
      result.speech.push({ from: position, to: position + node.nodeSize });
    return false;
  });
  result.first ??= fallback;
  cache.set(doc.content, result);
  return result;
}
