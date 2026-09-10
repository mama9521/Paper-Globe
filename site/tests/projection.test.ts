import assert from 'node:assert/strict';

import { cassiniForward, cassiniInverse } from '../src/globe/cassini';
import { angularDistance, geoToPixel, pixelToGeo } from '../src/globe/coordinates';

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

console.log('Projection round-trips passed.');
