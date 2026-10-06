import { z } from 'zod';
import { resolveExternalDrop } from './lib/external-drop';
import { runtimeErrors } from './lib/runtime-errors';
import { installWritingLifecycle } from './lib/background-lifecycle';
import { installQuietChrome } from './lib/quiet-chrome';
import { BrowserPanePreferences } from './lib/pane-preferences';
import { PaintedCovers } from '@leafloom/painted-covers';
import { mount, tick } from 'svelte';
import App from './App.svelte';
import { Application, applicationActions } from './lib/application';
import { host, os, osRequest, listenNative } from './lib/host';
import {
  BookCore,
  ProseMirrorSurfaces,
  CompositionTelemetry,
  sanitizeHTML,
  textTypography,
} from '@leafloom/prosemirror-editor';
import './style.css';
import { initializeBrowserTelemetry } from '@leafloom/browser-telemetry';
const observability = initializeBrowserTelemetry();
declare const __LEAFLOOM_TELEMETRY_TEST__: boolean;
if (__LEAFLOOM_TELEMETRY_TEST__)
  Object.defineProperty(window, '__leafloomTelemetryDiagnostics', {
    value: () => observability.diagnostics(),
    writable: false,
    configurable: false,
  });
const removeQuietChrome = installQuietChrome();
import.meta.hot?.dispose(removeQuietChrome);
const vm = new Application(
  host,
  (opened, actions, changed) => {
    const telemetry = new CompositionTelemetry();
    const editor = new BookCore(
      document,
      opened.book,
      opened.reviews,
      opened.notes,
      opened.outline,
      telemetry,
    );
    return { editor, surfaces: new ProseMirrorSurfaces(editor, actions, telemetry, changed) };
  },
  tick,
  observability,
  {
    os: window.__TAURI__ ? os : undefined,
    isMac: navigator.platform.includes('Mac'),
    platformKind: navigator.platform.includes('Mac')
      ? 'macos'
      : navigator.platform.includes('Win')
        ? 'windows'
        : 'linux',
    panePreferences: new BrowserPanePreferences(),
    async selectImportFiles() {
      const value = await osRequest('selectImportFiles', {});
      return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : [];
    },
    async showBookFolder(bookId) {
      await osRequest('showBookFolder', { bookId });
    },
    async selectCoverImage() {
      const value = await osRequest('selectCoverImage', {});
      return typeof value === 'string' ? value : null;
    },
    async selectExportFile(name) {
      const value = await osRequest('selectExportFile', { name });
      return typeof value === 'string' ? value : null;
    },
    async openExternal(url) {
      await osRequest('openExternal', { url });
    },
    async finishClose() {
      await window.__TAURI__?.core.invoke('finish_close');
    },
    async fullscreen() {
      await osRequest('toggleFullscreen', {});
    },
    async print(bookId, language) {
      if (window.__TAURI__) await osRequest('printManuscript', { bookId, language });
      else window.print();
    },
    async writeClipboard(value) {
      if (window.__TAURI__) await osRequest('writeClipboard', value);
      else if (value.html && typeof ClipboardItem !== 'undefined')
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([value.text], { type: 'text/plain' }),
            'text/html': new Blob([value.html], { type: 'text/html' }),
          }),
        ]);
      else await navigator.clipboard.writeText(value.text);
    },
  },
  (html) => sanitizeHTML(document, html),
  new PaintedCovers(),
  textTypography,
);
const systemContrast = window.matchMedia('(prefers-contrast: more)');
const contrastChanged = () => vm.systemContrastChanged();
systemContrast.addEventListener('change', contrastChanged);
import.meta.hot?.dispose(() => systemContrast.removeEventListener('change', contrastChanged));
mount(App, {
  target: document.getElementById('app')!,
  props: { presentation: vm.state, actions: applicationActions(vm) },
});
void vm.initialize();
if (window.__TAURI__) {
  const disposers: (() => void)[] = [];
  let disposed = false;
  import.meta.hot?.dispose(() => {
    disposed = true;
    for (const dispose of disposers) dispose();
    vm.disposeUpdates();
  });
  void (async () => {
    for (const [event, receive] of [
      ['leafloom:update', (value: unknown) => vm.updateStatusChanged(value)],
      ['leafloom:update-wake', () => vm.updateWake()],
    ] as const) {
      const dispose = await listenNative(event, receive);
      if (dispose) {
        if (disposed) dispose();
        else disposers.push(dispose);
      }
    }
    const info = z
      .object({ updaterPackaged: z.boolean() })
      .passthrough()
      .parse(await osRequest('platformInfo', {}));
    if (!disposed) await vm.initializeUpdates(info.updaterPackaged);
  })().catch(() => {
    void host
      .request('reportRuntimeError', {
        source: 'host',
        code: 'UNEXPECTED_RUNTIME',
        at: new Date().toISOString(),
      })
      .catch(() => {});
  });
}

void listenNative<string>(
  'leafloom:menu-command',
  (command) => void vm.execute(() => vm.nativeCommand(command)),
);
void listenNative('leafloom:close-requested', () => void vm.execute(() => vm.finishClose()));

void listenNative(
  'leafloom:document-changed',
  (change) => void vm.background(() => vm.documentChanged(change)),
);

void listenNative('leafloom:files-dropped', (files) => {
  const drop = resolveExternalDrop(document, files);
  void vm.execute(() => vm.filesDropped(drop));
});
if (import.meta.env.DEV && !window.__TAURI__) {
  const polling = setInterval(
    () =>
      void vm.background(async () => {
        const raw = await vm.request('consumeDocumentChanges', {});
        if (Array.isArray(raw)) for (const change of raw) await vm.documentChanged(change);
      }),
    1000,
  );
  import.meta.hot?.dispose(() => clearInterval(polling));
}

void listenNative('leafloom:fullscreen-changed', (state) => vm.fullscreenChanged(state));

void listenNative(
  'leafloom:cover-art-progress',
  (value) => void vm.background(() => vm.coverArtProgress(value)),
);

void listenNative('leafloom:host-failed', (value) => vm.hostFailed(value));

const removeWritingLifecycle = installWritingLifecycle(
  window,
  document,
  () => void vm.background(() => vm.flushForBackground()),
  () => void vm.background(() => vm.refreshLibraryFromDisk()),
);
import.meta.hot?.dispose(removeWritingLifecycle);

const errors = runtimeErrors((report) => vm.reportRuntimeFailure(report));
const readingKey = () => vm.readingActivityOccurred();
const readingPointer = (event: PointerEvent) => {
  if (event.target instanceof Element && event.target.closest('#chapters'))
    vm.readingActivityOccurred();
};
document.addEventListener('keydown', readingKey, true);
document.addEventListener('pointerdown', readingPointer, true);
import.meta.hot?.dispose(() => {
  errors.destroy();
  document.removeEventListener('keydown', readingKey, true);
  document.removeEventListener('pointerdown', readingPointer, true);
});

import.meta.hot?.dispose(() => vm.disposeReadAloud());
