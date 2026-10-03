import { context, trace, SpanStatusCode, type Context, type Span } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
import { RecentSpanExporter, CurrentMetricExporter } from './bounded-exporters';
import type { Telemetry, TelemetryDiagnostics } from '@leafloom/telemetry-contracts';
const TraceParent = /^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-0[01]$/;
const operations = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
export class BrowserTelemetry implements Telemetry {
  private exporter = new RecentSpanExporter();
  private provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(this.exporter)],
  });
  private metrics = new CurrentMetricExporter(AggregationTemporality.CUMULATIVE);
  private reader = new PeriodicExportingMetricReader({
    exporter: this.metrics,
    exportIntervalMillis: 60000,
  });
  private meters = new MeterProvider({ readers: [this.reader] });
  private tracer = this.provider.getTracer('@leafloom/browser-telemetry', '0.1.0');
  private meter = this.meters.getMeter('@leafloom/browser-telemetry', '0.1.0');
  private latency = this.meter.createHistogram('leafloom.ui.duration', { unit: 'ms' });
  private count = this.meter.createCounter('leafloom.ui.operations');
  private active?: string;
  constructor() {
    trace.setGlobalTracerProvider(this.provider);
  }
  private parent(value?: string): Context | undefined {
    if (!value || !TraceParent.test(value)) return;
    const [, traceId, spanId, flags] = value.split('-');
    return trace.setSpanContext(context.active(), {
      traceId,
      spanId,
      traceFlags: parseInt(flags, 16),
      isRemote: true,
    });
  }
  private start(name: string, parent?: string) {
    if (!operations.test(name)) throw Error('Invalid telemetry operation');
    return this.tracer.startSpan(name, {}, this.parent(parent ?? this.active));
  }
  private carrier(span: Span) {
    const id = span.spanContext();
    return `00-${id.traceId}-${id.spanId}-${id.traceFlags.toString(16).padStart(2, '0')}`;
  }
  private finish(name: string, span: Span, started: number, status: string) {
    this.count.add(1, { operation: name, status });
    this.latency.record(performance.now() - started, { operation: name, status });
    span.end();
  }
  sync<T>(name: string, operation: (traceparent: string) => T, parent?: string): T {
    const span = this.start(name, parent),
      started = performance.now(),
      previous = this.active;
    this.active = this.carrier(span);
    let status = 'ok';
    try {
      return operation(this.active);
    } catch (e) {
      status = 'error';
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw e;
    } finally {
      this.active = previous;
      this.finish(name, span, started, status);
    }
  }
  async<T>(
    name: string,
    operation: (traceparent: string) => Promise<T>,
    parent?: string,
  ): Promise<T> {
    return this.runAsync(name, operation, parent);
  }
  private async runAsync<T>(
    name: string,
    operation: (traceparent: string) => Promise<T>,
    parent?: string,
  ) {
    const span = this.start(name, parent),
      started = performance.now();
    let status = 'ok';
    try {
      return await operation(this.carrier(span));
    } catch (e) {
      status = 'error';
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw e;
    } finally {
      this.finish(name, span, started, status);
    }
  }
  clientTraceParent() {
    if (this.active) return this.active;
    const span = this.start('ui.request');
    const carrier = this.carrier(span);
    span.end();
    return carrier;
  }
  recordDuration(operation: string, milliseconds: number) {
    if (!operations.test(operation) || !Number.isFinite(milliseconds) || milliseconds < 0)
      throw Error('Invalid telemetry measurement');
    this.latency.record(milliseconds, { operation, status: 'ok' });
  }
  async diagnostics(): Promise<TelemetryDiagnostics> {
    await this.provider.forceFlush();
    await this.reader.forceFlush();
    return {
      spans: this.exporter.getFinishedSpans().map((span) => ({
        name: span.name,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        parentSpanId: span.parentSpanContext?.spanId,
        status: span.status.code === SpanStatusCode.ERROR ? 'error' : 'ok',
        durationMs: span.duration[0] * 1000 + span.duration[1] / 1e6,
      })),
      metrics: this.metrics.getMetrics().flatMap((resource) =>
        resource.scopeMetrics.flatMap((scope) =>
          scope.metrics.map((metric) => ({
            name: metric.descriptor.name,
            points: metric.dataPoints.length,
          })),
        ),
      ),
    };
  }
  async dispose() {
    await this.provider.shutdown();
    await this.meters.shutdown();
  }
}
export function initializeBrowserTelemetry() {
  return new BrowserTelemetry();
}
