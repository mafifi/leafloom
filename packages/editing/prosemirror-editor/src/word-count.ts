import type { Node as PMNode } from 'prosemirror-model';
import { runs, runText } from './identity';
const wordSegmenters = new Map<string, Intl.Segmenter>();
export const countWords = (text: string) => {
  if (!text.trim()) return 0;
  const scripts: [RegExp, string][] = [
    [/[\u0e00-\u0e7f]/, 'th'],
    [/[\u0e80-\u0eff]/, 'lo'],
    [/[\u1000-\u109f]/, 'my'],
    [/[\u1780-\u17ff]/, 'km'],
  ];
  const script = scripts.find(([pattern]) => pattern.test(text));
  if (script && typeof Intl.Segmenter === 'function') {
    let segmenter = wordSegmenters.get(script[1]);
    if (!segmenter) {
      segmenter = new Intl.Segmenter(script[1], { granularity: 'word' });
      wordSegmenters.set(script[1], segmenter);
    }
    return Array.from(segmenter.segment(text)).filter((part) => part.isWordLike).length;
  }
  return (text.match(/\S+/g) || []).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
};

const wordCache = new WeakMap<PMNode, number>();
export function countNodeWords(node: PMNode): number {
  const cached = wordCache.get(node);
  if (cached !== undefined) return cached;
  let count = 0;
  if (node.isTextblock) {
    if (
      !String(node.attrs.class)
        .split(/\s+/)
        .some((value) => value === 'ghost' || value === 'scene-break')
    )
      count = countWords(runText(runs(node.content)));
  } else
    node.forEach((child) => {
      count += countNodeWords(child);
    });
  wordCache.set(node, count);
  return count;
}
