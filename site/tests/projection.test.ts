import assert from 'node:assert/strict';

import { cassiniForward, cassiniInverse } from '../src/globe/cassini';
import { angularDistance, geoToPixel, pixelToGeo } from '../src/globe/coordinates';
import { glueTabOutline } from '../src/globe/gore';
import {
  detectSourceContentBounds,
  sourceProjectionLimits,
  sourceProjectionToPixel,
} from '../src/globe/source-projection';

const closeTo = (actual: number, expected: number, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should be close to ${expected}`);
};

for (const [x, y] of [[0, 0], [4096, 2048], [8192, 4096]] as const) {
  const geo = pixelToGeo(x, y, 8192, 4096);
  const pixel = geoToPixel(geo.longitude, geo.latitude, 8192, 4096);
  closeTo(pixel.x % 8192, x % 8192);
  closeTo(pixel.y, y);
}

for (const centralMeridian of [-180, -120, -60, 0, 60, 120]) {
  for (const latitude of [-80, -45, 0, 45, 80]) {
    for (const offset of [-29.5, 0, 29.5]) {
      const longitude = centralMeridian + offset;
      const projected = cassiniForward(longitude, latitude, centralMeridian);
      const restored = cassiniInverse(projected.x, projected.y, centralMeridian);
      closeTo(angularDistance(restored.longitude, longitude), 0, 1e-8);
      closeTo(restored.latitude, latitude, 1e-8);
    }
  }
}

for (const goreCount of [4, 6, 8, 12]) {
  const tab = glueTabOutline(goreCount, 170);
  assert.equal(tab.length, 4);
  closeTo(tab[0].x, -tab[1].x);
  closeTo(tab[2].x, -tab[3].x);
  closeTo(tab[0].y, tab[1].y);
  closeTo(tab[2].y, tab[3].y);
  assert.ok(tab[2].y > tab[0].y, 'tab should extend beyond the gore edge');
  assert.ok(Math.abs(tab[2].x) < Math.abs(tab[1].x), 'tab should taper evenly');
}

const arbitraryEquirectangularCenter = sourceProjectionToPixel(
  0,
  0,
  600,
  600,
  'equirectangular',
);
assert.ok(arbitraryEquirectangularCenter);
closeTo(arbitraryEquirectangularCenter.x, 300);
closeTo(arbitraryEquirectangularCenter.y, 300);

for (const projection of ['natural-earth', 'robinson', 'web-mercator'] as const) {
  const center = sourceProjectionToPixel(0, 0, 1000, 500, projection);
  assert.ok(center);
  closeTo(center.x, 499.5);
  closeTo(center.y, 249.5);
}

const naturalEarthWest = sourceProjectionToPixel(-180, 0, 1000, 500, 'natural-earth');
const naturalEarthEast = sourceProjectionToPixel(179.999, 0, 1000, 500, 'natural-earth');
assert.ok(naturalEarthWest && naturalEarthEast);
assert.ok(naturalEarthWest.x > 0, 'Natural Earth should preserve horizontal corner padding');
assert.ok(naturalEarthEast.x < 999, 'Natural Earth should preserve horizontal corner padding');
assert.ok(naturalEarthWest.x < 40);
assert.ok(naturalEarthEast.x > 959);

const mercatorTop = sourceProjectionToPixel(
  0,
  sourceProjectionLimits.webMercatorMaximumLatitude,
  500,
  500,
  'web-mercator',
);
assert.ok(mercatorTop);
closeTo(mercatorTop.y, 0, 1e-7);
assert.equal(sourceProjectionToPixel(0, 89, 500, 500, 'web-mercator'), null);

const syntheticWidth = 100;
const syntheticHeight = 50;
const syntheticPixels = new Uint8ClampedArray(syntheticWidth * syntheticHeight * 4);
for (let y = 0; y < syntheticHeight; y += 1) {
  for (let x = 0; x < syntheticWidth; x += 1) {
    const index = (y * syntheticWidth + x) * 4;
    syntheticPixels[index + 3] = 255;
    if (x >= 5 && x <= 94 && y >= 1 && y <= 48) {
      syntheticPixels[index] = 20;
      syntheticPixels[index + 1] = 100;
      syntheticPixels[index + 2] = 180;
    }
  }
}
const detectedBounds = detectSourceContentBounds(
  syntheticPixels,
  syntheticWidth,
  syntheticHeight,
  'natural-earth',
);
assert.deepEqual(detectedBounds, { left: 5, top: 1, width: 90, height: 48 });

console.log('Projection and glue-tab geometry tests passed.');
