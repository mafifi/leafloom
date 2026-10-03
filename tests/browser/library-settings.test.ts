import { it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibraryHost } from '../../apps/desktop/host/library';
import {
  LibrarySettingsViewModel,
  type LibrarySettingsPresentation,
} from '../../apps/desktop/src/lib/library-settings';
import type { DesktopOS } from '@leafloom/desktop-host';
it('lists a real daily backup and keeps cancelled folder selection out of document lifecycle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-settings-'));
  const host = new LibraryHost(root);
  await host.initialize();
  let value: LibrarySettingsPresentation | null = null;
  const calls: string[] = [];
  const os: DesktopOS = {
    async request(method) {
      calls.push(method);
      if (method === 'getLibraryConfiguration')
        return { current: root, default: root, custom: false };
      if (method === 'selectLibraryFolder') return null;
      throw new Error('UNEXPECTED');
    },
  };
  const vm = new LibrarySettingsViewModel({
    os,
    request: (method, payload) => host.request(method, payload),
    closeBook: async () => {
      calls.push('close');
    },
    publish: (next) => {
      value = next;
    },
    hint: () => {},
  });
  try {
    await vm.open();
    await vm.backup();
    const snapshot = value as LibrarySettingsPresentation | null;
    expect(snapshot?.backups).toHaveLength(1);
    const bytes = await readFile(join(root, 'Backups', snapshot!.backups[0].name));
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    await vm.choose();
    expect(calls).toEqual(['getLibraryConfiguration', 'selectLibraryFolder']);
    expect((value as LibrarySettingsPresentation | null)?.busy).toBe(false);
  } finally {
    await host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
it('does not switch folders or restart when the current document cannot be closed safely', async () => {
  const calls: string[] = [];
  let value: LibrarySettingsPresentation | null = null;
  const os: DesktopOS = {
    async request(method) {
      calls.push(method);
      if (method === 'getLibraryConfiguration')
        return { current: '/old', default: '/default', custom: true };
      if (method === 'selectLibraryFolder') return '/new';
      throw new Error('UNEXPECTED');
    },
  };
  const vm = new LibrarySettingsViewModel({
    os,
    request: async () => [],
    closeBook: async () => {
      throw new Error('SAVE_FAILED');
    },
    publish: (next) => {
      value = next;
    },
    hint: () => {},
  });
  await vm.open();
  await expect(vm.choose()).rejects.toThrow('SAVE_FAILED');
  expect(calls).toEqual(['getLibraryConfiguration', 'selectLibraryFolder']);
  expect((value as LibrarySettingsPresentation | null)?.busy).toBe(false);
});
