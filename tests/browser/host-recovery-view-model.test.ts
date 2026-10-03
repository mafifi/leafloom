import { expect, it, vi } from 'vitest';
import { HostRecoveryViewModel, type HostRecoveryContext, type HostRecoveryPresentation } from '../../apps/desktop/src/lib/host-recovery';
function fixture(dirty = false, hasBook = true) {
  let state: HostRecoveryPresentation | null = null;
  const context: HostRecoveryContext = {
    os: { request: vi.fn(async () => ({ restarted: true, rebindRequired: true })) },
    suspendSaves: vi.fn(), hasBook: () => hasBook, dirty: () => dirty,
    preserveLocalCopy: vi.fn(async () => {}), reopenBook: vi.fn(async () => {}), refreshLibrary: vi.fn(async () => {}),
    publish(value) { state = value; },
  };
  return { vm: new HostRecoveryViewModel(context), context, get state() { return state; } };
}
it('suspends saves once and reopens a clean book only after validated worker restart', async () => {
  const f = fixture();
  f.vm.failed({ code: 'HOST_UNAVAILABLE', canRestart: true });
  f.vm.failed({ code: 'HOST_PROTOCOL', canRestart: true });
  expect(f.context.suspendSaves).toHaveBeenCalledOnce();
  expect(f.vm.blocked).toBe(true);
  await f.vm.recover();
  expect(f.context.os?.request).toHaveBeenCalledWith('restartHost', {});
  expect(f.context.reopenBook).toHaveBeenCalledOnce();
  expect(f.context.preserveLocalCopy).not.toHaveBeenCalled();
  expect(f.vm.blocked).toBe(false);
});
it('preserves dirty writing under fresh identity instead of reopening over it', async () => {
  const f = fixture(true); f.vm.failed({ code: 'HOST_PROTOCOL', canRestart: true }); await f.vm.recover();
  expect(f.context.preserveLocalCopy).toHaveBeenCalledOnce(); expect(f.context.reopenBook).not.toHaveBeenCalled();
});
it('keeps the editor blocked after failed preservation and retries without restarting a healthy worker', async () => {
  const f = fixture(true); f.vm.failed({ code: 'HOST_UNAVAILABLE', canRestart: true });
  vi.mocked(f.context.preserveLocalCopy).mockRejectedValueOnce(new Error('DISK_FULL'));
  await expect(f.vm.recover()).rejects.toThrow('DISK_FULL');
  expect(f.state).toMatchObject({ restarted: true, busy: false, error: 'DISK_FULL' });
  await f.vm.recover(); expect(f.context.os?.request).toHaveBeenCalledOnce(); expect(f.state).toBeNull();
});
it('rejects malformed restart receipts and refreshes library only when no book is open', async () => {
  const f = fixture(false, false); f.vm.failed({ code: 'HOST_UNAVAILABLE', canRestart: true });
  vi.mocked(f.context.os!.request).mockResolvedValueOnce({ restarted: true, rebindRequired: false });
  await expect(f.vm.recover()).rejects.toThrow(); expect(f.context.refreshLibrary).not.toHaveBeenCalled();
  await f.vm.recover(); expect(f.context.refreshLibrary).toHaveBeenCalledOnce();
});
