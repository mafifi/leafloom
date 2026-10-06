import { z } from 'zod';
import { Metadata, storyKinds } from '@leafloom/document-contracts';
import type {
  ChapterRow,
  OutlineRow,
  OutlineTarget,
  OutlineSearchMatch,
} from '@leafloom/editor-contracts';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { closeHistory } from 'prosemirror-history';
import type { Section } from './model';
import { roman, partTitle } from './chapter-labels';
import { removeChapterMetadata } from './metadata';
import { syncOutlineGhosts } from './outline-ghosts';
import { hasClass, sectionId } from './outline-segments';
import { joinOutlineChapter, moveOutlineSection } from './outline-moves';
const uuid = () => crypto.randomUUID();
export interface OutlineContext {
  state(): EditorState;
  supported?(id: string): boolean;
  chapters(): ChapterRow[];
  section(id: string): Section;
  createChapter(id: string): PMNode;
  wordCount(id: string): number;
  dispatch(transaction: Transaction, command: string): void;
}
/** Plans outline changes against the master; owns no state or history. */
export class OutlineOperations {
  constructor(private readonly context: OutlineContext) {}
  private get state() {
    return this.context.state();
  }
  private get chapters() {
    return this.context.chapters();
  }
  private section(id: string) {
    return this.context.section(id);
  }
  private wordCountFor(id: string) {
    return this.context.wordCount(id);
  }
  private dispatch(transaction: Transaction, command: string) {
    this.context.dispatch(transaction, command);
  }
  private outlineMetadata() {
    const metadata = structuredClone(this.state.doc.attrs.metadata);
    return {
      metadata,
      chapters: z.record(z.string(), z.string()).parse(metadata.chapterNotes ?? {}),
      sections: z
        .record(
          z.string(),
          z.array(z.object({ id: z.string(), text: z.string() }).catchall(z.json())),
        )
        .parse(metadata.sectionNotes ?? {}),
    };
  }
  get outlineRows(): OutlineRow[] {
    const notes = this.outlineMetadata(),
      rows: OutlineRow[] = [];
    for (const chapter of this.chapters) {
      if (chapter.kind === 'part') {
        const title = partTitle(this.section(chapter.id).node);
        rows.push({
          kind: 'part',
          chapterId: chapter.id,
          label: roman(chapter.number ?? 1),
          text: chapter.label + (title ? ': ' + title : ''),
        });
        continue;
      }
      if (!storyKinds.some((kind) => kind === chapter.kind)) continue;
      rows.push({
        kind: 'chapter',
        chapterId: chapter.id,
        label: chapter.kind === 'chapter' ? String(chapter.number) : '❦',
        text: notes.chapters[chapter.id] ?? '',
      });
      for (const [index, section] of (notes.sections[chapter.id] ?? []).entries())
        rows.push({
          kind: 'section',
          chapterId: chapter.id,
          sectionId: section.id,
          label: String.fromCharCode(65 + (index % 26)),
          text: section.text,
        });
    }
    return rows;
  }
  private outlineTarget(target: OutlineTarget) {
    const parsed = z
        .strictObject({ chapterId: z.string(), sectionId: z.string().optional() })
        .parse(target),
      row = this.outlineRows.find(
        (row) => row.chapterId === parsed.chapterId && row.sectionId === parsed.sectionId,
      );
    if (!row || row.kind === 'part') throw Error('INVALID_OUTLINE_TARGET');
    return row;
  }
  private setOutlineMetadata(
    tr: Transaction,
    data: ReturnType<OutlineOperations['outlineMetadata']>,
  ) {
    tr.setDocAttribute(
      'metadata',
      Metadata.parse({
        ...data.metadata,
        chapterNotes: data.chapters,
        sectionNotes: data.sections,
      }),
    );
  }
  editOutlineRow(target: OutlineTarget, text: string) {
    const row = this.outlineTarget(target),
      data = this.outlineMetadata(),
      value = z.string().parse(text).trim();
    if (row.kind === 'chapter') data.chapters[row.chapterId] = value;
    else {
      const section = data.sections[row.chapterId]?.find((section) => section.id === row.sectionId);
      if (!section) throw Error('INVALID_OUTLINE_TARGET');
      section.text = value;
    }
    const tr = closeHistory(this.state.tr);
    syncOutlineGhosts(tr, row.chapterId, data.sections[row.chapterId] ?? []);
    const metadata = Metadata.parse({
      ...data.metadata,
      chapterNotes: data.chapters,
      sectionNotes: data.sections,
    });
    if (
      tr.doc.content.eq(this.state.doc.content) &&
      JSON.stringify(metadata) === JSON.stringify(this.state.doc.attrs.metadata)
    )
      return;
    tr.setDocAttribute('metadata', metadata);
    this.dispatch(tr, 'outline.edit');
  }
  outlineEnter(target: OutlineTarget, before = false): OutlineTarget {
    const row = this.outlineTarget(target),
      data = this.outlineMetadata(),
      tr = closeHistory(this.state.tr);
    const owner = this.section(row.chapterId), id = uuid(), node = this.context.createChapter(id);
    tr.insert(owner.pos + (before && row.kind === 'chapter' ? 0 : owner.node.nodeSize), node);
    const result: OutlineTarget = { chapterId: id };
    this.setOutlineMetadata(tr, data);
    this.dispatch(tr, 'outline.enter');
    return result;
  }
  outlineIndent(
    target: OutlineTarget,
    reverse = false,
  ): { target: OutlineTarget; notice?: string } {
    const row = this.outlineTarget(target),
      data = this.outlineMetadata(),
      tr = closeHistory(this.state.tr);
    let result: OutlineTarget = target;
    if (!reverse && row.kind === 'chapter') {
      const chapters = this.chapters,
        index = chapters.findIndex((chapter) => chapter.id === row.chapterId),
        previous = chapters
          .slice(0, index)
          .reverse()
          .find((chapter) => storyKinds.some((kind) => kind === chapter.kind));
      if (!previous) return { target, notice: 'The first line has to be a chapter' };
      const id = joinOutlineChapter(tr, data, row.chapterId, previous.id);
      result = { chapterId: previous.id, sectionId: id };
    } else if (reverse && row.kind === 'section') {
      const list = data.sections[row.chapterId],
        index = list.findIndex((section) => section.id === row.sectionId),
        note = list[index],
        owner = this.section(row.chapterId),
        id = uuid(),
        node = this.context.createChapter(id);
      const after = list.splice(index).slice(1),
        carry = after.length > 0 && !after.some((note) =>
          Array.from(owner.node.content.content).some((node) => sectionId(node) === note.id && !hasClass(node, 'ghost')),
        );
      if (!carry) list.push(...after);
      tr.insert(owner.pos + owner.node.nodeSize, node);
      data.chapters[id] = note.text;
      if (carry) data.sections[id] = after;
      syncOutlineGhosts(tr, row.chapterId, list);
      if (carry) syncOutlineGhosts(tr, id, after);
      result = { chapterId: id };
    } else if (!reverse && row.kind === 'section') {
      const list = data.sections[row.chapterId], index = list.findIndex((note) => note.id === row.sectionId), id = uuid();
      list.splice(index + 1, 0, { id, text: '' });
      syncOutlineGhosts(tr, row.chapterId, list);
      result = { chapterId: row.chapterId, sectionId: id };
    } else return { target };
    this.setOutlineMetadata(tr, data);
    this.dispatch(tr, 'outline.indent');
    return { target: result };
  }
  joinChapter(chapterId: string, intoChapterId: string): OutlineTarget | null {
    if (chapterId === intoChapterId) return null;
    const rows = this.chapters;
    if (![chapterId, intoChapterId].every((id) => rows.some((row) => row.id === id && storyKinds.some((kind) => row.kind === kind)))) return null;
    const data = this.outlineMetadata(), tr = closeHistory(this.state.tr),
      sectionId = joinOutlineChapter(tr, data, chapterId, intoChapterId);
    this.setOutlineMetadata(tr, data);
    this.dispatch(tr, 'outline.join');
    return { chapterId: intoChapterId, sectionId };
  }
  moveSection(fromChapterId: string, segmentIndex: number, to: { chapterId: string; before: number | null }) {
    z.string().parse(fromChapterId);
    z.number().int().nonnegative().parse(segmentIndex);
    z.strictObject({ chapterId: z.string(), before: z.number().int().nonnegative().nullable() }).parse(to);
    const data = this.outlineMetadata(), tr = closeHistory(this.state.tr);
    if (!moveOutlineSection(tr, data, fromChapterId, segmentIndex, to)) return;
    this.setOutlineMetadata(tr, data);
    this.dispatch(tr, 'outline.move-section');
  }
  outlineDelete(target: OutlineTarget): OutlineTarget {
    const row = this.outlineTarget(target),
      data = this.outlineMetadata(),
      tr = closeHistory(this.state.tr);
    let result: OutlineTarget = target;
    if (row.kind === 'section') {
      const list = data.sections[row.chapterId],
        index = list.findIndex((section) => section.id === row.sectionId);
      result =
        index > 0
          ? { chapterId: row.chapterId, sectionId: list[index - 1].id }
          : { chapterId: row.chapterId };
      list.splice(index, 1);
      syncOutlineGhosts(tr, row.chapterId, list);
    } else {
      const chapters = this.chapters.filter((chapter) =>
          storyKinds.some((kind) => kind === chapter.kind),
        ),
        index = chapters.findIndex((chapter) => chapter.id === row.chapterId);
      if (chapters.length <= 1 || this.wordCountFor(row.chapterId) > 0) return target;
      const section = this.section(row.chapterId);
      tr.delete(section.pos, section.pos + section.node.nodeSize);
      delete data.chapters[row.chapterId];
      delete data.sections[row.chapterId];
      removeChapterMetadata(data.metadata, row.chapterId);
      result = {
        chapterId:
          chapters[index - 1]?.id ?? chapters.find((chapter) => chapter.id !== row.chapterId)!.id,
      };
    }
    this.setOutlineMetadata(tr, data);
    this.dispatch(tr, 'outline.delete');
    return result;
  }
  replaceOutlineMatches(matches: OutlineSearchMatch[], text: string) {
    const parsed = z
        .array(
          z.strictObject({
            chapterId: z.string(),
            sectionId: z.string().optional(),
            from: z.number().int().nonnegative(),
            to: z.number().int().nonnegative(),
          }),
        )
        .parse(matches),
      replacement = z.string().parse(text),
      rows = this.outlineRows,
      data = this.outlineMetadata(),
      groups = new Map<string, { row: OutlineRow; matches: OutlineSearchMatch[] }>();
    for (const match of parsed) {
      const row = rows.find(
        (row) =>
          row.chapterId === match.chapterId &&
          row.sectionId === match.sectionId &&
          row.kind !== 'part',
      );
      if (!row || match.to <= match.from || match.to > row.text.length)
        throw Error('INVALID_SELECTION');
      const key = JSON.stringify([match.chapterId, match.sectionId]),
        group = groups.get(key) ?? { row, matches: [] };
      if (group.matches.some((previous) => match.from < previous.to && match.to > previous.from))
        throw Error('OVERLAPPING_MATCHES');
      group.matches.push(match);
      groups.set(key, group);
    }
    if (!groups.size) return;
    const chapters = new Set<string>();
    for (const { row, matches } of groups.values()) {
      let value = row.text;
      for (const match of matches.sort((left, right) => right.from - left.from))
        value = value.slice(0, match.from) + replacement + value.slice(match.to);
      value = value.trim();
      if (row.sectionId) {
        const section = data.sections[row.chapterId].find(
          (section) => section.id === row.sectionId,
        )!;
        section.text = value;
      } else data.chapters[row.chapterId] = value;
      chapters.add(row.chapterId);
    }
    const tr = closeHistory(this.state.tr);
    for (const chapterId of chapters)
      syncOutlineGhosts(tr, chapterId, data.sections[chapterId] ?? []);
    this.setOutlineMetadata(tr, data);
    this.dispatch(tr, 'outline.replace');
  }
}
