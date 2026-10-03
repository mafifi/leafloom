// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { Application } from '../../apps/desktop/src/lib/application';
import type { DesktopHost, DesktopOS } from '../../packages/host/desktop-host/src/index';

const idle = { version: '0.1.0', channel: 'signed', status: 'idle' } as const;
const ready = {
  version: '0.1.0',
  channel: 'signed',
  status: 'ready',
  latestVersion: '0.2.0',
} as const;
const applications: Application[] = [];
function fixture() {
  const hostRequest = vi.fn<DesktopHost['request']>(async () => ({
    ok: false,
    code: 'UNAVAILABLE',
  }));
  const host: DesktopHost = { request: hostRequest };
  const osRequest = vi.fn<DesktopOS['request']>(async (method) => {
    if (method === 'updateStatus' || method === 'checkForUpdates') return idle;
    if (method === 'restartToUpdate') return true;
    if (method === 'platformInfo')
      return {
        platform: 'macos',
        architecture: 'aarch64',
        languages: ['en'],
        bodyFonts: [],
        packaged: true,
        updaterPackaged: true,
        theme: 'light',
      };
    return null;
  });
  const finish = vi.fn(async () => {});
  const vm = new Application(
    host,
    () => {
      throw Error('Updater-only fixture does not create an editor');
    },
    async () => {},
    undefined,
    {
      os: { request: osRequest },
      isMac: true,
      platformKind: 'macos',
      selectImportFiles: async () => [],
      selectExportFile: async () => null,
      openExternal: async () => {},
      finishClose: finish,
      fullscreen: async () => {},
      print: async () => {},
    },
  );
  applications.push(vm);
  return { vm, hostRequest, osRequest, finish };
}
afterEach(() => {
  for (const vm of applications.splice(0)) vm.disposeUpdates();
  vi.useRealTimers();
  document.body.replaceChildren();
});
it('publishes validated updater status into the application and an open Information panel', async () => {
  const { vm } = fixture();
  await vm.initializeUpdates(false);
  expect(get(vm.state).update).toEqual(idle);
  await vm.showInformation('update');
  vm.updateStatusChanged(ready);
  expect(get(vm.state).update).toEqual(ready);
  expect(get(vm.state).information).toMatchObject({ kind: 'update', update: ready });
});
it('rejects invalid events without changing pending status, author focus or hint and reports only a fixed failure', async () => {
  const { vm, hostRequest } = fixture();
  await vm.initializeUpdates(false);
  vm.updateStatusChanged(ready);
  document.body.innerHTML = '<input id="author" value="Untouched author field">';
  document.querySelector<HTMLInputElement>('#author')!.focus();
  const initialHint = get(vm.state).hint;
  vm.updateStatusChanged({
    status: 'ready',
    version: '0.1.0',
    channel: 'signed',
    latestVersion: '0.2.0',
    message: 'Never log this fixture string',
  });
  await Promise.resolve();
  expect(get(vm.state).update).toEqual(ready);
  expect(get(vm.state).hint).toBe(initialHint);
  expect(document.activeElement?.id).toBe('author');
  expect(hostRequest).toHaveBeenCalledWith(
    'reportRuntimeError',
    expect.objectContaining({ source: 'host', code: 'UNEXPECTED_RUNTIME', at: expect.any(String) }),
  );
  expect(JSON.stringify(hostRequest.mock.calls)).not.toContain('Never log this fixture string');
});
it('packaged startup and actual wake methods schedule checks while development stays idle', async () => {
  vi.useFakeTimers();
  const { vm, osRequest } = fixture();
  await vm.initializeUpdates(true);
  await vi.advanceTimersByTimeAsync(8000);
  expect(osRequest.mock.calls.filter(([method]) => method === 'checkForUpdates')).toHaveLength(1);
  vm.updateWake();
  await vi.advanceTimersByTimeAsync(14999);
  expect(osRequest.mock.calls.filter(([method]) => method === 'checkForUpdates')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(osRequest.mock.calls.filter(([method]) => method === 'checkForUpdates')).toHaveLength(2);
  await vm.initializeUpdates(false);
  vm.updateWake();
  await vi.advanceTimersByTimeAsync(3600000);
  expect(osRequest.mock.calls.filter(([method]) => method === 'checkForUpdates')).toHaveLength(2);
});
it('ready Restart requests managed OS restart without renderer installation, and ordinary close keeps its existing path', async () => {
  const { vm, osRequest, finish } = fixture();
  await vm.initializeUpdates(false);
  vm.updateStatusChanged(ready);
  await vm.restartForUpdate();
  expect(osRequest).toHaveBeenCalledWith('restartToUpdate', {});
  expect(osRequest.mock.calls.some(([method]) => method === 'installUpdatePending')).toBe(false);
  expect(finish).not.toHaveBeenCalled();
  await vm.finishClose();
  expect(finish).toHaveBeenCalledTimes(1);
  expect(osRequest.mock.calls.filter(([method]) => method === 'restartToUpdate')).toHaveLength(1);
  expect(osRequest.mock.calls.some(([method]) => method === 'installUpdatePending')).toBe(false);
});
