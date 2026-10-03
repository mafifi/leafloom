import type { CheckpointValue, EditorPort } from '@leafloom/editor-contracts';
export class AuthoringSession {
  dirty = false;
  private running: Promise<void> | null = null;
  private pauseAfterCurrent = false;
  constructor(
    readonly editor: EditorPort,
    private save: (checkpoint: CheckpointValue) => Promise<void>,
  ) {}
  changed() {
    this.dirty = true;
  }
  /** Wait only for an already dispatched checkpoint; never initiate a local write. */
  settle(): Promise<void> {
    if (this.running) this.pauseAfterCurrent = true;
    return this.running ?? Promise.resolve();
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    this.pauseAfterCurrent = false;
    const execute = async () => {
      while (this.dirty && !this.pauseAfterCurrent) {
        const checkpoint = this.editor.checkpoint(),
          revision = checkpoint.book.revision;
        await this.save(checkpoint);
        this.dirty = this.editor.revision !== revision;
      }
    };
    this.running = execute().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}
export { ProgressTracker, writingDay, progressDays } from './progress';
