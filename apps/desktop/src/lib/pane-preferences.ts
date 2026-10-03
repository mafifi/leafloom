import { z } from 'zod';
const Panes = z.strictObject({ nav: z.boolean().default(false), side: z.boolean().default(false) });
export type PaneState = z.infer<typeof Panes>;
export interface PanePreferencePort {
  read(): PaneState;
  write(value: PaneState): void;
}
/** Pane placement belongs to this installation, separately from manuscript data. */
export class BrowserPanePreferences implements PanePreferencePort {
  read(): PaneState {
    try {
      return Panes.parse(JSON.parse(window.localStorage.getItem('leafloom-pinned-panes') ?? '{}'));
    } catch {
      return { nav: false, side: false };
    }
  }
  write(value: PaneState) {
    try {
      window.localStorage.setItem('leafloom-pinned-panes', JSON.stringify(Panes.parse(value)));
    } catch {
      /* The current window still keeps its placement when storage is unavailable. */
    }
  }
}
