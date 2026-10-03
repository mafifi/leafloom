import { RuntimeErrorReport, type RuntimeErrorReportValue } from '@leafloom/desktop-host';

/** Global unexpected failures only; ordinary command errors retain their existing hints. */
export function runtimeErrors(report: (value: RuntimeErrorReportValue) => void | Promise<void>): {
  destroy(): void;
} {
  const deliver = (source: RuntimeErrorReportValue['source']) => {
    const value = RuntimeErrorReport.parse({
      source,
      code: 'UNEXPECTED_RUNTIME',
      at: new Date().toISOString(),
    });
    // Reporting must never create a second unhandled rejection or suppress the browser error.
    try {
      void Promise.resolve(report(value)).catch(() => {});
    } catch {
      /* best effort */
    }
  };
  const error = () => deliver('renderer');
  const rejection = () => deliver('promise');
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  return {
    destroy() {
      window.removeEventListener('error', error);
      window.removeEventListener('unhandledrejection', rejection);
    },
  };
}
