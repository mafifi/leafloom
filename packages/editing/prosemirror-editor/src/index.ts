export { BookCore, bookSchema } from './core';
export { ProseMirrorSurfaces } from './surfaces';
export { CompositionTelemetry } from './telemetry';
export { importHTML, exportHTML, schema, parseHTMLDOM, sanitizeHTML } from './codec';
export { inspectHTML, inventory } from './fidelity';
export type { EditorPort, SurfacePort, SurfaceActions } from '@leafloom/editor-contracts';

export { VimController, wordOffset } from './vim';
export { textTypography, typographicInput } from './typography';
