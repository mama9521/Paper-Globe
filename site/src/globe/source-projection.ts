import {
  degreesToRadians,
  geoToPixel,
  normalizeLongitude,
  type PixelPoint,
} from './coordinates';

export type SourceProjection =
  | 'equirectangular'
  | 'natural-earth'
  | 'robinson'
  | 'web-mercator';

export type PixelBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ProjectedPoint = {
  x: number;
  y: number;
};

type ProjectedBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ProjectionDefinition = {
  label: string;
  hint: string;
  bounds: ProjectedBounds;
  forward: (
    longitudeRadians: number,
    latitudeRadians: number,
  ) => ProjectedPoint | null;
  trimUniformBackground: boolean;
};

const HALF_PI = Math.PI / 2;
const WEB_MERCATOR_MAX_LATITUDE = Math.atan(Math.sinh(Math.PI));

function naturalEarthForward(
  longitude: number,
  latitude: number,
): ProjectedPoint {
  const latitude2 = latitude * latitude;
  const latitude4 = latitude2 * latitude2;

  return {
    x:
      longitude *
      (0.8707 -
        0.131979 * latitude2 +
        latitude4 *
          (-0.013791 +
            latitude4 * (0.003971 * latitude2 - 0.001529 * latitude4))),
    y:
      latitude *
      (1.007226 +
        latitude2 *
          (0.015085 +
            latitude4 *
              (-0.044475 + 0.028874 * latitude2 - 0.005916 * latitude4))),
  };
}

const ROBINSON_COEFFICIENTS = [
  [0.9986, -0.062],
  [1, 0],
  [0.9986, 0.062],
  [0.9954, 0.124],
  [0.99, 0.186],
  [0.9822, 0.248],
  [0.973, 0.31],
  [0.96, 0.372],
  [0.9427, 0.434],
  [0.9216, 0.4958],
  [0.8962, 0.5571],
  [0.8679, 0.6176],
  [0.835, 0.6769],
  [0.7986, 0.7346],
  [0.7597, 0.7903],
  [0.7186, 0.8435],
  [0.6732, 0.8936],
  [0.6213, 0.9394],
  [0.5722, 0.9761],
  [0.5322, 1],
] as const;

const ROBINSON_Y_SCALE = 1.593415793900743;

function robinsonForward(longitude: number, latitude: number): ProjectedPoint {
  const interval = Math.min(18, (Math.abs(latitude) * 36) / Math.PI);
  const intervalIndex = Math.floor(interval);
  const fraction = interval - intervalIndex;
  const previous = ROBINSON_COEFFICIENTS[intervalIndex];
  const current = ROBINSON_COEFFICIENTS[intervalIndex + 1];
  const next = ROBINSON_COEFFICIENTS[Math.min(19, intervalIndex + 2)];
  const xScale =
    current[0] +
    (fraction * (next[0] - previous[0])) / 2 +
    (fraction * fraction * (next[0] - 2 * current[0] + previous[0])) / 2;
  const yScale =
    current[1] +
    (fraction * (next[1] - previous[1])) / 2 +
    (fraction * fraction * (next[1] - 2 * current[1] + previous[1])) / 2;

  return {
    x: longitude * xScale,
    y: Math.sign(latitude || 1) * yScale * ROBINSON_Y_SCALE,
  };
}

function webMercatorForward(
  longitude: number,
  latitude: number,
): ProjectedPoint | null {
  if (Math.abs(latitude) > WEB_MERCATOR_MAX_LATITUDE + 1e-10) return null;
  const clampedLatitude = Math.max(
    -WEB_MERCATOR_MAX_LATITUDE,
    Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude),
  );

  return {
    x: longitude,
    y: Math.asinh(Math.tan(clampedLatitude)),
  };
}

const naturalEarthNorth = naturalEarthForward(0, HALF_PI).y;
const naturalEarthEast = naturalEarthForward(Math.PI, 0).x;

const PROJECTIONS: Record<SourceProjection, ProjectionDefinition> = {
  equirectangular: {
    label: 'Equirectangular',
    hint: 'The whole image spans 360° × 180°. A 2:1 image gives equal pixels per degree.',
    bounds: { minX: -Math.PI, maxX: Math.PI, minY: -HALF_PI, maxY: HALF_PI },
    forward: (longitude, latitude) => ({ x: longitude, y: latitude }),
    trimUniformBackground: false,
  },
  'natural-earth': {
    label: 'Natural Earth',
    hint: 'Fits the rounded world footprint and ignores a uniform background around it.',
    bounds: {
      minX: -naturalEarthEast,
      maxX: naturalEarthEast,
      minY: -naturalEarthNorth,
      maxY: naturalEarthNorth,
    },
    forward: naturalEarthForward,
    trimUniformBackground: true,
  },
  robinson: {
    label: 'Robinson',
    hint: 'Fits a complete Robinson world map centered on the Greenwich meridian.',
    bounds: {
      minX: -Math.PI,
      maxX: Math.PI,
      minY: -ROBINSON_Y_SCALE,
      maxY: ROBINSON_Y_SCALE,
    },
    forward: robinsonForward,
    trimUniformBackground: true,
  },
  'web-mercator': {
    label: 'Web Mercator',
    hint: 'Uses the usual square world extent. The missing polar caps remain transparent.',
    bounds: { minX: -Math.PI, maxX: Math.PI, minY: -Math.PI, maxY: Math.PI },
    forward: webMercatorForward,
    trimUniformBackground: false,
  },
};

export const SOURCE_PROJECTION_OPTIONS = (
  Object.keys(PROJECTIONS) as SourceProjection[]
).map((value) => ({ value, label: PROJECTIONS[value].label }));

export function sourceProjectionLabel(projection: SourceProjection) {
  return PROJECTIONS[projection].label;
}

export function sourceProjectionHint(projection: SourceProjection) {
  return PROJECTIONS[projection].hint;
}

function fullImageBounds(width: number, height: number): PixelBounds {
  return { left: 0, top: 0, width, height };
}

function colorDistance(first: readonly number[], second: readonly number[]) {
  const red = first[0] - second[0];
  const green = first[1] - second[1];
  const blue = first[2] - second[2];
  const alpha = (first[3] - second[3]) * 1.5;
  return Math.hypot(red, green, blue, alpha);
}

function averageCornerColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  cornerX: number,
  cornerY: number,
  sampleSize: number,
) {
  const sums = [0, 0, 0, 0];
  let count = 0;

  for (let offsetY = 0; offsetY < sampleSize; offsetY += 1) {
    for (let offsetX = 0; offsetX < sampleSize; offsetX += 1) {
      const x = cornerX === 0 ? offsetX : width - 1 - offsetX;
      const y = cornerY === 0 ? offsetY : height - 1 - offsetY;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1)
        sums[channel] += pixels[index + channel];
      count += 1;
    }
  }

  return sums.map((sum) => sum / count);
}

export function detectSourceContentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  projection: SourceProjection,
): PixelBounds {
  const fullBounds = fullImageBounds(width, height);
  const definition = PROJECTIONS[projection];
  if (!definition.trimUniformBackground || width < 8 || height < 8)
    return fullBounds;

  const sampleSize = Math.max(
    2,
    Math.min(8, Math.floor(Math.min(width, height) / 80)),
  );
  const corners = [
    averageCornerColor(pixels, width, height, 0, 0, sampleSize),
    averageCornerColor(pixels, width, height, 1, 0, sampleSize),
    averageCornerColor(pixels, width, height, 0, 1, sampleSize),
    averageCornerColor(pixels, width, height, 1, 1, sampleSize),
  ];
  const background = [0, 1, 2, 3].map(
    (channel) =>
      corners.reduce((sum, color) => sum + color[channel], 0) / corners.length,
  );
  const cornerSpread = Math.max(
    ...corners.map((color) => colorDistance(color, background)),
  );
  if (cornerSpread > 32) return fullBounds;

  const threshold = Math.max(22, cornerSpread * 3);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const color = [
        pixels[index],
        pixels[index + 1],
        pixels[index + 2],
        pixels[index + 3],
      ];
      if (colorDistance(color, background) <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return fullBounds;
  const detected = {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const projectedAspect =
    (definition.bounds.maxX - definition.bounds.minX) /
    (definition.bounds.maxY - definition.bounds.minY);
  const detectedAspect = detected.width / detected.height;
  const aspectDifference = Math.abs(detectedAspect / projectedAspect - 1);

  if (
    detected.width < width * 0.6 ||
    detected.height < height * 0.6 ||
    aspectDifference > 0.12
  ) {
    return fullBounds;
  }

  return detected;
}

function projectedToPixel(
  projected: ProjectedPoint,
  projectedBounds: ProjectedBounds,
  contentBounds: PixelBounds,
): PixelPoint {
  const projectedWidth = projectedBounds.maxX - projectedBounds.minX;
  const projectedHeight = projectedBounds.maxY - projectedBounds.minY;
  const availableWidth = Math.max(1, contentBounds.width - 1);
  const availableHeight = Math.max(1, contentBounds.height - 1);
  const scale = Math.min(
    availableWidth / projectedWidth,
    availableHeight / projectedHeight,
  );
  const fittedWidth = projectedWidth * scale;
  const fittedHeight = projectedHeight * scale;
  const offsetX = contentBounds.left + (availableWidth - fittedWidth) / 2;
  const offsetY = contentBounds.top + (availableHeight - fittedHeight) / 2;

  return {
    x: offsetX + (projected.x - projectedBounds.minX) * scale,
    y: offsetY + (projectedBounds.maxY - projected.y) * scale,
  };
}

export function sourceProjectionToPixel(
  longitude: number,
  latitude: number,
  width: number,
  height: number,
  projection: SourceProjection,
  contentBounds = fullImageBounds(width, height),
): PixelPoint | null {
  if (projection === 'equirectangular') {
    return geoToPixel(longitude, latitude, width, height);
  }

  const definition = PROJECTIONS[projection];
  let normalizedLongitude = normalizeLongitude(longitude);
  let clampedLatitude = Math.max(-90, Math.min(90, latitude));
  if (projection === 'natural-earth' || projection === 'robinson') {
    // Rounded world maps commonly draw a dark outline on their geographic edge.
    // Sample a few source pixels inside that outline so it does not become a seam.
    const longitudeInset = Math.min(2, 1080 / Math.max(1, contentBounds.width));
    const latitudeInset = Math.min(2, 540 / Math.max(1, contentBounds.height));
    normalizedLongitude = Math.max(
      -180 + longitudeInset,
      Math.min(180 - longitudeInset, normalizedLongitude),
    );
    clampedLatitude = Math.max(
      -90 + latitudeInset,
      Math.min(90 - latitudeInset, clampedLatitude),
    );
  }
  const projected = definition.forward(
    degreesToRadians(normalizedLongitude),
    degreesToRadians(clampedLatitude),
  );
  if (!projected) return null;
  return projectedToPixel(projected, definition.bounds, contentBounds);
}

export const sourceProjectionLimits = {
  webMercatorMaximumLatitude: (WEB_MERCATOR_MAX_LATITUDE * 180) / Math.PI,
};
