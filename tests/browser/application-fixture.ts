// @vitest-environment jsdom
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibraryHost } from '../../apps/desktop/host/library';
import { Application,type ApplicationPlatform } from '../../apps/desktop/src/lib/application';
import { BookCore,ProseMirrorSurfaces } from '../../packages/editing/prosemirror-editor/src/index';
import type { DesktopHost } from '../../packages/host/desktop-host/src/index';
export async function fixture(platform?: ApplicationPlatform) {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-ui-contract-'));
  const provider = new LibraryHost(root);
  await provider.initialize();
  const host: DesktopHost = {
    async request(method, payload) {
      try {
        return { ok: true, value: await provider.request(method, payload) } as never;
      } catch (error) {
        return { ok: false, code: error instanceof Error ? error.message : 'INVALID' };
      }
    },
  };
  const vm = new Application(
    host,
    (opened, actions) => {
      const editor = new BookCore(
        document,
        opened.book,
        opened.reviews,
        opened.notes,
        opened.outline,
      );
      return { editor, surfaces: new ProseMirrorSurfaces(editor, actions) };
    },
    async () => {},
    undefined,
    platform,
  );
  await vm.initialize();
  return {
    vm,
    provider,
    host,
    async close() {
      await vm.closeBook();
      await provider.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}
export function fixturePlatform(): ApplicationPlatform {
  return {
    os: {
      request: async (method) => {
        if (method === 'fontFamilies') return ['Georgia', 'Installed Face'];
        if (method === 'hasSecret')
          return { provider: 'openai', configured: false, storage: 'fixture' };
        if (method === 'getWindowState') return { fullscreen: false };
        return {};
      },
    },
    selectImportFiles: async () => [],
    selectExportFile: async () => null,
    openExternal: async () => {},
    finishClose: async () => {},
    fullscreen: async () => {},
    print: async () => {},
  };
}
