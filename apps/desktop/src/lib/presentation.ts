export const bodyFonts: Record<string, string> = {
  Georgia: 'Georgia, "Times New Roman", serif',
  Palatino: 'Palatino, "Palatino Linotype", serif',
  Baskerville: 'Baskerville, "Baskerville Old Face", Georgia, serif',
  'Hoefler Text': '"Hoefler Text", Georgia, serif',
  'Iowan Old Style': '"Iowan Old Style", Georgia, serif',
  Cambria: 'Cambria, Georgia, serif',
  Constantia: 'Constantia, Georgia, serif',
  Jost: 'Jost, "Avenir Next", Arial, sans-serif',
  Gelasio: 'Gelasio, Georgia, serif',
  'TeX Gyre Pagella': '"TeX Gyre Pagella", serif',
  'Libre Baskerville': '"Libre Baskerville", serif',
  Alegreya: 'Alegreya, serif',
  'Source Serif Pro': '"Source Serif Pro", serif',
};
export const dropcaps: Record<string, string> = {
  literary: 'Didot, "Bodoni 72", Georgia, serif',
  fantasy: '"NEO Cinzel", Georgia, serif',
  scifi: '"NEO Josefin", sans-serif',
  none: 'Georgia, serif',
};
export function applyPresentation(preferences: {
  fonts: Record<string, string>;
  pageTheme: string;
  pageZoom?: unknown;
  editorFontSize?: unknown;
  uiZoom?: unknown;
  typewriter?: unknown;
  focusMode?: unknown;
  uiBright?: unknown;
}) {
  const root = document.documentElement,
    body = document.body;
  root.style.setProperty('--body-font', bodyFonts[preferences.fonts.body] ?? bodyFonts.Georgia);
  root.style.setProperty(
    '--dropcap-font',
    dropcaps[preferences.fonts.dropcap] ?? dropcaps.literary,
  );
  body.classList.toggle('no-dropcap', preferences.fonts.dropcap === 'none');
  body.classList.toggle('night', preferences.pageTheme === 'night');
  body.classList.toggle('light', preferences.pageTheme === 'light');
  body.classList.toggle('bright', Boolean(preferences.uiBright));
  body.classList.toggle('typewriter', Boolean(preferences.typewriter));
  body.classList.toggle('focus-mode', Boolean(preferences.focusMode));
  root.style.setProperty(
    '--page-zoom',
    String(Math.max(0.75, Math.min(3, Number(preferences.pageZoom) || 1))),
  );
  root.style.setProperty(
    '--editor-size',
    String(Math.max(14, Math.min(22, Number(preferences.editorFontSize) || 17))) + 'px',
  );
  const zoom = [1, 1.25, 1.5, 2, 2.5, 3].includes(Number(preferences.uiZoom))
    ? Number(preferences.uiZoom)
    : 1;
  root.style.setProperty('--ui-zoom', String(zoom));
  root.classList.toggle('ui-zoomed', zoom > 1);
}
