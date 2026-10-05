import { Sticky } from '@leafloom/document-contracts';
import type { Annotation, MetadataField } from '@leafloom/editor-contracts';
import { type CoreEvent } from '@leafloom/editor-contracts';
import { undoDepth } from 'prosemirror-history';
import { type Node as PMNode } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { z } from 'zod';
import { Darling } from './darlings';
import { entries } from './identity';
import { type MetadataSlot } from './metadata-fields';
import { sectionsFrom, type Location, type Part, type PassageInfo } from './model';
import { ReferenceHistory, cloneLocation } from './reference-history';

const uuid = () => crypto.randomUUID();

export interface TransactionOperationsContext {
  state: EditorState;
  listeners: Set<(e: CoreEvent) => void>;
  revision: number;
  bookkeeping: Record<string, z.core.util.JSONType>;
  sections: readonly Readonly<{ node: PMNode; pos: number; index: number }>[];
  supported: (id: string) => boolean;
  remember: () => void;
  version: string;
  locations: Map<string, Location>;
  segments: (loc: Location) => { chapterId: string; passageId: string; from: number; to: number }[];
  passage: (id: string) => PassageInfo | undefined;
  annotationRanges: { value: Annotation; from: number; to: number; expected: string }[];
  referenceHistory: ReferenceHistory;
  refs: Map<
    string,
    {
      id: string;
      chapterId: string;
      passageId: string;
      from: number;
      to: number;
      version: string;
      expected: (
        | {
            kind: 'text';
            text: string;
            marks: { kind: string; attributes: Record<string, z.core.util.JSONType> }[];
          }
        | { kind: 'break' }
        | {
            kind: 'atom';
            name: 'placeholder' | 'darling_anchor';
            id: string;
            attributes: Record<string, z.core.util.JSONType>;
          }
      )[];
      text: string;
    }
  >;
  metadataEdit: { field: MetadataField; before: MetadataSlot; version: string } | null;
  words: number;
  wordCount: () => number;
}

export function apply(
  context: TransactionOperationsContext,
  tr: Transaction,
  command: string,
  historical: boolean,
): void {
  if (!tr.docChanged) {
    context.state = context.state.apply(tr);
    for (const fn of context.listeners)
      fn({ kind: 'selection', revision: context.revision, command });
    return;
  }
  const preserveMarks =
      !tr.storedMarksSet &&
      context.state.storedMarks !== null &&
      tr.selection.eq(context.state.selection) &&
      tr.selection.$from.parent.content.eq(context.state.selection.$from.parent.content),
    storedMarks = preserveMarks ? context.state.storedMarks : tr.storedMarks,
    storedMarksSet = tr.storedMarksSet || preserveMarks;
  if (!historical && !command.startsWith('outline.')) {
    const touched = new Map<number, PMNode>(),
      collect = (position: number) => {
        const point = context.state.doc.resolve(
          Math.max(0, Math.min(position, context.state.doc.content.size)),
        );
        if (
          point.parent.isTextblock &&
          String(point.parent.attrs.class).split(/\s+/).includes('ghost')
        )
          touched.set(point.before(), point.parent);
      };
    tr.mapping.maps.forEach((map, index) => {
      const inverse = tr.mapping.slice(0, index).invert();
      map.forEach((from, to) => {
        collect(inverse.map(from, 1));
        collect(inverse.map(to, -1));
      });
    });
    for (const [position, node] of touched) {
      const mapped = tr.mapping.map(position, 1),
        current = tr.doc.nodeAt(mapped);
      if (
        current?.isTextblock &&
        current.attrs.pid === node.attrs.pid &&
        !current.content.eq(node.content)
      )
        tr.setNodeAttribute(
          mapped,
          'class',
          String(current.attrs.class)
            .split(/\s+/)
            .filter((value) => value !== 'ghost')
            .join(' '),
        );
    }
  }
  if (historical && Object.keys(context.bookkeeping).length)
    tr.setDocAttribute('metadata', { ...tr.doc.attrs.metadata, ...context.bookkeeping });
  if (!historical)
    for (const old of context.sections)
      if (old.node.attrs.kind === 'contents') {
        const replacement = sectionsFrom(tr.doc).find(
          (section) => section.node.attrs.id === old.node.attrs.id,
        );
        if (replacement && !replacement.node.content.eq(old.node.content))
          throw Error('READ_ONLY_CONTENT');
      }
  for (const old of context.sections) {
    if (!context.supported(old.node.attrs.id)) {
      let replacement: PMNode | undefined;
      tr.doc.forEach((n) => {
        if (n.attrs.id === old.node.attrs.id) replacement = n;
      });
      if (replacement && !replacement.content.eq(old.node.content))
        throw Error('UNSUPPORTED_CONTENT');
    }
  }
  if (!historical) {
    const beforeIds = new Set<string>(),
      afterIds = new Set<string>();
    context.state.doc.descendants((node) => {
      if (node.type.name === 'placeholder') beforeIds.add(node.attrs.sid);
    });
    tr.doc.descendants((node) => {
      if (node.type.name === 'placeholder') afterIds.add(node.attrs.sid);
    });
    const removed = new Set([...beforeIds].filter((id) => !afterIds.has(id)));
    if (removed.size) {
      const parsed = z.array(Sticky).safeParse(tr.doc.attrs.metadata.stickies);
      if (parsed.success)
        tr.setDocAttribute('metadata', {
          ...tr.doc.attrs.metadata,
          stickies: parsed.data.filter((sticky) => !removed.has(sticky.id)),
        });
    }
  }
  if (!historical) {
    const oldRecords = z
        .array(z.json())
        .parse(context.state.doc.attrs.darlings)
        .flatMap((value) => {
          const parsed = Darling.safeParse(value);
          return parsed.success ? [parsed.data] : [];
        }),
      newRecords = z.array(z.json()).parse(tr.doc.attrs.darlings);
    let changed = false;
    const records = newRecords.map((value) => {
      const parsedRecord = Darling.safeParse(value);
      if (!parsedRecord.success) return value;
      const record = parsedRecord.data,
        old = oldRecords.find((previous) => previous.id === record.id);
      if (!old?.bookmark || JSON.stringify(old.bookmark) !== JSON.stringify(record.bookmark))
        return record;
      const parsed = z
        .strictObject({ position: z.number().int().nonnegative(), block: z.boolean().optional() })
        .safeParse(old.bookmark);
      if (!parsed.success) return record;
      const position = tr.mapping.map(parsed.data.position, -1);
      let ownerExists = false;
      tr.doc.forEach((section) => {
        if (section.attrs.role === 'chapter' && section.attrs.id === record.chapterId)
          ownerExists = true;
      });
      if (!ownerExists) {
        changed = true;
        const { bookmark, ...rest } = record;
        return rest;
      }
      if (position !== parsed.data.position) {
        changed = true;
        return { ...record, bookmark: { ...parsed.data, position } };
      }
      return record;
    });
    if (changed) tr.setDocAttribute('darlings', records);
  }
  context.remember();
  const before = context.state,
    previous = context.version,
    depthBefore = undoDepth(before);
  const firstStep = tr.steps[0]?.toJSON();
  const inline = tr.steps.every((step) => {
    const d = step.toJSON();
    return (
      ['addMark', 'removeMark', 'docAttr', 'attr'].includes(d.stepType) ||
      (d.stepType === 'replace' &&
        before.doc.resolve(d.from).sameParent(before.doc.resolve(d.to)) &&
        before.doc.resolve(d.from).parent.isTextblock &&
        (d.slice?.content || []).every((n: { type: string }) =>
          ['text', 'hard_break', 'placeholder', 'darling_anchor'].includes(n.type),
        ))
    );
  });
  if (!historical) {
    if (!inline) {
      const oldPositions = new Map(
          entries(before.doc).map((e) => [e.node.attrs.pid, tr.mapping.map(e.pos, 1)]),
        ),
        all = entries(tr.doc).filter((e) => {
          let supported = false;
          tr.doc.forEach((section, pos) => {
            if (e.pos > pos && e.pos < pos + section.nodeSize)
              supported = context.supported(section.attrs.id);
          });
          return supported;
        }),
        keep = new Map<string, (typeof all)[number]>();
      for (const p of all) {
        const id = p.node.attrs.pid;
        if (!id) continue;
        const old = keep.get(id),
          expected = oldPositions.get(id);
        if (
          !old ||
          (expected !== undefined && Math.abs(p.pos - expected) < Math.abs(old.pos - expected))
        )
          keep.set(id, p);
      }
      for (const p of all)
        if (!p.node.attrs.pid || keep.get(p.node.attrs.pid) !== p)
          tr.setNodeAttribute(p.pos, 'pid', uuid());
    }
    if (!tr.getMeta('bookkeeping')) tr.setDocAttribute('version', uuid());
  }
  const relocation = tr.getMeta('relocate') as
    { start: number; end: number; target: number; inline?: boolean } | undefined;
  const mapped = new Map<string, Location>();
  for (const [id, loc] of context.locations) {
    if (loc.deleted || loc.unresolved) {
      mapped.set(id, cloneLocation(loc));
      continue;
    }
    const parts = context
      .segments(loc)
      .map((s) => {
        const p = context.passage(s.passageId)!;
        return { from: p.pos + 1 + s.from, to: p.pos + 1 + s.to };
      })
      .map((p) =>
        relocation &&
        p.from >= relocation.start + (relocation.inline ? 0 : 1) &&
        p.to <= relocation.end - (relocation.inline ? 0 : 1)
          ? {
              from: relocation.target + p.from - relocation.start,
              to: relocation.target + p.to - relocation.start,
            }
          : { from: tr.mapping.map(p.from, 1), to: tr.mapping.map(p.to, -1) },
      )
      .filter((p) => p.to > p.from);
    const merged: Part[] = [];
    for (const p of parts) {
      const last = merged.at(-1);
      if (last && last.to === p.from) last.to = p.to;
      else merged.push(p);
    }
    mapped.set(id, { parts: merged, deleted: !merged.length, unresolved: false });
  }
  if (storedMarksSet) tr.setStoredMarks(storedMarks);
  context.annotationRanges = historical
    ? []
    : context.annotationRanges
        .map((annotation) => ({
          ...annotation,
          from: tr.mapping.map(annotation.from, 1),
          to: tr.mapping.map(annotation.to, -1),
        }))
        .filter((annotation) => annotation.to > annotation.from);
  context.state = before.apply(tr);
  context.locations = historical
    ? context.referenceHistory.restore(context.version, mapped, (anchor) => {
        const passage = context.passage(anchor.passageId);
        return passage && passage.chapterId === anchor.chapterId && anchor.to <= passage.size
          ? { from: passage.pos + 1 + anchor.from, to: passage.pos + 1 + anchor.to }
          : null;
      })
    : mapped;
  const restored = tr.getMeta('restoreReferences');
  if (restored) {
    const values = z
      .array(
        z.strictObject({
          id: z.string(),
          parts: z.array(
            z.strictObject({
              from: z.number().int().nonnegative(),
              to: z.number().int().nonnegative(),
            }),
          ),
        }),
      )
      .parse(restored);
    for (const value of values)
      if (context.refs.has(value.id))
        context.locations.set(value.id, { parts: value.parts, deleted: false, unresolved: false });
  }
  context.remember();
  if (!context.metadataEdit)
    context.referenceHistory.record(
      previous,
      context.version,
      depthBefore,
      undoDepth(context.state),
      historical,
    );
  if (!before.doc.content.eq(context.state.doc.content)) context.words = context.wordCount();
  context.revision++;
  for (const fn of context.listeners) fn({ kind: 'changed', revision: context.revision, command });
}
