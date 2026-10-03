import { z } from 'zod';
import type { DesktopOS, HostMethod, HostPayload } from '@leafloom/desktop-host';
const Configuration = z.object({ current: z.string(), default: z.string(), custom: z.boolean() });
const Backups = z.array(z.object({ name: z.string(), bytes: z.number(), date: z.string() }));
export type LibrarySettingsPresentation = z.infer<typeof Configuration> & {
  backups: z.infer<typeof Backups>;
  busy: boolean;
};
export interface LibrarySettingsContext {
  os?: DesktopOS;
  request<M extends HostMethod>(method: M, payload: HostPayload<M>): Promise<unknown>;
  closeBook(): Promise<void>;
  publish(value: LibrarySettingsPresentation | null): void;
  hint(value: string): void;
}
export class LibrarySettingsViewModel {
  private value: LibrarySettingsPresentation | null = null;
  constructor(private context: LibrarySettingsContext) {}
  async open() {
    if (!this.context.os) throw new Error('NATIVE_HOST_REQUIRED');
    const config = Configuration.parse(
      await this.context.os.request('getLibraryConfiguration', {}),
    );
    const backups = Backups.parse(await this.context.request('listBackups', {}));
    this.set({ ...config, backups, busy: false });
  }
  close() {
    if (!this.value?.busy) this.set(null);
  }
  async choose(useDefault = false) {
    const os = this.context.os;
    if (!os || !this.value || this.value.busy) return;
    this.set({ ...this.value, busy: true });
    try {
      const path = useDefault ? null : await os.request('selectLibraryFolder', {});
      if (!useDefault && path === null) return;
      if (path !== null && typeof path !== 'string') throw new Error('INVALID');
      await this.context.closeBook();
      const result = z
        .object({ requiresRestart: z.boolean() })
        .parse(await os.request('configureLibraryFolder', { path }));
      if (result.requiresRestart) {
        this.context.hint('Library folder changed. Restarting Leafloom.');
        await os.request('restartApp', {});
      }
    } finally {
      if (this.value) this.set({ ...this.value, busy: false });
    }
  }
  async backup() {
    if (!this.value || this.value.busy) return;
    this.set({ ...this.value, busy: true });
    try {
      const result = z
        .object({ name: z.string(), files: z.number(), omitted: z.number() })
        .passthrough()
        .parse(await this.context.request('createBackup', {}));
      this.context.hint(
        result.omitted
          ? `Backup saved: ${result.name}. ${result.omitted} files could not be included.`
          : `Backup saved: ${result.name}`,
      );
      this.set({
        ...this.value,
        backups: Backups.parse(await this.context.request('listBackups', {})),
        busy: false,
      });
    } finally {
      if (this.value) this.set({ ...this.value, busy: false });
    }
  }
  async reveal() {
    await this.context.os?.request('showLibrary', {});
  }
  private set(value: LibrarySettingsPresentation | null) {
    this.value = value;
    this.context.publish(value);
  }
}
