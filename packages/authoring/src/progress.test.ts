import { it, expect } from 'vitest';
import { writingDay, ProgressTracker, progressDays } from './progress';
it('attributes before cutoff to preceding local day', () => {
  expect(writingDay(new Date(2026, 9, 3, 2, 0), 4)).toBe('2026-10-02');
  expect(writingDay(new Date(2026, 9, 3, 4, 0), 4)).toBe('2026-10-03');
});
it('records net edits while reopening never duplicates previous words', () => {
  const tracker = new ProgressTracker({}, 4, () => new Date(2026, 9, 2, 12));
  tracker.open(100);
  tracker.update(103);
  tracker.open(103);
  tracker.update(101);
  expect(tracker.counts).toEqual({ '2026-10-02': 1 });
});
it('completes a sprint only once and resets its next baseline', () => {
  const tracker = new ProgressTracker({}, 4, () => new Date(2026, 9, 2, 12));
  tracker.open(100);
  tracker.start(3);
  expect(tracker.update(103)).toBe(true);
  expect(tracker.update(102)).toBe(false);
  expect(tracker.update(103)).toBe(false);
  tracker.start(2);
  expect(tracker.sprint?.progress).toBe(0);
  expect(tracker.update(105)).toBe(true);
});
it('thirty-day progress carries totals forward and keeps net deletions out of daily bars',()=>{const now=new Date(2026,9,3,2),days=progressDays({'2026-10-01':{start:10,end:15},'2026-10-02':{start:15,end:12}},now,4);expect(days).toHaveLength(30);expect(days.at(-1)).toEqual({date:'2026-10-02',daily:0,total:12});expect(days.at(-2)).toEqual({date:'2026-10-01',daily:5,total:15});expect(days.at(-3)!.total).toBe(10);});
