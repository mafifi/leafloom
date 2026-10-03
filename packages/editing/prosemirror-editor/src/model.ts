import { Schema, type Node as PMNode } from 'prosemirror-model';
import { identitySchema } from './identity';
const nodes = identitySchema.spec.nodes
  .update('doc', {
    content: 'section+',
    attrs: {
      metadata: { default: {} },
      darlings: { default: [] },
      accepted: { default: [] },
      version: { default: null },
    },
  })
  .addToEnd('section', {
    content: 'block+',
    defining: true,
    attrs: {
      id: { default: null },
      role: { default: 'chapter' },
      title: { default: '' },
      kind: { default: 'chapter' },
    },
    toDOM: (n) => ['section', { 'data-section': n.attrs.id }, 0],
  })
  .addToEnd('surface', { content: 'block+' });
export const bookSchema = new Schema({ nodes, marks: identitySchema.spec.marks });
export type Part = { from: number; to: number };
export type Location = { parts: Part[]; deleted: boolean; unresolved: boolean };
export type Section = { node: PMNode; pos: number; index: number };
export type PassageInfo = {
  id: string;
  chapterId: string;
  kind: string;
  text: string;
  size: number;
  pos: number;
  path: number[];
  node: PMNode;
};

export function sectionsFrom(doc: PMNode): Section[] {
  const sections: Section[] = [];
  doc.forEach((node, pos, index) => sections.push({ node, pos, index }));
  return sections;
}
