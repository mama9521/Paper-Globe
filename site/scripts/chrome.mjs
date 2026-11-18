import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Cold CI launches may take longer than a local browser startup. */
export async function waitForDevTools(child, profile, timeoutMs = 45000) {
  let output = ''; let launchError;
  const capture = (chunk) => { output = (output + chunk.toString()).slice(-16384); };
  const onError = (error) => { launchError = error; };
  child.stderr?.on('data', capture); child.stdout?.on('data', capture);
  child.on('error', onError);
  const failure = (reason) => new Error(`${reason}\nBrowser: ${child.spawnfile}\n${output.trim() || 'Chrome produced no startup output.'}`, launchError ? { cause: launchError } : undefined);
  const deadline = performance.now() + timeoutMs;
  try {
    while (true) {
      if (launchError) throw failure(`Chrome could not start: ${launchError.message}`);
      if (child.exitCode !== null || child.signalCode !== null) throw failure(`Chrome exited before its debugging endpoint was ready (${child.signalCode ?? `exit code ${child.exitCode}`}).`);
      // Chrome documents this endpoint on stderr. The profile file is a
      // fallback for builds/wrappers that do not forward that announcement.
      let port = Number(output.match(/DevTools listening on ws:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)\//)?.[1]);
      if (!port) {
        try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* browser starting */ }
      }
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw failure(`Chrome did not expose a debugging endpoint within ${timeoutMs} ms.`);
      await delay(Math.min(100, remaining));
    }
  } finally {
    child.stderr?.removeListener('data', capture); child.stdout?.removeListener('data', capture);
    child.removeListener('error', onError);
  }
}

/** Minimal CDP driver using Node 22 WebSocket; no unlocked browser-test dependency. */
export async function openChrome(url) {
  const candidates = process.env.CHROME_BIN ? [process.env.CHROME_BIN] : ['google-chrome', 'chromium', 'chromium-browser'];
  const binary = candidates.find((name) => spawnSync(name, ['--version'], { stdio: 'ignore', timeout: 10000 }).status === 0);
  if (!binary) throw new Error('Chrome/Chromium not found. Set CHROME_BIN to its executable path.');
  const profile = mkdtempSync(join(tmpdir(), 'paper-globe-chrome-'));
  const child = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-popup-blocking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let socket;
  try {
    const port = await waitForDevTools(child, profile);
    const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Chrome debugging endpoint returned HTTP ${response.status}.`);
    const target = await response.json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    const pending = new Map(); let id = 0;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data); const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id); clearTimeout(callback.timer);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error))); else callback.resolve(message.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const next = ++id; const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timed out: ${method}`)); }, 60000);
      pending.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async (expression, timeout = 60000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) { const result = await evaluate(expression); if (result) return result; await delay(100); }
      throw new Error(`Browser condition timed out: ${expression}`);
    };
    const close = async () => { socket.close(); child.kill(); await delay(400); rmSync(profile, { recursive: true, force: true }); };
    return { send, evaluate, until, close };
  } catch (error) { socket?.close(); child.kill(); await delay(400); rmSync(profile, { recursive: true, force: true }); throw error; }
}
