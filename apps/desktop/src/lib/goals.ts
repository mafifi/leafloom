import { progressDays } from '@leafloom/authoring';
export type GoalsDraft = { daily: string; book: string; cutoff: number; sprint: string };
export type GoalsContext = {
  title: string | null;
  total: number;
  today: number;
  daily: number;
  book: number;
  cutoff: number;
  counts: Record<string, { start: number; end: number }>;
  sprint: { target: number; completed: boolean } | null;
};
export type GoalsPresentation = GoalsDraft & {
  title: string | null;
  total: number;
  today: number;
  sprinting: boolean;
  days: ReturnType<typeof progressDays>;
  maxDaily: number;
  maxTotal: number;
};
export class GoalsViewModel {
  private value: GoalsPresentation | null = null;
  constructor(
    private context: () => GoalsContext,
    private changed: (value: GoalsPresentation | null) => void,
    private save: (value: GoalsDraft) => Promise<void>,
    private sprint: (target: number | null) => void,
    private clock: () => Date = () => new Date(),
  ) {}
  open() {
    const source = this.context(),
      days = progressDays(source.counts, this.clock(), source.cutoff);
    this.value = {
      title: source.title,
      total: source.total,
      today: source.today,
      daily: source.daily ? String(source.daily) : '',
      book: source.book ? String(source.book) : '',
      cutoff: source.cutoff,
      sprint: String(source.sprint?.target ?? 500),
      sprinting: Boolean(source.sprint && !source.sprint.completed),
      days,
      maxDaily: Math.max(1, source.daily, ...days.map((day) => day.daily)),
      maxTotal: Math.max(1, source.book, ...days.map((day) => day.total)),
    };
    this.changed(this.value);
  }
  edit(field: keyof GoalsDraft, value: string) {
    if (!this.value) return;
    this.value = {
      ...this.value,
      [field]: field === 'cutoff' ? Math.max(0, Math.min(23, Number(value) || 0)) : value,
    };
    this.changed(this.value);
  }
  async close() {
    if (!this.value) return;
    const value = this.value;
    await this.save(value);
    if (this.value === value) {
      this.value = null;
      this.changed(null);
    }
  }
  async toggleSprint() {
    if (!this.value) return;
    this.sprint(
      this.value.sprinting ? null : Math.max(1, Math.floor(Number(this.value.sprint) || 500)),
    );
    await this.close();
  }
}
