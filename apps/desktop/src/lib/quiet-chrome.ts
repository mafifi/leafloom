/** Pointer actions leave chrome quiet; keyboard actions retain visible focus. */
export function installQuietChrome() {
  const mouseup = () => {
    const element = document.activeElement;
    if (
      !(element instanceof HTMLElement) ||
      element === document.body ||
      element.matches(':focus-visible') ||
      element.closest('.modal-backdrop')
    )
      return;
    if (element.closest('#bottombar,#nav-pane,#side-pane,#shelf-header,#shelves')) element.blur();
  };
  document.addEventListener('mouseup', mouseup, true);
  return () => document.removeEventListener('mouseup', mouseup, true);
}
