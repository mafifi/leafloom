import { it, expect } from 'vitest';
import {
  GoalsViewModel,
  type GoalsPresentation,
  type GoalsDraft,
} from '../../apps/desktop/src/lib/goals';
it('no-book Goals closes through the same save boundary and retains cutoff and daily edits', async () => {
  let presentation: GoalsPresentation | null = null;
  const saved: GoalsDraft[] = [];
  const vm = new GoalsViewModel(
    () => ({
      title: null,
      total: 0,
      today: 0,
      daily: 0,
      book: 0,
      cutoff: 0,
      counts: {},
      sprint: null,
    }),
    (value) => {
      presentation = value;
    },
    async (draft) => {
      saved.push({ ...draft });
    },
    () => {},
  );
  vm.open();
  vm.edit('daily', '750');
  vm.edit('cutoff', '4');
  await vm.close();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ daily: '750', cutoff: 4 });
  expect(presentation).toBe(null);
});
it('failed saves leave the authored draft available for retry and sprint closes through persistence', async () => {
  let presentation: GoalsPresentation | null = null,
    fail = true,
    target: number | null = null;
  const vm = new GoalsViewModel(
    () => ({
      title: 'Book',
      total: 50,
      today: 4,
      daily: 500,
      book: 1000,
      cutoff: 0,
      counts: {},
      sprint: null,
    }),
    (value) => {
      presentation = value;
    },
    async () => {
      if (fail) throw Error('DISK_ERROR');
    },
    (value) => {
      target = value;
    },
    () => new Date(2026, 9, 2),
  );
  vm.open();
  vm.edit('book', '2000');
  await expect(vm.close()).rejects.toThrow('DISK_ERROR');
  expect(presentation!.book).toBe('2000');
  fail = false;
  vm.edit('sprint', '250');
  await vm.toggleSprint();
  expect(target).toBe(250);
  expect(presentation).toBe(null);
});
