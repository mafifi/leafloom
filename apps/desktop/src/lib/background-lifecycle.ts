/** Desktop lifecycle signals keep pending writing on disk without committing its undo group. */
export function installWritingLifecycle(
  window: Window,
  document: Document,
  flush: () => void,
  refresh: () => void,
) {
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 300);
  };
  const visibility = () => {
    if (document.visibilityState === 'visible') scheduleRefresh();
    else flush();
  };
  window.addEventListener('focus', scheduleRefresh);
  window.addEventListener('blur', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', visibility);
  const saveTick = setInterval(flush, 20000);
  const refreshTick = setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, 30000);
  return () => {
    clearTimeout(refreshTimer);
    clearInterval(saveTick);
    clearInterval(refreshTick);
    window.removeEventListener('focus', scheduleRefresh);
    window.removeEventListener('blur', flush);
    window.removeEventListener('beforeunload', flush);
    document.removeEventListener('visibilitychange', visibility);
  };
}
