import assert from 'node:assert/strict';
import test from 'node:test';
import { LatestResource, runCooperatively } from '../src/globe/lifecycle';
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
void test('latest map/logo selection wins and stale resources are released (#5)', async () => {
  const released: string[] = []; const loader = new LatestResource<string>((value) => released.push(value));
  const a = deferred<string>(); const b = deferred<string>();
  const first = loader.load(() => a.promise); const second = loader.load(() => b.promise);
  b.resolve('B'); assert.deepEqual(await second, { value: 'B' });
  a.resolve('A'); assert.equal(await first, undefined); assert.deepEqual(released, ['A']);
  const failed = await loader.load(() => Promise.reject(new Error('bad image')));
  assert.ok(failed && 'error' in failed); assert.deepEqual(released, ['A']);
  await loader.load(() => Promise.resolve('C')); assert.deepEqual(released, ['A', 'B']);
  loader.clear(); loader.clear(); assert.deepEqual(released, ['A', 'B', 'C']);
});
void test('stale errors do not replace the latest notice, unmount invalidates pending work (#3, #5)', async () => {
  const released: string[] = []; const loader = new LatestResource<string>((value) => released.push(value));
  const a = deferred<string>(); const old = loader.load(() => a.promise);
  await loader.load(() => Promise.resolve('B')); a.reject(new Error('obsolete')); assert.equal(await old, undefined);
  const c = deferred<string>(); const pending = loader.load(() => c.promise); loader.clear(); c.resolve('C');
  assert.equal(await pending, undefined); assert.deepEqual(released, ['B', 'C']);
});
void test('scheduler reports progress and aborts between slices (#8, #10)', async () => {
  const controller = new AbortController(); let closed = false;
  function* steps(): Generator<number, number> {
    try { for (let i = 0; i < 100; i += 1) { if (i === 10) controller.abort(); yield i / 100; } return 42; }
    finally { closed = true; }
  }
  await assert.rejects(runCooperatively(steps(), controller.signal), { name: 'AbortError' }); assert.equal(closed, true);
  const fractions: number[] = []; function* success(): Generator<number, number> { yield 0.5; return 42; }
  assert.equal(await runCooperatively(success(), undefined, (value) => fractions.push(value)), 42); assert.equal(fractions.at(-1), 1);
});
