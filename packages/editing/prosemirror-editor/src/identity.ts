import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Schema, type Fragment, type Node as PMNode } from 'prosemirror-model';
import { schema as baseSchema } from './codec';
import { baseNode } from './fidelity';
import type { InlineContent } from '@leafloom/review-contracts';
let specs = baseSchema.spec.nodes;
for (const name of ['paragraph', 'heading', 'code_block']) {
  const spec = specs.get(name)!;
  specs = specs.update(name, { ...spec, attrs: { ...spec.attrs, pid: { default: null } } });
}
specs = specs.update('doc', { ...specs.get('doc')!, attrs: { version: { default: null } } });
export const identitySchema = new Schema({ nodes: specs, marks: baseSchema.spec.marks });
type Entry = { node: PMNode; pos: number; path: number[] };
export function entries(doc: PMNode) {
  const found: Entry[] = [];
  function walk(parent: PMNode, pos: number, path: number[]) {
    parent.forEach((node, offset, index) => {
      const at = pos + offset;
      if (node.isTextblock) found.push({ node, pos: at, path: [...path, index] });
      else if (node.childCount) walk(node, at + 1, [...path, index]);
    });
  }
  walk(doc, 0, []);
  return found;
}
export function signature(node: PMNode, canonical = true) {
  const value = baseNode(node).toJSON();
  // The semantic attribute is encoded in readable HTML; omit the new default
  // from content hashes so existing prose passage identities remain stable.
  if (node.type.name === 'paragraph' && value.attrs) {
    if (canonical && node.attrs.screenplay) {
      const data = { ...value.attrs.data, 'data-screenplay': node.attrs.screenplay };
      value.attrs.data = Object.fromEntries(
        Object.keys(data)
          .sort()
          .map((key) => [key, data[key]]),
      );
    }
    delete value.attrs.screenplay;
  }
  // Wrapper provenance preserves HTML syntax, not passage content. Excluding it
  // retains passage identities written before the codec recorded plain PREs.
  if (node.type.name === 'code_block' && value.attrs) {
    const { codeWrapper: _wrapper, ...attributes } = value.attrs;
    value.attrs = attributes;
  }
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));
}
/** Previous envelopes hashed generic HTML attributes before screenplay semantics existed. */
export const legacySignature = (node: PMNode) => signature(node, false);
export function runs(fragment: Fragment): InlineContent[] {
  const out: InlineContent[] = [];
  fragment.forEach((n) => {
    if (n.isText) {
      const marks = n.marks.map((m) => ({
        kind: m.type.name,
        attributes: z.record(z.string(), z.json()).parse(m.attrs),
      }));
      const last = out.at(-1);
      if (last?.kind === 'text' && JSON.stringify(last.marks) === JSON.stringify(marks))
        last.text += n.text!;
      else out.push({ kind: 'text', text: n.text!, marks });
    } else if (n.type.name === 'hard_break') out.push({ kind: 'break' });
    else if (n.type.name === 'placeholder' || n.type.name === 'darling_anchor')
      out.push({
        kind: 'atom',
        name: n.type.name,
        id: n.attrs.sid || n.attrs.did,
        attributes: JSON.parse(JSON.stringify(n.attrs)),
      });
  });
  return out;
}
export function runText(content: InlineContent[]) {
  return content
    .map((r) =>
      r.kind === 'text' ? r.text : r.kind === 'break' ? '\n' : r.name === 'placeholder' ? '⚑' : '',
    )
    .join('');
}
