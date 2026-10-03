export type SpanRecord = {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  status: 'ok' | 'error';
  durationMs: number;
};
export type TelemetryDiagnostics = {
  spans: SpanRecord[];
  metrics: { name: string; points: number }[];
};
export interface Telemetry {
  sync<T>(name: string, operation: (traceparent: string) => T, parent?: string): T;
  async<T>(
    name: string,
    operation: (traceparent: string) => Promise<T>,
    parent?: string,
  ): Promise<T>;
  clientTraceParent(): string;
  recordDuration(operation: string, milliseconds: number): void;
  diagnostics(): Promise<TelemetryDiagnostics>;
}
