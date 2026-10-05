import { ProgressTracker, writingDay } from '@leafloom/authoring';
import { type EditorPort, type SurfacePort } from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import { Library, type LibraryValue } from '@leafloom/library';
import { z } from 'zod';
import type { AppState, ApplicationPlatform } from './application';
import { CoverArtViewModel } from './cover-art';
import { GoalsViewModel, type GoalsDraft } from './goals';
import { HostRecoveryViewModel } from './host-recovery';


export interface ApplicationGoalsContext {
  editor: EditorPort | null;
  progress: ProgressTracker | null;
  progressBaseline: number;
  value: AppState;
  patch: (patch: Partial<AppState>) => void;
  platform: ApplicationPlatform | undefined;
  hostRecoveryViewModel: HostRecoveryViewModel;
  background: (command: () => void | Promise<void>) => Promise<void>;
  coverArtViewModel: CoverArtViewModel;
  prompt: (
    title: string,
    value?: string,
    label?: string,
    confirm?: string,
  ) => Promise<string | null>;
  overlayOpen: () => boolean;
  goalsViewModel: GoalsViewModel;
  rendered: () => Promise<void>;
  surfaces: SurfacePort<HTMLElement> | null;
  updateLibrary: (value: LibraryValue, history?: boolean) => Promise<void>;
  project: () => void;
  openGoals: () => void;
}

export function updateProgress(context: ApplicationGoalsContext): void {
  if (!context.editor || !context.progress) return;
  const words = context.editor.words,
    before = context.progressBaseline,
    delta = words - before;
  context.progressBaseline = words;
  const completed = context.progress.update(words);
  if (delta) {
    const day = writingDay(new Date(), Number(context.value.library.dayEndsAt) || 0);
    const counts = z
      .record(z.string(), z.object({ start: z.number(), end: z.number() }))
      .catch({})
      .parse(context.editor.metadata.dailyCounts);
    const prior = counts[day];
    counts[day] = { start: prior?.start ?? words - delta, end: words };
    context.editor.setBookkeeping({ dailyCounts: counts, wordCount: words });
    context.patch({ todayWords: words - counts[day].start });
    if (
      before < 1000 &&
      words >= 1000 &&
      context.platform?.os &&
      !context.value.readOnly &&
      !context.hostRecoveryViewModel.blocked
    )
      void context.background(() => context.coverArtViewModel.maybePaint(context.editor!.metadata));
  }
  context.patch({ sprint: context.progress.sprint });
  if (completed)
    context.patch({
      hint: translate(context.value.language, 'Sprint complete — {n} words. Well earned.', {
        n: context.progress.sprint?.progress ?? 0,
      }),
    });
}

export async function startSprint(context: ApplicationGoalsContext): Promise<void> {
  if (!context.progress) return;
  const target = await context.prompt('Writing sprint', '500', 'Words', 'Start');
  if (target === null) return;
  context.progress.start(Math.max(1, Math.floor(Number(target) || 500)));
  context.patch({ sprint: context.progress.sprint });
}

export function endSprint(context: ApplicationGoalsContext): void {
  const result = context.progress?.end();
  context.patch({
    sprint: null,
    hint: result
      ? translate(context.value.language, 'Sprint ended — {n} words in {min} min', {
          n: result.words,
          min: result.minutes,
        })
      : '',
  });
}

export function openGoals(context: ApplicationGoalsContext): void {
  if (context.overlayOpen()) return;
  context.goalsViewModel.open();
}

export function editGoal(
  context: ApplicationGoalsContext,
  field: keyof GoalsDraft,
  value: string,
): void {
  context.goalsViewModel.edit(field, value);
}

export async function closeGoals(context: ApplicationGoalsContext): Promise<void> {
  await context.goalsViewModel.close();
  await context.rendered();
  context.surfaces?.focus();
}

export async function goalsSprint(context: ApplicationGoalsContext): Promise<void> {
  await context.goalsViewModel.toggleSprint();
  await context.rendered();
  context.surfaces?.focus();
}

export async function saveGoals(
  context: ApplicationGoalsContext,
  draft: GoalsDraft,
): Promise<void> {
  await context.updateLibrary(
    Library.parse({
      ...context.value.library,
      dailyGoal: Math.max(0, parseInt(draft.daily, 10) || 0),
      dayEndsAt: draft.cutoff,
    }),
    false,
  );
  if (context.progress) context.progress.cutoff = draft.cutoff;
  if (context.editor && !context.value.readOnly)
    context.editor.updateMetadata({ wordGoal: Math.max(0, parseInt(draft.book, 10) || 0) });
  context.project();
}

export async function bookGoal(context: ApplicationGoalsContext): Promise<void> {
  context.openGoals();
}

export async function dailyGoal(context: ApplicationGoalsContext): Promise<void> {
  context.openGoals();
}
