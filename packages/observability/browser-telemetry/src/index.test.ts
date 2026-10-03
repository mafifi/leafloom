import { it, expect } from 'vitest';
import { BrowserTelemetry } from './index.ts';
it('links nested and explicitly propagated spans, reports errors without private content', async () => {
  const telemetry = new BrowserTelemetry();
  try {
    let parent = '';
    telemetry.sync('ui.save', (carrier) => {
      parent = carrier;
      telemetry.sync('ui.checkpoint', () => {});
    });
    await telemetry.async(
      'ui.host',
      async (carrier) => {
        expect(carrier.split('-')[1]).toBe(parent.split('-')[1]);
      },
      parent,
    );
    expect(() =>
      telemetry.sync('ui.failure', () => {
        throw Error('Private manuscript prose');
      }),
    ).toThrow();
    telemetry.recordDuration('ui.render', 5);
    const diagnostic = await telemetry.diagnostics(),
      save = diagnostic.spans.find((s) => s.name === 'ui.save')!,
      child = diagnostic.spans.find((s) => s.name === 'ui.checkpoint')!;
    expect(child.parentSpanId).toBe(save.spanId);
    expect(child.traceId).toBe(save.traceId);
    expect(diagnostic.spans.find((s) => s.name === 'ui.failure')!.status).toBe('error');
    expect(diagnostic.metrics.some((m) => m.name === 'leafloom.ui.duration' && m.points > 0)).toBe(
      true,
    );
    expect(JSON.stringify(diagnostic)).not.toContain('Private');
    expect(() => telemetry.sync('Private prose!', () => {})).toThrow();
  } finally {
    await telemetry.dispose();
  }
});
