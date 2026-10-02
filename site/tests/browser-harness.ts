import { RenderClient } from '../src/globe/render-client';
import { createTemplateSvg, openPrintSession, rasterDataUrl } from '../src/globe/export';
import { loadLogo, loadMap } from '../src/globe/input';
import { paperLayout } from '../src/globe/paper';
import { SOURCE_PROJECTION_OPTIONS } from '../src/globe/source-projection';
import type { PixelImage } from '../src/globe/raster';

declare global {
  interface Window { __paperGlobeResults?: { done: boolean; checks: { name: string; passed: boolean; detail?: string }[]; timings: Record<string, number> } }
}
const results = { done: false, checks: [] as { name: string; passed: boolean; detail?: string }[], timings: {} as Record<string, number> };
window.__paperGlobeResults = results;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function check(name: string, action: () => Promise<void>) {
  try { await action(); results.checks.push({ name, passed: true }); }
  catch (error) { results.checks.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) }); }
  document.querySelector('pre')!.textContent = JSON.stringify(results, null, 2);
}
const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
const context = canvas.getContext('2d')!; context.fillStyle = '#ff0000'; context.fillRect(0, 0, 128, 64);
async function file(type = 'image/png') {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Encoding failed.')), type));
  return new File([blob], 'fixture', { type: blob.type });
}
async function main() {
  await check('real PNG/JPEG/WebP decode and raster-only logos', async () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      const value = await file(type); const map = await loadMap(value); const logo = await loadLogo(value);
      assert(map.width === 128 && map.height === 64, 'Incorrect decoded dimensions');
      assert(logo.dataUrl.startsWith('data:image/png;base64,'), 'Logo not normalized to PNG'); URL.revokeObjectURL(map.objectUrl);
    }
    let rejected = false;
    try { await loadLogo(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })); } catch { rejected = true; }
    assert(rejected, 'SVG logo accepted');
  });
  const source = await loadMap(await file());
  const worker = new RenderClient(source); const fallback = new RenderClient(source, { worker: false });
  const request = { size: 96, goreCount: 6, hemisphere: 'north' as const, sourceProjection: 'equirectangular' as const };
  try {
    await check('native Worker is active; all 32 combinations agree with the cooperative fallback', async () => {
      for (const { value: sourceProjection } of SOURCE_PROJECTION_OPTIONS) for (const goreCount of [4, 6, 8, 12]) for (const hemisphere of ['north', 'south'] as const) {
        const settings = { ...request, sourceProjection, goreCount, hemisphere };
        const actual = await worker.render(settings); const expected = await fallback.render(settings);
        assert(worker.executionMode === 'worker', 'Native worker silently fell back');
        assert(actual.pixels.every((value, i) => value === expected.pixels[i]), `Worker/fallback mismatch: ${sourceProjection}/${goreCount}/${hemisphere}`);
      }
    });
    await check('worker cancellation and superseding work reject stale results, then recover', async () => {
      const first = worker.render({ ...request, size: 1800 }).then(() => false, (error: unknown) => error instanceof Error && error.name === 'AbortError');
      await worker.render(request); assert(await first, 'Superseded job did not abort');
      const controller = new AbortController();
      const cancelled = worker.render({ ...request, size: 1800 }, controller.signal).then(() => false, (error: unknown) => error instanceof Error && error.name === 'AbortError');
      setTimeout(() => controller.abort(), 5); assert(await cancelled, 'Cancellation did not abort');
      assert((await worker.render(request)).width === 96, 'Recovery failed');
    });
    await check('worker startup failure falls back instead of breaking rendering', async () => {
      const Original = window.Worker;
      window.Worker = class { constructor() { throw new Error('Blocked worker'); } } as unknown as typeof Worker;
      let client: RenderClient | undefined;
      try { client = new RenderClient(source); assert(client.executionMode === 'cooperative', 'Fallback not selected'); assert((await client.render(request)).width === 96, 'Fallback did not render'); }
      finally { client?.dispose(); window.Worker = Original; }
    });
    await check('fallback yields to browser events', async () => {
      let ticks = 0; const timer = setInterval(() => { ticks += 1; }, 2);
      const start = performance.now(); await fallback.render({ ...request, size: 1000 });
      clearInterval(timer); results.timings.fallback1000Ms = Math.round(performance.now() - start);
      assert(ticks > 0, 'Fallback blocked all timer events');
    });
    await check('rendered SVG has physical dimensions, parses, and pole logo is unobscured', async () => {
      const raster = await rasterDataUrl(await worker.render(request)); const logo = await loadLogo(await file());
      const svg = createTemplateSvg({ raster, diameter: 3.5, paperSize: 'letter', goreCount: 6, hemisphere: 'north', cutLines: true, dashedCutLines: false, foldLines: true, tabs: true, logo: { ...logo, scale: 0.5, position: 'north-pole' } });
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml'); assert(!xml.querySelector('parsererror'), 'Invalid XML'); assert(xml.documentElement.getAttribute('width') === '215.9mm', 'Wrong physical width');
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); const image = new Image();
      try {
        image.src = url; await image.decode();
        const target = document.createElement('canvas'); target.width = 816; target.height = 1056;
        const ctx = target.getContext('2d')!; ctx.drawImage(image, 0, 0, 816, 1056);
        const layout = paperLayout(3.5, 'letter'); const pixel = ctx.getImageData(408, Math.floor((layout.y + layout.artMm / 2) * 1056 / layout.heightMm), 1, 1).data;
        assert(pixel[0] === 255 && pixel[1] === 0 && pixel[2] === 0, `Logo center obscured: ${pixel.join(',')}`);
        image.id = 'sample-template'; image.style.width = '600px'; document.body.append(image);
      } finally { URL.revokeObjectURL(url); }
    });
    await check('print opens two decoded images', async () => {
      const original = window.open.bind(window); let popup: Window | null = null; let printed = false;
      window.open = (url, target, features) => { popup = original(url, target, features); if (popup) popup.print = () => { printed = true; }; return popup; };
      try {
        const session = openPrintSession('a4');
        const raster = await rasterDataUrl(await worker.render(request));
        const svgs = (['north', 'south'] as const).map((hemisphere) => createTemplateSvg({ raster, diameter: 3.5, paperSize: 'a4', goreCount: 6, hemisphere, cutLines: true, dashedCutLines: false, foldLines: true, tabs: true }));
        await session.print(svgs); assert(printed, 'Print not requested');
        const opened = popup as Window | null;
        assert(opened && opened.document.images.length === 2, 'Not exactly two print images');
        assert([...opened.document.images].every((image) => image.complete && image.naturalWidth > 0), 'Print before image decode'); session.close();
      } finally { window.open = original; }
    });
    await check('blocked popup provides a recoverable error', async () => {
      const original = window.open; window.open = () => null;
      try { let message = ''; try { openPrintSession('letter'); } catch (error) { message = String(error); } assert(/Allow pop-ups/.test(message), 'Missing popup recovery instruction'); }
      finally { window.open = original; }
    });
    await check('representative bounded 4096×2048 source benchmark', async () => {
      const pixels = new Uint8ClampedArray(4096 * 2048 * 4).fill(255);
      const large: PixelImage = { width: 4096, height: 2048, pixels }; const client = new RenderClient(large);
      try {
        let start = performance.now(); await client.render({ ...request, size: 720 }); results.timings.worker4096x2048PreviewMs = Math.round(performance.now() - start);
        start = performance.now(); await client.render({ ...request, size: 1400 }); results.timings.worker4096x2048Export1400Ms = Math.round(performance.now() - start);
        assert(client.executionMode === 'worker', 'Benchmark did not use worker');
      } finally { client.dispose(); }
    });
  } finally { worker.dispose(); fallback.dispose(); URL.revokeObjectURL(source.objectUrl); }
}
void main().catch((error: unknown) => results.checks.push({ name: 'harness', passed: false, detail: String(error) })).finally(() => {
  results.done = true; document.querySelector('pre')!.textContent = JSON.stringify(results, null, 2);
});
