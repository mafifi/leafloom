import { z } from 'zod';
import type { Annotation, EditorPort } from '@leafloom/editor-contracts';
import type { HostPayload } from '@leafloom/desktop-host';
import {
  normalizeSpellingWord,
  rejectedSpellingRanges,
  spellingOccurrences,
} from './spelling-tokens';

export interface SpellingContext {
  editor(): EditorPort | null;
  request(method: 'spellcheck', payload: HostPayload<'spellcheck'>): Promise<unknown>;
  activeSection(): string | null;
  enabled(): boolean;
  language(): string;
  error?(error: unknown): void;
}
type PassageSnapshot = ReturnType<EditorPort['spellingPassages']>;
/** Section scans preserve the writer's current history, caret, and previously checked sections. */
export class SpellingViewModel {
  private editor: EditorPort | null = null;
  private language = '';
  private epoch = 0;
  private destroyed = false;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly generations = new Map<string, number>();
  private readonly sections = new Map<string, PassageSnapshot>();
  private readonly scanned = new Set<string>();
  private readonly correct = new Map<string, boolean>();
  constructor(private readonly context: SpellingContext) {}
  private synchronize() {
    const editor = this.context.editor(),
      language = this.context.language();
    if (editor !== this.editor || language !== this.language) {
      this.clear();
      this.editor = editor;
      this.language = language;
    }
    if (this.destroyed || !editor || !this.context.enabled()) {
      this.clear();
      return null;
    }
    return editor;
  }
  clear() {
    this.epoch++;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.sections.clear();
    this.scanned.clear();
    this.correct.clear();
    const editor = this.editor;
    if (editor?.annotations.some((annotation) => annotation.kind === 'spelling'))
      editor.setAnnotations(
        editor.annotations.filter((annotation) => annotation.kind !== 'spelling'),
      );
  }
  async activate() {
    await this.scan();
  }
  schedule() {
    const editor = this.synchronize(),
      id = this.context.activeSection();
    if (!editor || !id) return;
    const previous = this.timers.get(id);
    if (previous) clearTimeout(previous);
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        if (this.context.editor() !== editor) return;
        void this.scan(id).catch((error) => this.context.error?.(error));
      }, 600),
    );
  }
  async scan(id = this.context.activeSection()) {
    const editor = this.synchronize();
    if (!editor || !id) return;
    const sections = editor.chapters.map((chapter) => chapter.id);
    if (!sections.includes(id) && id !== 'notes' && id !== 'outline') return;
    const snapshot = editor.spellingPassages(id),
      previous = this.sections.get(id);
    if (previous === snapshot) return;
    const epoch = this.epoch,
      language = this.language;
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    const valid = () => {
      const current =
        !this.destroyed &&
        this.context.enabled() &&
        this.context.editor() === editor &&
        this.context.language() === language &&
        this.epoch === epoch &&
        this.generations.get(id) === generation;
      if (!current) return false;
      try {
        // An unrelated chapter or metadata edit cannot invalidate this unchanged section.
        return editor.spellingPassages(id) === snapshot;
      } catch {
        return false; // The section was removed while the dictionary reply was pending.
      }
    };
    const tokens = snapshot.flatMap((passage) =>
      passage.runs.map((run) => ({
        passageId: passage.id,
        offset: run.from,
        occurrences: spellingOccurrences(run.text),
      })),
    );
    const words = new Set(
      tokens.flatMap((token) =>
        token.occurrences.flatMap((occurrence) => [
          ...(occurrence.whole ? [occurrence.whole] : []),
          ...occurrence.parts.map((part) => part.word),
        ]),
      ),
    );
    const unknown = [...words].filter((word) => !this.correct.has(word) && word.length <= 200);
    const checked = new Map<string, boolean>();
    for (let offset = 0; offset < unknown.length; offset += 10000) {
      const batch = unknown.slice(offset, offset + 10000);
      const result = z
        .record(z.string(), z.boolean())
        .parse(await this.context.request('spellcheck', { words: batch, language }));
      if (!valid()) return;
      for (const word of batch) checked.set(word, result[word] !== false);
    }
    if (!valid()) return;
    for (const [word, result] of checked) this.correct.set(word, result);
    const annotations: Annotation[] = tokens.flatMap((token) =>
      rejectedSpellingRanges(token.occurrences, this.correct).map((range) => ({
        id: 'spell-' + token.passageId + '-' + (token.offset + range.from),
        kind: 'spelling',
        passageId: token.passageId,
        from: token.offset + range.from,
        to: token.offset + range.to,
        message: range.word,
      })),
    );
    annotations.push(...editor.capitalizationRanges(id, language).map(range => ({
      ...range, id: 'capital-' + range.passageId + '-' + range.from, kind: 'spelling' as const,
    })));
    const ids = new Set([...snapshot, ...(previous ?? [])].map((passage) => passage.id));
    this.sections.set(id, snapshot);
    this.scanned.add(id);
    // Keep mapped decorations in sections outside this scan and every non-spelling annotation.
    editor.setAnnotations([
      ...editor.annotations.filter(
        (annotation) => annotation.kind !== 'spelling' || !ids.has(annotation.passageId),
      ),
      ...annotations,
    ]);
  }
  async learned(word: string) {
    const editor = this.synchronize();
    if (!editor) return;
    const sections = [...this.scanned];
    this.epoch++;
    this.sections.clear();
    this.correct.clear();
    this.correct.set(normalizeSpellingWord(word), true);
    for (const id of sections) await this.scan(id);
  }
  destroy() {
    this.clear();
    this.destroyed = true;
  }
}
