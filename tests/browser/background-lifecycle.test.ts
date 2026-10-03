// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { installWritingLifecycle } from '../../apps/desktop/src/lib/background-lifecycle';

afterEach(() => vi.useRealTimers());
it('flushes hidden writing immediately, retains periodic protection, and removes every callback on disposal', () => {
  vi.useFakeTimers();
  const flush = vi.fn(), refresh = vi.fn();
  const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  const dispose = installWritingLifecycle(window, document, flush, refresh);
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('beforeunload'));
    expect(flush).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(20000);
    expect(flush).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(10000);
    expect(refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    dispose();
    vi.advanceTimersByTime(60000);
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('beforeunload'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(4);
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally {
    dispose();
    if (visibility) Object.defineProperty(document, 'visibilityState', visibility);
    else delete (document as unknown as Record<string, unknown>).visibilityState;
  }
});
