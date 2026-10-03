import type { JSONValue, MetadataValue } from '@leafloom/document-contracts';

export type CoverGoalBook = { title: string; wordGoal?: JSONValue; wordCount?: JSONValue };
export type CoverGoalProgress = { visible: boolean; percent: number; title: string };
type Translate = (key: string, args?: Record<string, string | number>) => string;
export interface CoverGoalsContext {
  readMetadata(bookId: string): Promise<MetadataValue>;
  /** Merge the patch into fresh closed-book metadata, or use the open book's author history. */
  updateMetadata(bookId: string, patch: { wordGoal: number }): Promise<void>;
  prompt(options: { title: string; help: string; value: string }): Promise<string | null>;
  /** Refresh the cover only after the metadata write is durable. */
  changed(): Promise<void>;
  hint(message: string): void;
  t: Translate;
}

/** Blank removes the goal. Reject partial, negative and unsafe counts. */
export function parseCoverGoal(input: string): number | null {
  const value = input.trim();
  if (!value) return 0;
  if (!/^\d+$/.test(value)) return null;
  const goal = Number(value);
  return Number.isSafeInteger(goal) ? goal : null;
}

/** NEO bookTile progress is a rounded whole percentage of the persisted count. */
export function coverGoalProgress(book: CoverGoalBook, t: Translate): CoverGoalProgress {
  const goal =
    typeof book.wordGoal === 'number' && Number.isFinite(book.wordGoal) && book.wordGoal > 0
      ? book.wordGoal
      : 0;
  const count =
    typeof book.wordCount === 'number' && Number.isFinite(book.wordCount)
      ? Math.max(0, book.wordCount)
      : 0;
  return {
    visible: goal > 0,
    percent: goal ? Math.min(100, Math.round((count / goal) * 100)) : 0,
    title: goal
      ? t('{title} — {count} / {goal} words', { title: book.title, count, goal })
      : book.title,
  };
}

export class CoverGoalsViewModel {
  private context: CoverGoalsContext;
  constructor(context: CoverGoalsContext) {
    this.context = context;
  }
  async set(bookId: string): Promise<'changed' | 'canceled' | 'invalid'> {
    const metadata = await this.context.readMetadata(bookId);
    if (metadata.id !== bookId) throw Error('BOOK_ID_MISMATCH');
    const previous =
      typeof metadata.wordGoal === 'number' && metadata.wordGoal > 0
        ? String(metadata.wordGoal)
        : '';
    const answer = await this.context.prompt({
      title: this.context.t('Word count goal for “{title}”', { title: metadata.title }),
      help: this.context.t('e.g. 80000 — blank removes the goal'),
      value: previous,
    });
    if (answer === null) return 'canceled';
    const goal = parseCoverGoal(answer);
    if (goal === null) {
      this.context.hint(
        this.context.t('Enter a whole number of words, or leave blank to remove the goal.'),
      );
      return 'invalid';
    }
    await this.context.updateMetadata(bookId, { wordGoal: goal });
    await this.context.changed();
    return 'changed';
  }
}
