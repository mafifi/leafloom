import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import App from '../../apps/desktop/src/App.svelte';
import { Application, applicationActions } from '../../apps/desktop/src/lib/application';
import type { DesktopHost, DesktopOS } from '../../packages/host/desktop-host/src/index';

let dispose = async () => {};
afterEach(async () => {
  await dispose();
  document.body.replaceChildren();
});
it('renders actual Application progress and a nonfocusing ready notice, and both Restart buttons request managed quit', async () => {
  const host: DesktopHost = {
    request: vi.fn<DesktopHost['request']>(async () => ({ ok: false, code: 'UNAVAILABLE' })),
  };
  const os = vi.fn<DesktopOS['request']>(async (method) =>
    method === 'updateStatus' || method === 'checkForUpdates'
      ? { status: 'idle', version: '0.1.0', channel: 'signed' }
      : true,
  );
  const vm = new Application(
    host,
    () => {
      throw Error('No editor in mounted updater fixture');
    },
    async () => {
      await tick();
    },
    undefined,
    {
      os: { request: os },
      isMac: true,
      platformKind: 'macos',
      selectImportFiles: async () => [],
      selectExportFile: async () => null,
      openExternal: async () => {},
      finishClose: async () => {},
      fullscreen: async () => {},
      print: async () => {},
    },
  );
  const target = document.createElement('main');
  document.body.append(target);
  const component = mount(App, {
    target,
    props: { presentation: vm.state, actions: applicationActions(vm) },
  });
  dispose = async () => {
    vm.disposeUpdates();
    await unmount(component);
  };
  await vm.initializeUpdates(false);
  await vm.showInformation('update');
  await tick();
  vm.updateStatusChanged({
    status: 'downloading',
    version: '0.1.0',
    channel: 'signed',
    latestVersion: '0.2.0',
    percent: 42,
    transferred: 42,
    total: 100,
  });
  await tick();
  expect(target.querySelector('progress')?.getAttribute('value')).toBe('42');
  expect(target.querySelector('.information')?.textContent).toContain('Downloading update… 42%');
  vm.updateStatusChanged({
    status: 'ready',
    version: '0.1.0',
    channel: 'signed',
    latestVersion: '0.2.0',
  });
  await tick();
  const dialogRestart = Array.from(
    target.querySelectorAll<HTMLButtonElement>('.information button'),
  ).find((b) => b.textContent === 'Save and restart');
  expect(dialogRestart).toBeDefined();
  dialogRestart!.click();
  await tick();
  expect(os).toHaveBeenCalledWith('restartToUpdate', {});
  vm.closeInformation();
  await tick();
  const author = document.createElement('input');
  target.append(author);
  author.focus();
  vm.updateStatusChanged({
    status: 'ready',
    version: '0.1.0',
    channel: 'signed',
    latestVersion: '0.2.0',
  });
  await tick();
  expect(document.activeElement).toBe(author);
  const notice = target.querySelector<HTMLElement>('.update-notice');
  expect(notice?.getAttribute('aria-label')).toBe('Update ready');
  expect(notice?.textContent).toContain('0.2.0');
  notice!.querySelector<HTMLButtonElement>('button')!.click();
  await tick();
  expect(os.mock.calls.filter(([method]) => method === 'restartToUpdate')).toHaveLength(2);
  expect(os.mock.calls.some(([method]) => method === 'installUpdatePending')).toBe(false);
});
