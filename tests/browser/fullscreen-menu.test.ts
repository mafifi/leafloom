// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { fixture, fixturePlatform } from './application-fixture';

for (const platformKind of ['windows', 'linux', 'macos'] as const) {
  it(`bare Alt reveals the fullscreen native menu on ${platformKind} only where the platform uses a window menu`, async () => {
    const platform = fixturePlatform();
    platform.platformKind = platformKind;
    const request = vi.fn(platform.os!.request.bind(platform.os!));
    platform.os!.request = request;
    const f = await fixture(platform);
    try {
      f.vm.fullscreenChanged({ fullscreen: true });
      request.mockClear();
      const event = new KeyboardEvent('keydown', { key: 'Alt', altKey: true, cancelable: true });
      f.vm.key(event);
      if (platformKind === 'macos') expect(request).not.toHaveBeenCalled();
      else expect(request).toHaveBeenCalledWith('revealNativeMenu', {});
      expect(event.defaultPrevented).toBe(false);
      request.mockClear();
      for (const options of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }]) {
        f.vm.key(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, ...options }));
      }
      expect(request).not.toHaveBeenCalled();
      f.vm.fullscreenChanged({ fullscreen: false });
      f.vm.key(event);
      expect(request).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
}
