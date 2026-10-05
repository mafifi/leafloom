import { describe, expect, it } from 'vitest';
import { checkSizes, lineCount } from '../../scripts/check-file-size.mjs';

describe('owned source size budgets', () => {
  it('warns before the hard limit and fails at 1,000, including tests and native source', () => {
    const report = checkSizes(new Map([
      ['apps/view.svelte', 401], ['packages/content.ts', 301],
      ['apps/main.rs', 1000], ['tests/editor.spec.ts', 1000], ['apps/theme.css', 1001],
    ]), {});
    expect(report.warnings.map((item: {path: string}) => item.path)).toEqual(['apps/view.svelte', 'packages/content.ts']);
    expect(report.violations).toHaveLength(3);
  });
  it('freezes existing debt and requires removing an exception once split', () => {
    const list = { 'apps/old.ts': { lines: 1200, task: 'split editor operations' } };
    expect(checkSizes(new Map([['apps/old.ts', 1200]]), list).violations).toHaveLength(0);
    expect(checkSizes(new Map([['apps/old.ts', 1201]]), list).violations).toHaveLength(1);
    expect(checkSizes(new Map([['apps/old.ts', 999]]), list).violations).toHaveLength(1);
    expect(checkSizes(new Map(), list).violations).toHaveLength(1);
  });
  it('counts the final unterminated line', () => {
    expect(lineCount('')).toBe(0);
    expect(lineCount('a\nb\n')).toBe(2);
    expect(lineCount('a\nb')).toBe(2);
  });
});
