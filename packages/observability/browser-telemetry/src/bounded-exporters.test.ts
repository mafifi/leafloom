import { expect, it } from 'vitest';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { MeterProvider, PeriodicExportingMetricReader, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { RecentSpanExporter, CurrentMetricExporter } from './bounded-exporters';
it('bounds direct editor SDK spans without requiring a UI command to trim old telemetry', async () => {
  const exporter = new RecentSpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const tracer = provider.getTracer('synthetic-editor');
  try {
    for (let index = 0; index < 1600; index++) tracer.startSpan(index === 1599 ? 'editor.last' : 'editor.transaction').end();
    await provider.forceFlush();
    expect(exporter.getFinishedSpans()).toHaveLength(1024);
    expect(exporter.getFinishedSpans().at(-1)?.name).toBe('editor.last');
  } finally { await provider.shutdown(); }
});
it('keeps the latest metric collection while preserving cumulative counts across exports', async () => {
  const exporter = new CurrentMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60000 });
  const provider = new MeterProvider({ readers: [reader] });
  const counter = provider.getMeter('synthetic-editor').createCounter('editor.operations');
  try {
    for (let index = 0; index < 4; index++) { counter.add(1); await reader.forceFlush(); }
    expect(exporter.getMetrics()).toHaveLength(1);
    const metrics = exporter.getMetrics()[0].scopeMetrics[0].metrics;
    expect(metrics[0].dataPoints[0].value).toBe(4);
  } finally { await provider.shutdown(); }
});
