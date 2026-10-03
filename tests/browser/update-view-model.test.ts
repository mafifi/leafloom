import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { UpdateViewModel } from '../../apps/desktop/src/lib/update-view-model';
const idle = { version: '0.1.0', channel: 'signed' as const, status: 'idle' as const };
test('packaged checks coalesce and ready survives later error events', async () => {
  let calls = 0,
    emit: (v: unknown) => void = () => {},
    resolve: (v: unknown) => void = () => {};
  const provider = {
    status: async () => idle,
    check: () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
    installPending: async () => ({ installed: true }),
    subscribe: (fn: (v: unknown) => void) => {
      emit = fn;
      return () => {};
    },
  };
  const vm = new UpdateViewModel(provider, () => {});
  await vm.initialize(false);
  const a = vm.check(),
    b = vm.check();
  assert.equal(calls, 1);
  resolve({ version: '0.1.0', channel: 'signed', status: 'ready', latestVersion: '0.2.0' });
  await Promise.all([a, b]);
  emit({ version: '0.1.0', channel: 'signed', status: 'error', code: 'UPDATE_NETWORK' });
  assert.equal(vm.value.status, 'ready');
  vm.dispose();
});
test('background uses source startup/hourly/wake timings and disposes without development checks', async () => {
  vi.useFakeTimers();
  try {
    let calls = 0;
    const provider = {
      status: async () => idle,
      check: async () => {
        calls++;
        return idle;
      },
      installPending: async () => ({ installed: false }),
      subscribe: () => () => {},
    };
    const vm = new UpdateViewModel(provider, () => {});
    await vm.initialize(true);
    await vi.advanceTimersByTimeAsync(7999);
    assert.equal(calls, 0);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(calls, 1);
    vm.wake();
    await vi.advanceTimersByTimeAsync(14999);
    assert.equal(calls, 1);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(calls, 2);
    await vi.advanceTimersByTimeAsync(3577000);
    assert.equal(calls, 3);
    vm.dispose();
    await vi.advanceTimersByTimeAsync(3600000);
    assert.equal(calls, 3);
    await vm.initialize(false);
    await vi.advanceTimersByTimeAsync(3600000);
    assert.equal(calls, 3);
    vm.dispose();
  } finally {
    vi.useRealTimers();
  }
});
test('failed durable save blocks install and close while pending remains ready', async () => {
  let installed = 0,
    closed = 0;
  const ready = { ...idle, status: 'ready' as const, latestVersion: '0.2.0' };
  const provider = {
    status: async () => ready,
    check: async () => ready,
    installPending: async () => {
      installed++;
      return { installed: true };
    },
    subscribe: () => () => {},
  };
  const vm = new UpdateViewModel(provider, () => {});
  await vm.initialize(false);
  await assert.rejects(() =>
    vm.installAfterSave(
      async () => {
        throw Error('DISK_ERROR');
      },
      async () => {
        closed++;
      },
    ),
  );
  assert.equal(installed, 0);
  assert.equal(closed, 0);
  assert.equal(vm.value.status, 'ready');
  const order: string[] = [];
  await vm.installAfterSave(
    async () => {
      order.push('save');
    },
    async () => {
      order.push('close');
      closed++;
    },
  );
  assert.equal(installed, 1);
  assert.deepEqual(order, ['save', 'close']);
  vm.dispose();
});
