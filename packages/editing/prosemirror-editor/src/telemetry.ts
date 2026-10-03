import { context, trace, SpanStatusCode, type Context } from '@opentelemetry/api';
/** Instrumentation records operation names and errors, never manuscript content. */
export class CompositionTelemetry {
  private readonly tracer = trace.getTracer('@leafloom/prosemirror-editor', '0.1.0');
  parent(value?: string): Context | undefined {
    if (!value || !/^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-0[01]$/.test(value))
      return undefined;
    const [, traceId, spanId, flags] = value.split('-');
    return trace.setSpanContext(context.active(), {
      traceId,
      spanId,
      traceFlags: Number.parseInt(flags, 16),
      isRemote: true,
    });
  }
  sync<T>(name: string, operation: (parent: Context) => T, parent?: Context): T {
    const span = this.tracer.startSpan(name, {}, parent);
    try {
      return operation(trace.setSpan(parent ?? context.active(), span));
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }
}
