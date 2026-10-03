// Owned test process only; not a production environment option or renderer hook.
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
const config = JSON.parse(await readFile(new URL('./clock.json', import.meta.url), 'utf8'));
const root = await realpath(config.root),
  marker = await readFile(path.join(root, '.leafloom-fixture'), 'utf8');
if (marker !== 'owned-host-backup-fixture-v1' || process.env.LEAFLOOM_LIBRARY_ROOT !== root)
  throw Error('Clock preload requires its marked canonical private library');
const NativeDate = Date,
  stamp = NativeDate.parse(config.nowIso);
if (!Number.isFinite(stamp)) throw Error('Invalid fixture clock');
globalThis.Date = new Proxy(NativeDate, {
  construct(target, args) {
    return Reflect.construct(target, args.length ? args : [stamp], target);
  },
  apply() {
    return new NativeDate(stamp).toString();
  },
  get(target, key, receiver) {
    return key === 'now' ? () => stamp : Reflect.get(target, key, receiver);
  },
});
