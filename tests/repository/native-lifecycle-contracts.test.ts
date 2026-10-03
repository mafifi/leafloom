import { test } from 'vitest';
import assert from 'node:assert/strict';
import { nativeContract } from '../../scripts/native-artifact-contracts.mjs';
test('reviewed imports cover menu and normal quit have explicit finite parser dispatch', () => {
  for (const id of [
    'document:imports',
    'document:malformed-import',
    'document:spanish-import',
    'document:cover-menu',
    'lifecycle:normal-quit',
  ]) {
    const contract = nativeContract(id);
    assert.ok(contract, 'Reviewed contract ' + id);
    assert.ok(contract.parser.kind);
  }
  assert.equal(nativeContract('lifecycle:arbitrary-quit'), undefined);
});
