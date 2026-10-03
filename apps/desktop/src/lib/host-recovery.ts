import { HostFailed, HostRestarted, type DesktopOS } from '@leafloom/desktop-host';
export type HostRecoveryPresentation = { code: 'HOST_UNAVAILABLE' | 'HOST_PROTOCOL'; busy: boolean; restarted: boolean; error: string | null };
export interface HostRecoveryContext {
  os?: DesktopOS;
  suspendSaves(): void;
  hasBook(): boolean;
  dirty(): boolean;
  preserveLocalCopy(): Promise<void>;
  reopenBook(): Promise<void>;
  refreshLibrary(): Promise<void>;
  publish(value: HostRecoveryPresentation | null): void;
}
/** Worker restarts create a new lease boundary. Never replay a checkpoint with an old lease. */
export class HostRecoveryViewModel {
  private value: HostRecoveryPresentation | null = null;
  constructor(private context: HostRecoveryContext) {}
  failed(raw: unknown) {
    const failure = HostFailed.parse(raw);
    if (this.value) return;
    this.context.suspendSaves();
    this.set({ code: failure.code, busy: false, restarted: false, error: null });
  }
  async recover() {
    if (!this.value || this.value.busy) return;
    if (!this.context.os) throw new Error('NATIVE_HOST_REQUIRED');
    this.set({ ...this.value, busy: true, error: null });
    try {
      if (!this.value.restarted) {
        HostRestarted.parse(await this.context.os.request('restartHost', {}));
        this.set({ ...this.value, restarted: true });
      }
      if (this.context.hasBook()) {
        if (this.context.dirty()) await this.context.preserveLocalCopy();
        else await this.context.reopenBook();
      } else await this.context.refreshLibrary();
      this.set(null);
    } catch (error) {
      if (this.value) this.set({ ...this.value, busy: false, error: error instanceof Error ? error.message : 'HOST_UNAVAILABLE' });
      throw error;
    }
  }
  get blocked() { return this.value !== null; }
  private set(value: HostRecoveryPresentation | null) { this.value = value; this.context.publish(value); }
}
