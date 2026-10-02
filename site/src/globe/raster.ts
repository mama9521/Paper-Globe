import { cassiniInverse } from './cassini';
import { angularDistance } from './coordinates';
import { assertGoreCount, centralMeridians, hemisphereLayoutDirection, RADIUS_FRACTION, type Hemisphere } from './geometry';
import { contentBoundsSteps, sourceProjectionToPixel, type PixelBounds, type SourceProjection } from './source-projection';
import { MAX_OUTPUT_PIXELS } from './paper';
import { runCooperatively, throwIfAborted } from './lifecycle';

export type PixelImage = { width: number; height: number; pixels: Uint8ClampedArray };
export type RenderRequest = { size: number; goreCount: number; hemisphere: Hemisphere; sourceProjection: SourceProjection };
export const MAX_SOURCE_PIXELS = 8_388_608;
export function validatePixels(source: PixelImage) {
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 1 || source.height < 1 || source.width > 8192 || source.height > 8192 || source.width * source.height > MAX_SOURCE_PIXELS || source.pixels.length !== source.width * source.height * 4) throw new Error('Invalid or oversized source pixel buffer.');
}
/** Interpolate premultiplied colors, then return straight-alpha RGBA for ImageData. */
export function sampleBilinearInto(source: PixelImage, x: number, y: number, wrapX: boolean, target: Uint8ClampedArray, offset = 0) {
  const { width, height, pixels } = source;
  const sx = wrapX ? ((x % width) + width) % width : Math.max(0, Math.min(width - 1, x));
  const sy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(sx); const y0 = Math.floor(sy);
  const x1 = wrapX ? (x0 + 1) % width : Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = sx - x0; const ty = sy - y0;
  const a = (y0 * width + x0) * 4; const b = (y0 * width + x1) * 4;
  const c = (y1 * width + x0) * 4; const d = (y1 * width + x1) * 4;
  const wa = (1 - tx) * (1 - ty) * pixels[a + 3];
  const wb = tx * (1 - ty) * pixels[b + 3];
  const wc = (1 - tx) * ty * pixels[c + 3];
  const wd = tx * ty * pixels[d + 3];
  const alpha = wa + wb + wc + wd;
  target[offset + 3] = Math.round(alpha);
  for (let channel = 0; channel < 3; channel += 1) {
    target[offset + channel] = alpha > 0 ? Math.round((pixels[a + channel] * wa + pixels[b + channel] * wb + pixels[c + channel] * wc + pixels[d + channel] * wd) / alpha) : 0;
  }
}
export function* rasterSteps(source: PixelImage, request: RenderRequest, bounds: PixelBounds): Generator<number, PixelImage> {
  validatePixels(source);
  const { size, goreCount, hemisphere, sourceProjection } = request;
  assertGoreCount(goreCount);
  if (!Number.isInteger(size) || size < 16 || size * size > MAX_OUTPUT_PIXELS) throw new Error('Invalid output size or output memory budget exceeded.');
  if (!['north', 'south'].includes(hemisphere)) throw new Error('Invalid hemisphere.');
  const output = new Uint8ClampedArray(size * size * 4);
  const center = size / 2; const radius = size * RADIUS_FRACTION;
  const halfWidth = 180 / goreCount;
  const sign = hemisphere === 'north' ? 1 : -1;
  const direction = hemisphereLayoutDirection(hemisphere);
  const meridians = centralMeridians(goreCount);
  for (let index = 0; index < goreCount; index += 1) {
    const meridian = meridians[index];
    const angle = -Math.PI / 2 + direction * index * Math.PI * 2 / goreCount;
    const axisX = Math.cos(angle); const axisY = Math.sin(angle);
    // A conservative rotated rectangle encloses this lobe, not the entire hemisphere.
    const lateralBound = radius * 2 / goreCount;
    const corners = [
      [center - axisY * lateralBound, center + axisX * lateralBound],
      [center + axisY * lateralBound, center - axisX * lateralBound],
      [center + axisX * radius - axisY * lateralBound, center + axisY * radius + axisX * lateralBound],
      [center + axisX * radius + axisY * lateralBound, center + axisY * radius - axisX * lateralBound],
    ];
    const xStart = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0]))));
    const xEnd = Math.min(size, Math.ceil(Math.max(...corners.map((p) => p[0]))));
    const yStart = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))));
    const yEnd = Math.min(size, Math.ceil(Math.max(...corners.map((p) => p[1]))));
    for (let py = yStart; py < yEnd; py += 1) {
      for (let px = xStart; px < xEnd; px += 1) {
        const vx = px + 0.5 - center; const vy = py + 0.5 - center;
        const radial = vx * axisX + vy * axisY;
        if (radial < 0 || radial > radius) continue;
        const lateral = direction * (-vx * axisY + vy * axisX);
        const geo = cassiniInverse(lateral / radius * Math.PI / 2, sign * (Math.PI / 2 - radial / radius * Math.PI / 2), meridian);
        if (sign * geo.latitude < -0.0001 || Math.abs(angularDistance(geo.longitude, meridian)) > halfWidth + 0.001) continue;
        const point = sourceProjectionToPixel(geo.longitude, geo.latitude, source.width, source.height, sourceProjection, bounds);
        if (point) sampleBilinearInto(source, point.x, point.y, sourceProjection === 'equirectangular', output, (py * size + px) * 4);
      }
      yield (index + (py - yStart + 1) / (yEnd - yStart)) / goreCount;
    }
  }
  return { width: size, height: size, pixels: output };
}
export class RasterPipeline {
  private readonly bounds = new Map<SourceProjection, PixelBounds>();
  constructor(private readonly source: PixelImage) { validatePixels(source); }
  async render(request: RenderRequest, signal?: AbortSignal, progress?: (fraction: number) => void) {
    throwIfAborted(signal);
    let bounds = this.bounds.get(request.sourceProjection);
    if (!bounds) {
      bounds = await runCooperatively(contentBoundsSteps(this.source.pixels, this.source.width, this.source.height, request.sourceProjection), signal, (fraction) => progress?.(fraction * 0.15));
      this.bounds.set(request.sourceProjection, bounds);
    }
    throwIfAborted(signal);
    return runCooperatively(rasterSteps(this.source, request, bounds), signal, (fraction) => progress?.(0.15 + fraction * 0.85));
  }
}
