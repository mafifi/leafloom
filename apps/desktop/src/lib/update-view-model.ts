import { UpdateStatus, type UpdateStatusValue } from '@leafloom/desktop-host';
export interface UpdateBoundary {
  status(): Promise<unknown>;
  check(): Promise<unknown>;
  installPending(): Promise<unknown>;
  subscribe(listener: (status: unknown) => void): () => void;
}
export class UpdateViewModel {
  value: UpdateStatusValue = {
    version: '1.3.5',
    channel: 'manual',
    status: 'disabled',
    reason: 'release-channel-unconfigured',
  };
  private inFlight: Promise<UpdateStatusValue> | null = null;
  private closing: Promise<void> | null = null;
  private disposeSubscription: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private hourly: ReturnType<typeof setInterval> | null = null;
  private packaged = false;
  constructor(
    private readonly provider: UpdateBoundary,
    private readonly publish: (value: UpdateStatusValue) => void,
    private readonly report: (code: string) => void = () => {},
  ) {}
  private accept(raw: unknown) {
    const next = UpdateStatus.parse(raw);
    if (this.value.status === 'ready' && next.status === 'error') {
      this.report(next.code);
      return;
    }
    this.value = next;
    this.publish(next);
  }
  async initialize(packaged: boolean) {
    this.dispose();
    this.packaged = packaged;
    this.accept(await this.provider.status());
    this.disposeSubscription = this.provider.subscribe((raw) => {
      try {
        this.accept(raw);
      } catch {
        this.report('UPDATE_PROTOCOL');
      }
    });
    if (packaged && this.value.status !== 'disabled') {
      this.later(8000);
      this.hourly = setInterval(() => {
        void this.backgroundCheck();
      }, 3600000);
    }
  }
  check(): Promise<UpdateStatusValue> {
    if (this.inFlight) return this.inFlight;
    if (['ready', 'installing', 'disabled'].includes(this.value.status))
      return Promise.resolve(this.value);
    this.inFlight = this.provider
      .check()
      .then((raw) => {
        this.accept(raw);
        return this.value;
      })
      .catch((error) => {
        this.report('UPDATE_NETWORK');
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
  private async backgroundCheck() {
    try {
      await this.check();
    } catch {
      /* Fixed error already reported; writing is uninterrupted. */
    }
  }
  private later(ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void this.backgroundCheck();
    }, ms);
    this.timers.add(timer);
  }
  wake() {
    if (this.packaged && this.value.status !== 'disabled') this.later(15000);
  }
  installAfterSave(save: () => Promise<void>, close: () => Promise<void>): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      await save();
      if (this.value.status === 'ready') {
        const reply = await this.provider.installPending();
        if (
          typeof reply !== 'object' ||
          reply === null ||
          !('installed' in reply) ||
          typeof reply.installed !== 'boolean'
        )
          throw Error('UPDATE_PROTOCOL');
      }
      await close();
    })().finally(() => {
      this.closing = null;
    });
    return this.closing;
  }
  dispose() {
    this.disposeSubscription?.();
    this.disposeSubscription = null;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.hourly !== null) clearInterval(this.hourly);
    this.hourly = null;
    this.packaged = false;
  }
}
