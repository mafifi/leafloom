export function writingDay(date: Date, cutoff: number): string {
  const day = new Date(date);
  if (day.getHours() < cutoff) day.setDate(day.getDate() - 1);
  return [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0'),
  ].join('-');
}

export function dailyWordCount(
  previous: { start: number; end: number } | undefined,
  total: number,
  baseline = total,
): { start: number; end: number } {
  return { start: Math.min(previous?.start ?? baseline, total), end: total };
}
export class ProgressTracker {
  counts: Record<string, number>;
  sprint: { target: number; progress: number; completed: boolean; started: number } | null = null;
  private baseline = 0;
  private sprintBaseline = 0;
  constructor(
    counts: Record<string, number>,
    public cutoff: number,
    private clock: () => Date,
  ) {
    this.counts = { ...counts };
  }
  open(words: number) {
    this.baseline = words;
  }
  update(words: number): boolean {
    const delta = words - this.baseline;
    this.baseline = words;
    if (delta) {
      const day = writingDay(this.clock(), this.cutoff);
      this.counts[day] = (this.counts[day] ?? 0) + delta;
    }
    if (!this.sprint) return false;
    this.sprint.progress = words - this.sprintBaseline;
    if (!this.sprint.completed && this.sprint.progress >= this.sprint.target) {
      this.sprint.completed = true;
      return true;
    }
    return false;
  }
  start(target: number) {
    if (!Number.isInteger(target) || target <= 0) throw Error('INVALID_GOAL');
    this.sprintBaseline = this.baseline;
    this.sprint = { target, progress: 0, completed: false, started: this.clock().getTime() };
  }
  end() {
    const result = this.sprint
      ? {
          words: this.sprint.progress,
          minutes: Math.round((this.clock().getTime() - this.sprint.started) / 60000),
        }
      : null;
    this.sprint = null;
    return result;
  }
}

export function progressDays(counts:Record<string,{start:number;end:number}>,now:Date,cutoff:number) {
 const days=Array.from({length:30},(_,index)=>{const date=new Date(now);date.setDate(date.getDate()-(29-index));return writingDay(date,cutoff);});
 const first=days.find(day=>counts[day]);let total=first?counts[first].start:0;
 return days.map(date=>{if(counts[date])total=counts[date].end;return {date,daily:Math.max(0,counts[date]?counts[date].end-counts[date].start:0),total};});
}
