import type { Fragment, Node } from 'prosemirror-model';
const OPENING_DASH = /^\s*[-‐‑‒–—―]/;
interface OpeningPresentation {
  opensDialogue: boolean;
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
    attributions: [],
    speech: [],
  };
  let first = true;
  doc.descendants((node, position, parent, index) => {
    if (node.type.name !== 'paragraph') return;
    if (/^(?:[—–]|--?\s)/.test(node.textContent))
      result.attributions.push({ from: position, to: position + node.nodeSize });
    if (first && !String(node.attrs.class).split(/\s+/).includes('poetry')) {
      result.opensDialogue = OPENING_DASH.test(node.textContent);
      first = false;
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
  cache.set(doc.content, result);
  return result;
}
