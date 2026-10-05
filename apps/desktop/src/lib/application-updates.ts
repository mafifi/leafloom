import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import type { AppState, ApplicationPlatform } from './application';
import { UpdateViewModel } from './update-view-model';


export interface ApplicationUpdatesContext {
  platform: ApplicationPlatform | undefined;
  updates: UpdateViewModel | null;
  updateListeners: Set<(value: unknown) => void>;
  patch: (patch: Partial<AppState>) => void;
  value: AppState;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
}

export async function initializeUpdates(
  context: ApplicationUpdatesContext,
  packaged: boolean,
): Promise<void> {
  const os = context.platform?.os;
  if (!os) return;
  context.updates ??= new UpdateViewModel(
    {
      status: () => os.request('updateStatus', {}),
      check: () => os.request('checkForUpdates', {}),
      installPending: () => os.request('installUpdatePending', {}),
      subscribe: (listener) => {
        context.updateListeners.add(listener);
        return () => context.updateListeners.delete(listener);
      },
    },
    (update) =>
      context.patch({
        update,
        ...(context.value.information?.kind === 'update'
          ? { information: { ...context.value.information, version: update.version, update } }
          : {}),
      }),
    () => {
      void context
        .request('reportRuntimeError', {
          source: 'host',
          code: 'UNEXPECTED_RUNTIME',
          at: new Date().toISOString(),
        })
        .catch(() => {});
    },
  );
  await context.updates.initialize(packaged);
}

export function updateStatusChanged(context: ApplicationUpdatesContext, value: unknown): void {
  for (const listener of context.updateListeners) listener(value);
}

export function updateWake(context: ApplicationUpdatesContext): void {
  context.updates?.wake();
}

export function disposeUpdates(context: ApplicationUpdatesContext): void {
  context.updates?.dispose();
}

export async function restartForUpdate(context: ApplicationUpdatesContext): Promise<void> {
  if (context.value.update?.status !== 'ready' || !context.platform?.os) return;
  await context.platform.os.request('restartToUpdate', {});
}
