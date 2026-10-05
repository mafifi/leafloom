import { storyKinds } from '@leafloom/document-contracts';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { SectionSource } from './core';
import { inspectHTML } from './fidelity';
import { legacySignature, entries, runText, runs, signature } from './identity';
import { bookSchema, type Location, type PassageInfo } from './model';
import { ReferenceHistory } from './reference-history';
import { countNodeWords } from './word-count';

const uuid = () => crypto.randomUUID();

export interface PassageOperationsContext {
  sources: Map<string, SectionSource>;
  document: Document;
  state: EditorState;
  owner: (pos: number) => Readonly<{ node: PMNode; pos: number; index: number }> | undefined;
  canEdit: (id: string) => boolean;
  sections: readonly Readonly<{ node: PMNode; pos: number; index: number }>[];
  supported: (id: string) => boolean;
  canEditSelection: () => boolean;
  passageContent: Fragment | null;
  passageCache: PassageInfo[];
  passageById: Map<string, PassageInfo>;
  passagesBySection: Map<string, PassageInfo[]>;
  passages: (sectionId?: string) => PassageInfo[];
  referenceHistory: ReferenceHistory;
  version: string;
  locations: Map<string, Location>;
  segments: (loc: Location) => { chapterId: string; passageId: string; from: number; to: number }[];
}

export function makeSection(
  context: PassageOperationsContext,
  id: string,
  role: string,
  html: string,
  title: string,
  kind = 'chapter',
  index?: { id: string; path: number[]; signature: string }[],
  sourceStore = context.sources,
  legacyIdentity = false,
): PMNode {
  const inspection = inspectHTML(context.document, html);
  let surface = bookSchema.nodes.surface.create(
    null,
    Array.from(inspection.model.content.content, (n) => bookSchema.nodeFromJSON(n.toJSON())),
  );
  let temp = EditorState.create({ doc: surface }).tr;
  const blocks = entries(surface);
  const indexedReadOnly = inspection.reason === 'UNSUPPORTED_SCREENPLAY';
  const identitySafe = inspection.supported || indexedReadOnly;
  if (
    (index && identitySafe && index.length !== blocks.length) ||
    (index && !identitySafe && index.length)
  )
    throw Error('INVALID_IDENTITY');
  if (identitySafe)
    blocks.forEach((p, i) => {
      const saved = index?.[i];
      if (
        saved &&
        (JSON.stringify(saved.path) !== JSON.stringify(p.path) ||
          (saved.signature !== signature(p.node) &&
            !(legacyIdentity && saved.signature === legacySignature(p.node))))
      )
        throw Error('INVALID_IDENTITY');
      temp.setNodeAttribute(p.pos, 'pid', saved?.id || uuid());
    });
  surface = temp.doc;
  sourceStore.set(id, {
    html,
    initial: surface.content,
    supported: inspection.supported,
    indexedReadOnly,
    title,
    kind,
  });
  return bookSchema.nodes.section.create({ id, role, title, kind }, surface.content);
}

export function canEditSelection(context: PassageOperationsContext): boolean {
  const { from, to, empty } = context.state.selection,
    owner = context.owner(from);
  if (!owner || !context.canEdit(owner.node.attrs.id)) return false;
  return (
    empty ||
    context.sections.every(
      (section) =>
        section.pos >= to ||
        section.pos + section.node.nodeSize <= from ||
        (context.supported(section.node.attrs.id) && section.node.attrs.kind !== 'contents'),
    )
  );
}

export function requireEditableSelection(context: PassageOperationsContext): void {
  if (context.canEditSelection()) return;
  const { from, to } = context.state.selection,
    owner = context.owner(from);
  const unsupported =
    !owner ||
    !context.supported(owner.node.attrs.id) ||
    context.sections.some(
      (section) =>
        section.pos < to &&
        section.pos + section.node.nodeSize > from &&
        !context.supported(section.node.attrs.id),
    );
  throw Error(unsupported ? 'UNSUPPORTED_CONTENT' : 'READ_ONLY_CONTENT');
}

export function passages(context: PassageOperationsContext, sectionId?: string): PassageInfo[] {
  if (context.passageContent !== context.state.doc.content) {
    context.passageContent = context.state.doc.content;
    const sections = context.sections;
    let ownerIndex = 0;
    context.passageCache = entries(context.state.doc).flatMap((e) => {
      while (
        ownerIndex < sections.length - 1 &&
        e.pos >= sections[ownerIndex].pos + sections[ownerIndex].node.nodeSize
      )
        ownerIndex++;
      const owner = sections[ownerIndex];
      if (
        !owner ||
        (!context.supported(owner.node.attrs.id) &&
          !context.sources.get(owner.node.attrs.id)?.indexedReadOnly)
      )
        return [];
      return [
        {
          id: e.node.attrs.pid as string,
          chapterId: owner.node.attrs.id as string,
          kind: e.node.type.name,
          text: runText(runs(e.node.content)),
          size: e.node.content.size,
          pos: e.pos,
          path: e.path,
          node: e.node,
        },
      ];
    });
    context.passageById = new Map(context.passageCache.map((p) => [p.id, p]));
    context.passagesBySection = new Map();
    for (const passage of context.passageCache) {
      const group = context.passagesBySection.get(passage.chapterId) ?? [];
      group.push(passage);
      context.passagesBySection.set(passage.chapterId, group);
    }
  }
  return sectionId ? (context.passagesBySection.get(sectionId) ?? []) : context.passageCache;
}

export function passage(context: PassageOperationsContext, id: string): PassageInfo | undefined {
  context.passages();
  return context.passageById.get(id);
}

export function wordCount(context: PassageOperationsContext): number {
  let count = 0;
  context.state.doc.forEach((section) => {
    if (section.attrs.role === 'chapter' && storyKinds.includes(section.attrs.kind))
      count += countNodeWords(section);
  });
  return count;
}

export function remember(context: PassageOperationsContext): void {
  context.referenceHistory.remember(context.version, context.locations, (location) =>
    context.segments(location),
  );
}
