/** NEO remembers writing/shelf contrast separately from auxiliary reading tabs. */
export function auxiliaryBrightness(view: string, panel: string): boolean {
  return view === 'editor' && panel !== 'manuscript';
}
export function interfaceBrightness(preferences: {uiBright?: unknown; uiBrightAside?: unknown; [key:string]:unknown}, view: string, panel: string, systemContrast = false): boolean {
  if (auxiliaryBrightness(view, panel)) return preferences.uiBrightAside === undefined ? true : Boolean(preferences.uiBrightAside);
  return preferences.uiBright === undefined ? systemContrast : Boolean(preferences.uiBright);
}
