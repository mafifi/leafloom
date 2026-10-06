import { context, trace, SpanStatusCode, type Context } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
class RecentSpanExporter extends InMemorySpanExporter {
  override export(...args:Parameters<InMemorySpanExporter['export']>){super.export(...args);const recent=this.getFinishedSpans();if(recent.length>1024)recent.splice(0,recent.length-1024);}
}
class CurrentMetricExporter extends InMemoryMetricExporter {
  override export(...args:Parameters<InMemoryMetricExporter['export']>){this.reset();super.export(...args);}
}
const spans = new RecentSpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] });
trace.setGlobalTracerProvider(provider);
const metrics = new CurrentMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({
  exporter: metrics,
  exportIntervalMillis: 60000,
});
const meters = new MeterProvider({ readers: [reader] });
const meter = meters.getMeter('@leafloom/host-runtime', '1.3.5');
const requests = meter.createCounter('leafloom.host.requests'),
  latency = meter.createHistogram('leafloom.host.duration', { unit: 'ms' });
const tracer = provider.getTracer('@leafloom/host-runtime', '1.3.5');
export const TraceParent = /^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-0[01]$/;
function parent(value?: string): Context | undefined {
  if (!value || !TraceParent.test(value)) return;
  const [, traceId, spanId, flags] = value.split('-');
  return trace.setSpanContext(context.active(), {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
    isRemote: true,
  });
}
export async function hostSpan<T>(
  method: string,
  operation: (carrier: string) => Promise<T>,
  carrier?: string,
) {
  const span = tracer.startSpan('host.' + method, {}, parent(carrier));
  const started = performance.now();
  let status = 'ok';
  const id = span.spanContext();
  try {
    return await operation(
      `00-${id.traceId}-${id.spanId}-${id.traceFlags.toString(16).padStart(2, '0')}`,
    );
  } catch (e) {
    status = 'error';
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw e;
  } finally {
    const attributes = { operation: method, status };
    requests.add(1, attributes);
    latency.record(performance.now() - started, attributes);
    span.end();
  }
}
export async function telemetryDiagnostics() {
  await provider.forceFlush();
  await reader.forceFlush();
  return {
    spans: spans.getFinishedSpans().map((span) => ({
      name: span.name,
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      parentSpanId: span.parentSpanContext?.spanId,
      status: span.status.code,
      durationMs:span.duration[0]*1000+span.duration[1]/1e6,
    })),
    metricExports: metrics.getMetrics().length,
  };
}
