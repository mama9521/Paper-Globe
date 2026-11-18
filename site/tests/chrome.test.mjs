import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { waitForDevTools } from '../scripts/chrome.mjs';

function fixture(t) {
  const profile = mkdtempSync(join(tmpdir(), 'paper-globe-startup-test-'));
  const child = Object.assign(new EventEmitter(), {
    spawnfile: '/test/chrome', exitCode: null, signalCode: null,
    stdout: new PassThrough(), stderr: new PassThrough(),
  });
  t.after(() => {
    child.stdout.destroy(); child.stderr.destroy();
    rmSync(profile, { recursive: true, force: true });
    assert.equal(child.listenerCount('error'), 0, 'Startup error listener leaked');
    assert.equal(child.stderr.listenerCount('data'), 0, 'Startup output listener leaked');
  });
  return { child, profile };
}

test('Chrome startup accepts a fragmented stderr endpoint without a port file', async (t) => {
  const { child, profile } = fixture(t);
  const pending = waitForDevTools(child, profile, 1000);
  child.stderr.write('DevTools listening on ws://127.0.');
  child.stderr.write('0.1:43210/devtools/browser/fixture\n');
  assert.equal(await pending, 43210);
});

test('Chrome startup waits for a valid port file when stderr has no endpoint', async (t) => {
  const { child, profile } = fixture(t);
  writeFileSync(join(profile, 'DevToolsActivePort'), '0\n');
  const pending = waitForDevTools(child, profile, 1000);
  const timer = setTimeout(() => writeFileSync(join(profile, 'DevToolsActivePort'), '43211\n/devtools/browser/fixture\n'), 20);
  t.after(() => clearTimeout(timer));
  assert.equal(await pending, 43211);
});

test('Chrome startup reports an early exit and the browser error instead of a timeout', async (t) => {
  const { child, profile } = fixture(t);
  const pending = waitForDevTools(child, profile, 1000);
  child.stderr.write('error while loading shared libraries: libexample.so\n');
  child.exitCode = 127;
  await assert.rejects(pending, (error) => {
    assert.match(error.message, /exit code 127/);
    assert.match(error.message, /libexample\.so/);
    assert.match(error.message, /\/test\/chrome/);
    return true;
  });
});

test('Chrome spawn errors include the original cause', async (t) => {
  const { child, profile } = fixture(t);
  const pending = waitForDevTools(child, profile, 1000);
  const cause = new Error('spawn EACCES');
  child.emit('error', cause);
  await assert.rejects(pending, (error) => {
    assert.equal(error.cause, cause);
    assert.match(error.message, /could not start: spawn EACCES/);
    return true;
  });
});

test('Chrome startup has a bounded timeout with captured diagnostic output', async (t) => {
  const { child, profile } = fixture(t);
  const pending = waitForDevTools(child, profile, 30);
  child.stderr.write('startup initialization stalled\n');
  await assert.rejects(pending, /within 30 ms[\s\S]*startup initialization stalled/);
});
