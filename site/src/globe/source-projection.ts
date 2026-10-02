import { degreesToRadians, geoToPixel, normalizeLongitude, type PixelPoint } from './coordinates';

export type SourceProjection = 'equirectangular' | 'natural-earth' | 'robinson' | 'web-mercator';
export type PixelBounds = { left: number; top: number; width: number; height: number };
type ProjectedPoint = { x: number; y: number };
type ProjectedBounds = { minX: number; maxX: number; minY: number; maxY: number };
type ProjectionDefinition = {
  label: string; hint: string; bounds: ProjectedBounds;
  forward: (longitude: number, latitude: number) => ProjectedPoint | null;
  trimUniformBackground: boolean;
};
const HALF_PI = Math.PI / 2;
const WEB_MERCATOR_MAX_LATITUDE = Math.atan(Math.sinh(Math.PI));
function naturalEarthForward(longitude: number, latitude: number): ProjectedPoint {
  const latitude2 = latitude * latitude;
  const latitude4 = latitude2 * latitude2;
  return {
    x: longitude * (0.8707 - 0.131979 * latitude2 + latitude4 * (-0.013791 + latitude4 * (0.003971 * latitude2 - 0.001529 * latitude4))),
    y: latitude * (1.007226 + latitude2 * (0.015085 + latitude4 * (-0.044475 + 0.028874 * latitude2 - 0.005916 * latitude4))),
  };
}
const ROBINSON_COEFFICIENTS = [
  [0.9986, -0.062], [1, 0], [0.9986, 0.062], [0.9954, 0.124], [0.99, 0.186],
  [0.9822, 0.248], [0.973, 0.31], [0.96, 0.372], [0.9427, 0.434], [0.9216, 0.4958],
  [0.8962, 0.5571], [0.8679, 0.6176], [0.835, 0.6769], [0.7986, 0.7346], [0.7597, 0.7903],
  [0.7186, 0.8435], [0.6732, 0.8936], [0.6213, 0.9394], [0.5722, 0.9761], [0.5322, 1],
] as const;
const ROBINSON_Y_SCALE = 1.593415793900743;
function robinsonForward(longitude: number, latitude: number): ProjectedPoint {
  const interval = Math.min(18, (Math.abs(latitude) * 36) / Math.PI);
  const index = Math.floor(interval);
  const f = interval - index;
  const previous = ROBINSON_COEFFICIENTS[index];
  const current = ROBINSON_COEFFICIENTS[index + 1];
  const next = ROBINSON_COEFFICIENTS[Math.min(19, index + 2)];
  const interpolate = (channel: 0 | 1) => current[channel] + f * (next[channel] - previous[channel]) / 2 + f * f * (next[channel] - 2 * current[channel] + previous[channel]) / 2;
  return { x: longitude * interpolate(0), y: Math.sign(latitude || 1) * interpolate(1) * ROBINSON_Y_SCALE };
}
function webMercatorForward(longitude: number, latitude: number): ProjectedPoint | null {
  if (Math.abs(latitude) > WEB_MERCATOR_MAX_LATITUDE + 1e-10) return null;
  const phi = Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude));
  return { x: longitude, y: Math.asinh(Math.tan(phi)) };
}
const naturalEarthNorth = naturalEarthForward(0, HALF_PI).y;
const naturalEarthEast = naturalEarthForward(Math.PI, 0).x;
const PROJECTIONS: Record<SourceProjection, ProjectionDefinition> = {
  equirectangular: {
    label: 'Equirectangular', hint: 'The whole image spans 360° × 180°. A 2:1 image gives equal pixels per degree.',
    bounds: { minX: -Math.PI, maxX: Math.PI, minY: -HALF_PI, maxY: HALF_PI },
    forward: (x, y) => ({ x, y }), trimUniformBackground: false,
  },
  'natural-earth': {
    label: 'Natural Earth', hint: 'Fits the rounded world footprint and ignores a uniform background around it.',
    bounds: { minX: -naturalEarthEast, maxX: naturalEarthEast, minY: -naturalEarthNorth, maxY: naturalEarthNorth },
    forward: naturalEarthForward, trimUniformBackground: true,
  },
  robinson: {
    label: 'Robinson', hint: 'Fits a complete Robinson world map centered on the Greenwich meridian.',
    bounds: { minX: -Math.PI, maxX: Math.PI, minY: -ROBINSON_Y_SCALE, maxY: ROBINSON_Y_SCALE },
    forward: robinsonForward, trimUniformBackground: true,
  },
  'web-mercator': {
    label: 'Web Mercator', hint: 'Uses the usual square world extent. The missing polar caps remain transparent.',
    bounds: { minX: -Math.PI, maxX: Math.PI, minY: -Math.PI, maxY: Math.PI },
    forward: webMercatorForward, trimUniformBackground: false,
  },
};
export const SOURCE_PROJECTION_OPTIONS = (Object.keys(PROJECTIONS) as SourceProjection[]).map((value) => ({ value, label: PROJECTIONS[value].label }));
export function sourceProjectionLabel(projection: SourceProjection) { return PROJECTIONS[projection].label; }
export function sourceProjectionHint(projection: SourceProjection) { return PROJECTIONS[projection].hint; }
const fullImageBounds = (width: number, height: number): PixelBounds => ({ left: 0, top: 0, width, height });
function colorDistance(first: readonly number[], second: readonly number[]) {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2], (first[3] - second[3]) * 1.5);
}
/** Yield per source row so margin detection is cancellable in the browser fallback too. */
export function* contentBoundsSteps(pixels: Uint8ClampedArray, width: number, height: number, projection: SourceProjection): Generator<number, PixelBounds> {
  const fullBounds = fullImageBounds(width, height);
  const definition = PROJECTIONS[projection];
  if (!definition.trimUniformBackground || width < 8 || height < 8) return fullBounds;
  const sampleSize = Math.max(2, Math.min(8, Math.floor(Math.min(width, height) / 80)));
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([cornerX, cornerY]) => {
    const sums = [0, 0, 0, 0];
    for (let dy = 0; dy < sampleSize; dy += 1) {
      for (let dx = 0; dx < sampleSize; dx += 1) {
        const index = ((cornerY ? height - 1 - dy : dy) * width + (cornerX ? width - 1 - dx : dx)) * 4;
        for (let channel = 0; channel < 4; channel += 1) sums[channel] += pixels[index + channel];
      }
    }
    return sums.map((sum) => sum / (sampleSize * sampleSize));
  });
  const background = [0, 1, 2, 3].map((channel) => corners.reduce((sum, color) => sum + color[channel], 0) / 4);
  const spread = Math.max(...corners.map((color) => colorDistance(color, background)));
  if (spread > 32) return fullBounds;
  const thresholdSquared = Math.max(22, spread * 3) ** 2;
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const distance = (pixels[i] - background[0]) ** 2 + (pixels[i + 1] - background[1]) ** 2 + (pixels[i + 2] - background[2]) ** 2 + ((pixels[i + 3] - background[3]) * 1.5) ** 2;
      if (distance <= thresholdSquared) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    yield (y + 1) / height;
  }
  if (maxX < minX || maxY < minY) return fullBounds;
  const detected = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const aspect = (definition.bounds.maxX - definition.bounds.minX) / (definition.bounds.maxY - definition.bounds.minY);
  if (detected.width < width * 0.6 || detected.height < height * 0.6 || Math.abs(detected.width / detected.height / aspect - 1) > 0.12) return fullBounds;
  return detected;
}
export function detectSourceContentBounds(pixels: Uint8ClampedArray, width: number, height: number, projection: SourceProjection): PixelBounds {
  const iterator = contentBoundsSteps(pixels, width, height, projection);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}
function projectedToPixel(projected: ProjectedPoint, bounds: ProjectedBounds, content: PixelBounds): PixelPoint {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const availableWidth = Math.max(1, content.width - 1);
  const availableHeight = Math.max(1, content.height - 1);
  const scale = Math.min(availableWidth / width, availableHeight / height);
  return {
    x: content.left + (availableWidth - width * scale) / 2 + (projected.x - bounds.minX) * scale,
    y: content.top + (availableHeight - height * scale) / 2 + (bounds.maxY - projected.y) * scale,
  };
}
export function sourceProjectionToPixel(longitude: number, latitude: number, width: number, height: number, projection: SourceProjection, content = fullImageBounds(width, height)): PixelPoint | null {
  if (projection === 'equirectangular') return geoToPixel(longitude, latitude, width, height);
  let lon = normalizeLongitude(longitude);
  let lat = Math.max(-90, Math.min(90, latitude));
  if (projection === 'natural-earth' || projection === 'robinson') {
    const lonInset = Math.min(2, 1080 / Math.max(1, content.width));
    const latInset = Math.min(2, 540 / Math.max(1, content.height));
    lon = Math.max(-180 + lonInset, Math.min(180 - lonInset, lon));
    lat = Math.max(-90 + latInset, Math.min(90 - latInset, lat));
  }
  const definition = PROJECTIONS[projection];
  const projected = definition.forward(degreesToRadians(lon), degreesToRadians(lat));
  return projected ? projectedToPixel(projected, definition.bounds, content) : null;
}
export const sourceProjectionLimits = { webMercatorMaximumLatitude: WEB_MERCATOR_MAX_LATITUDE * 180 / Math.PI };
