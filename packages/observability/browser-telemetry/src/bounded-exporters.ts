import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
/** Keep recent trace detail and the latest cumulative metric export during long writing sessions. */
export class RecentSpanExporter extends InMemorySpanExporter {
  override export(...args: Parameters<InMemorySpanExporter['export']>) {
    super.export(...args);
    const spans = this.getFinishedSpans();
    if (spans.length > 1024) spans.splice(0, spans.length - 1024);
  }
}
export class CurrentMetricExporter extends InMemoryMetricExporter {
  override export(...args: Parameters<InMemoryMetricExporter['export']>) {
    this.reset();
    super.export(...args);
  }
}
