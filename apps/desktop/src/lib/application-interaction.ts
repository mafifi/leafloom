import {
  RuntimeErrorReport,
  type HostMethod,
  type HostPayload,
  type RuntimeErrorReportValue,
} from '@leafloom/desktop-host';
import { translate } from '@leafloom/language-contracts';
import type { AppState, MenuItem } from './application';

export interface ApplicationInteractionContext {
  runtimeFailureNotified: boolean;
  patch: (patch: Partial<AppState>) => void;
  value: AppState;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  fail: (error: unknown) => void;
  prompt: (
    title: string,
    value?: string,
    label?: string,
    confirm?: string,
  ) => Promise<string | null>;
  preference: (key: string, value: unknown) => Promise<void>;
}

export async function reportRuntimeFailure(
  context: ApplicationInteractionContext,
  value: RuntimeErrorReportValue,
): Promise<void> {
  const report = RuntimeErrorReport.parse(value);
  if (!context.runtimeFailureNotified) {
    context.runtimeFailureNotified = true;
    context.patch({ hint: translate(context.value.language, 'An unexpected error occurred') });
  }
  try {
    await context.request('reportRuntimeError', report);
  } catch {
    /* diagnostics are best effort */
  }
}

export function fail(context: ApplicationInteractionContext, error: unknown): void {
  const code=error instanceof Error ? error.message : '';
  context.patch({ hint: code==='UNSUPPORTED_SCREENPLAY' ? translate(context.value.language, 'This format cannot preserve all of this script. Your book is unchanged.') : code || 'Unable to complete operation' });
}

export async function background(
  context: ApplicationInteractionContext,
  command: () => void | Promise<void>,
): Promise<void> {
  try {
    await command();
  } catch (error) {
    context.fail(error);
  }
}

export async function execute(
  context: ApplicationInteractionContext,
  command: () => void | Promise<void>,
  options: { closeMenu?: boolean } = {},
): Promise<void> {
  if (options.closeMenu !== false) context.patch({ menu: null });
  try {
    await command();
  } catch (error) {
    context.fail(error);
  }
}

export function prompt(
  context: ApplicationInteractionContext,
  title: string,
  value = '',
  label = 'Name',
  confirm = 'Save',
): Promise<string | null> {
  return new Promise((resolve) =>
    context.patch({ modal: { title, value, label, confirm, resolve } }),
  );
}

export function modalValue(context: ApplicationInteractionContext, value: string): void {
  if (context.value.modal) context.patch({ modal: { ...context.value.modal, value } });
}

export function answer(context: ApplicationInteractionContext, value: string | null): void {
  context.value.modal?.resolve(value);
  context.patch({ modal: null });
}

export function menu(
  context: ApplicationInteractionContext,
  event: MouseEvent,
  items: MenuItem[],
): void {
  event.preventDefault();
  event.stopPropagation();
  let x = event.clientX,
    y = event.clientY;
  if (!x && !y && event.currentTarget instanceof HTMLElement) {
    const bounds = event.currentTarget.getBoundingClientRect();
    x = bounds.left + 12;
    y = bounds.bottom;
  }
  context.patch({ menu: { x, y, items } });
}

export function dismissHint(context: ApplicationInteractionContext): void {
  context.patch({ hint: '' });
}

export function dismissMenu(context: ApplicationInteractionContext): void {
  context.patch({ menu: null });
}

export function confirm(
  context: ApplicationInteractionContext,
  title: string,
  message: string,
  label = 'Delete',
): Promise<boolean> {
  return new Promise((resolve) =>
    context.patch({
      modal: {
        title,
        value: '',
        label: message,
        confirm: label,
        input: false,
        resolve: (value) => resolve(value !== null),
      },
    }),
  );
}

export async function editPreference(
  context: ApplicationInteractionContext,
  key: string,
  title: string,
  value: unknown,
): Promise<void> {
  const result = await context.prompt(title, String(value ?? ''));
  if (result !== null) await context.preference(key, result);
}
