import { cassiniForward, cassiniInverse } from './cassini';
import { angularDistance, geoToPixel } from './coordinates';

export type Hemisphere = 'north' | 'south';

export type RenderGoresOptions = {
  source: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  size?: number;
  goreCount?: number;
  hemisphere: Hemisphere;
};

export type TemplatePoint = { x: number; y: number };

const TAU = Math.PI * 2;

export function centralMeridians(goreCount: number) {
  const width = 360 / goreCount;
  return Array.from({ length: goreCount }, (_, index) => -180 + index * width);
}

export function lobeOutline(
  goreCount: number,
  hemisphere: Hemisphere,
  radius: number,
  samples = 36,
): TemplatePoint[] {
  const halfWidth = 180 / goreCount;
  const sign = hemisphere === 'north' ? 1 : -1;
  const points: TemplatePoint[] = [{ x: 0, y: 0 }];

  for (let index = 1; index <= samples; index += 1) {
    const latitude = sign * (90 - (index / samples) * 90);
    const projected = cassiniForward(-halfWidth, latitude, 0);
    points.push({
      x: (projected.x / (Math.PI / 2)) * radius,
      y: ((Math.PI / 2 - Math.abs(projected.y)) / (Math.PI / 2)) * radius,
    });
  }

  for (let index = samples; index >= 1; index -= 1) {
    const latitude = sign * (90 - (index / samples) * 90);
    const projected = cassiniForward(halfWidth, latitude, 0);
    points.push({
      x: (projected.x / (Math.PI / 2)) * radius,
      y: ((Math.PI / 2 - Math.abs(projected.y)) / (Math.PI / 2)) * radius,
    });
  }

  return points;
}

export function glueTabOutline(goreCount: number, radius: number): TemplatePoint[] {
  const goreHalfWidth = (radius * 2) / goreCount;
  const baseHalfWidth = goreHalfWidth * 0.6;
  const outerHalfWidth = baseHalfWidth * 0.78;
  const height = Math.min(radius * 0.14, goreHalfWidth * 0.55);

  return [
    { x: -baseHalfWidth, y: radius },
    { x: baseHalfWidth, y: radius },
    { x: outerHalfWidth, y: radius + height },
    { x: -outerHalfWidth, y: radius + height },
  ];
}

export function pointsToSvgPath(points: TemplatePoint[]) {
  return `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')} Z`;
}

function sampleBilinear(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const wrappedX = ((x % width) + width) % width;
  const clampedY = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(wrappedX);
  const y0 = Math.floor(clampedY);
  const x1 = (x0 + 1) % width;
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = wrappedX - x0;
  const ty = clampedY - y0;
  const result = [0, 0, 0, 0];

  for (let channel = 0; channel < 4; channel += 1) {
    const top = pixels[(y0 * width + x0) * 4 + channel] * (1 - tx)
      + pixels[(y0 * width + x1) * 4 + channel] * tx;
    const bottom = pixels[(y1 * width + x0) * 4 + channel] * (1 - tx)
      + pixels[(y1 * width + x1) * 4 + channel] * tx;
    result[channel] = Math.round(top * (1 - ty) + bottom * ty);
  }

  return result;
}

export function renderHemisphereGores({
  source,
  sourceWidth,
  sourceHeight,
  size = 720,
  goreCount = 6,
  hemisphere,
}: RenderGoresOptions) {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error('Canvas rendering is unavailable.');
  sourceContext.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  const sourcePixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable.');

  const output = context.createImageData(size, size);
  const center = size / 2;
  const radius = size * 0.405;
  const halfWidth = 180 / goreCount;
  const sign = hemisphere === 'north' ? 1 : -1;

  centralMeridians(goreCount).forEach((centralMeridian, goreIndex) => {
    const angle = -Math.PI / 2 + (goreIndex * TAU) / goreCount;
    const axisX = Math.cos(angle);
    const axisY = Math.sin(angle);
    const perpX = -axisY;
    const perpY = axisX;

    const extent = Math.ceil(radius * 1.08);
    for (let py = Math.max(0, Math.floor(center - extent)); py < Math.min(size, Math.ceil(center + extent)); py += 1) {
      for (let px = Math.max(0, Math.floor(center - extent)); px < Math.min(size, Math.ceil(center + extent)); px += 1) {
        const vx = px + 0.5 - center;
        const vy = py + 0.5 - center;
        const radial = vx * axisX + vy * axisY;
        if (radial < 0 || radial > radius) continue;

        const lateral = vx * perpX + vy * perpY;
        const projectedX = (lateral / radius) * (Math.PI / 2);
        const projectedY = sign * (Math.PI / 2 - (radial / radius) * (Math.PI / 2));
        const geo = cassiniInverse(projectedX, projectedY, centralMeridian);

        if (sign * geo.latitude < -0.0001) continue;
        if (Math.abs(angularDistance(geo.longitude, centralMeridian)) > halfWidth + 0.001) continue;

        const sourcePoint = geoToPixel(geo.longitude, geo.latitude, sourceWidth, sourceHeight);
        const rgba = sampleBilinear(
          sourcePixels,
          sourceWidth,
          sourceHeight,
          sourcePoint.x,
          sourcePoint.y,
        );
        const outputIndex = (py * size + px) * 4;
        output.data[outputIndex] = rgba[0];
        output.data[outputIndex + 1] = rgba[1];
        output.data[outputIndex + 2] = rgba[2];
        output.data[outputIndex + 3] = rgba[3];
      }
    }
  });

  context.putImageData(output, 0, 0);
  return canvas;
}
