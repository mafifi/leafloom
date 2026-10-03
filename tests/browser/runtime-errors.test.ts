// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'svelte/store';
import { Application } from '../../apps/desktop/src/lib/application';
import { LibraryHost } from '../../apps/desktop/host/library';
import { runtimeErrors } from '../../apps/desktop/src/lib/runtime-errors';
import {
  RuntimeErrorReport,
  type DesktopHost,
  type HostResult,
  type HostMethod,
  type HostPayload,
} from '../../packages/host/desktop-host/src/index';
it('logs two unexpected global failures through the real filesystem host, hints once and detaches listeners', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-runtime-ui-')),
    provider = new LibraryHost(root);
  await provider.initialize();
  const host: DesktopHost = {
    async request<T>(method: HostMethod, payload: HostPayload<HostMethod>): Promise<HostResult<T>> {
      return { ok: true, value: (await provider.request(method, payload)) as T };
    },
  };
  const vm = new Application(
    host,
    () => {
      throw Error('No editor needed');
    },
    async () => {},
  );
  const pending: Promise<void>[] = [];
  const binding = runtimeErrors((report) => {
    pending.push(vm.reportRuntimeFailure(report));
  });
  try {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Author manuscript secret',
        error: Error('Author manuscript secret'),
      }),
    );
    await Promise.all(pending);
    expect(get(vm.state).hint).toBe('An unexpected error occurred');
    await vm.execute(() => {
      throw Error('Ordinary command hint');
    });
    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: Error('Private title') });
    window.dispatchEvent(rejection);
    await Promise.all(pending);
    expect(get(vm.state).hint).toBe('Ordinary command hint');
    const rows = (await readFile(join(root, 'leafloom-errors.log'), 'utf8'))
      .trim()
      .split('\n')
      .map((row) => RuntimeErrorReport.parse(JSON.parse(row)));
    expect(rows.map((row) => row.source)).toEqual(['renderer', 'promise']);
    expect(JSON.stringify(rows)).not.toMatch(/secret|Private title|Ordinary command/);
    binding.destroy();
    window.dispatchEvent(new ErrorEvent('error', { message: 'Detached' }));
    expect(pending).toHaveLength(2);
  } finally {
    binding.destroy();
    await provider.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
