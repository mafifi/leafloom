/** Shared contact text is staged while typing and persisted by the library owner. */
export class ScreenplayContact {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = false;
  private writing: Promise<void> | null = null;
  constructor(private readonly context: {
    stage(text: string): void;
    persist(): Promise<void>;
    fail(error: unknown): void;
  }) {}
  get hasPending(): boolean { return this.pending || this.writing !== null; }
  edit(text: string): void {
    this.context.stage(text);
    this.pending = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush().catch(error => this.context.fail(error)), 800);
  }
  async flush(): Promise<void> {
    while (this.pending || this.writing) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      if (this.writing) {
        await this.writing;
        continue;
      }
      this.pending = false;
      const writing = this.context.persist();
      this.writing = writing;
      try {
        await writing;
      } catch (error) {
        this.pending = true;
        throw error;
      } finally {
        if (this.writing === writing) this.writing = null;
      }
    }
  }
}
