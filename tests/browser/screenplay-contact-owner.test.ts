// @vitest-environment node
import {it, expect} from 'vitest';
import {ScreenplayContact} from '../../apps/desktop/src/lib/screenplay-contact';
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
it('all concurrent flushes wait for text edited during the previous contact write', async () => {
  const first = deferred(), second = deferred(), values: string[] = [];
  let current = '', durable = '';
  const owner = new ScreenplayContact({
    stage: text => {current = text;}, fail: error => {throw error;},
    persist: async () => {
      const value = current;
      values.push(value);
      await (values.length === 1 ? first.promise : second.promise);
      durable = value;
    },
  });
  owner.edit('First');
  let completed = 0;
  const a = owner.flush().then(() => {completed++;});
  owner.edit('Latest\nContact');
  const b = owner.flush().then(() => {completed++;}),
    c = owner.flush().then(() => {completed++;});
  first.resolve();
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  expect(values).toEqual(['First', 'Latest\nContact']);
  expect(completed).toBe(0);
  second.resolve();
  await Promise.all([a, b, c]);
  expect(durable).toBe('Latest\nContact');
  expect(completed).toBe(3);
});
it('concurrent failed flushes preserve the latest staged contact and retry current shared preferences', async () => {
  const refused = deferred(), values: {contact: string; font: string}[] = [];
  const library = {contact: '', font: 'Original'};
  const owner = new ScreenplayContact({
    stage: text => {library.contact = text;}, fail: error => {throw error;},
    persist: async () => {values.push({...library}); if(values.length === 1) await refused.promise;},
  });
  owner.edit('First');
  const a = owner.flush(), b = owner.flush();
  owner.edit('Latest');
  library.font = 'Changed preference';
  const results = Promise.allSettled([a, b]);
  refused.reject(Error('WRITE_REFUSED'));
  expect((await results).map(result => result.status)).toEqual(['rejected', 'rejected']);
  await owner.flush();
  expect(values).toEqual([
    {contact: 'First', font: 'Original'},
    {contact: 'Latest', font: 'Changed preference'},
  ]);
});
