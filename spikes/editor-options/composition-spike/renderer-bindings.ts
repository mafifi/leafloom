import type { Opened } from './contracts';import type { EditorPort,SurfacePort,SurfaceActions } from './editor-port';import type { CompositionTelemetry } from './telemetry';
export type RendererFactory=(opened:Opened,telemetry:CompositionTelemetry,input:()=>void,actions:SurfaceActions)=>{core:EditorPort;surfaces:SurfacePort};
