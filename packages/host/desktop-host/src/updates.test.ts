import { test, expect } from 'vitest';
import { UpdateStatus } from './updates';
test('update states validate progress and reject untrusted error text', () => {
  expect(
    UpdateStatus.safeParse({
      version: '0.1.0',
      channel: 'manual',
      status: 'disabled',
      reason: 'release-channel-unconfigured',
    }).success,
  ).toBe(true);
  for (const value of [
    { status: 'downloading', latestVersion: '0.2.0', transferred: 2, total: 1, percent: 200 },
    { status: 'error', code: 'arbitrary author text' },
    { status: 'ready' },
    { status: 'downloaded' },
  ])
    expect(UpdateStatus.safeParse({ version: '0.1.0', channel: 'signed', ...value }).success).toBe(
      false,
    );
});
