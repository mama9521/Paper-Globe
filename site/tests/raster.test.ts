import assert from 'node:assert/strict';
import test from 'node:test';
import { RasterPipeline, sampleBilinearInto, type PixelImage } from '../src/globe/raster';
import { SOURCE_PROJECTION_OPTIONS } from '../src/globe/source-projection';
const source: PixelImage = { width: 64, height: 32, pixels: new Uint8ClampedArray(64 * 32 * 4) };
for (let i = 0; i < source.pixels.length; i += 4) source.pixels.set([200, 80, 40, 255], i);
void test('alpha-weighted interpolation preserves color and wrapping (#6)', () => {
  const input = { width: 2, height: 1, pixels: new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255]) };
  const result = new Uint8ClampedArray(4);
  sampleBilinearInto(input, 0.5, 0, false, result); assert.deepEqual([...result], [255, 0, 0, 128]);
  sampleBilinearInto(input, 1.5, 0, true, result); assert.deepEqual([...result], [255, 0, 0, 128]);
  sampleBilinearInto(input, 0, 0, false, result); assert.deepEqual([...result], [0, 0, 0, 0]);
  sampleBilinearInto(source, 12.2, 6.1, true, result); assert.deepEqual([...result], [200, 80, 40, 255]);
});
void test('all 32 projection/count/hemisphere combinations produce deterministic bounded output', async () => {
  const pipeline = new RasterPipeline(source);
  for (const { value: sourceProjection } of SOURCE_PROJECTION_OPTIONS) for (const goreCount of [4, 6, 8, 12]) for (const hemisphere of ['north', 'south'] as const) {
    const request = { size: 96, sourceProjection, goreCount, hemisphere };
    const first = await pipeline.render(request); const second = await pipeline.render(request);
    assert.deepEqual(first.pixels, second.pixels); assert.equal(first.pixels.length, 96 * 96 * 4);
    assert.ok(first.pixels.some((value) => value !== 0)); assert.equal(first.pixels[3], 0);
    for (let i = 0; i < first.pixels.length; i += 4) if (first.pixels[i + 3]) assert.deepEqual(Array.from(first.pixels.subarray(i, i + 4)), [200, 80, 40, 255]);
  }
});
void test('full rendering of transparent edges does not introduce dark red pixels (#6)', async () => {
  const pipeline = new RasterPipeline({ width: 2, height: 1, pixels: new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255]) });
  const image = await pipeline.render({ size: 160, sourceProjection: 'equirectangular', goreCount: 6, hemisphere: 'north' });
  let partial = 0;
  for (let i = 0; i < image.pixels.length; i += 4) if (image.pixels[i + 3] > 1 && image.pixels[i + 3] < 254) { partial += 1; assert.equal(image.pixels[i], 255); }
  assert.ok(partial > 1000);
});
void test('failed/cancelled renders can be followed by successful ones (#8, #10)', async () => {
  const pipeline = new RasterPipeline(source); const request = { size: 96, sourceProjection: 'equirectangular' as const, goreCount: 6, hemisphere: 'north' as const };
  await assert.rejects(pipeline.render({ ...request, size: 99999 }), /memory/);
  const abort = new AbortController(); abort.abort(); await assert.rejects(pipeline.render(request, abort.signal), { name: 'AbortError' });
  assert.equal((await pipeline.render(request)).width, 96);
});
