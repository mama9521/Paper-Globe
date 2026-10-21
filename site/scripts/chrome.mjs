import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Minimal CDP driver using Node 22 WebSocket; no unlocked browser-test dependency. */
export async function openChrome(url) {
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'chromium', 'chromium-browser'].filter(Boolean);
  const binary = candidates.find((name) => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
  if (!binary) throw new Error('Chrome/Chromium not found. Set CHROME_BIN to its executable path.');
  const profile = mkdtempSync(join(tmpdir(), 'paper-globe-chrome-'));
  const child = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-popup-blocking', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    let port;
    for (let i = 0; i < 100; i += 1) {
      try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); if (port) break; } catch { /* browser starting */ }
      await delay(100);
    }
    if (!port) throw new Error('Chrome did not expose a debugging port.');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
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
