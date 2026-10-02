import assert from 'node:assert/strict';
import test from 'node:test';
import { cassiniForward, cassiniInverse } from '../src/globe/cassini';
import { angularDistance, geoToPixel, pixelToGeo } from '../src/globe/coordinates';
import { centralMeridians, cutOutline, glueTabOutline, goreRotationDegrees, type Hemisphere } from '../src/globe/geometry';
import { createTemplateSvg, escapeXml, exportFilename, wrapText, type SvgOptions } from '../src/globe/export';
import { exportSize, maximumDiameter, paperLayout, PAPER, type PaperSize } from '../src/globe/paper';
import { detectSourceContentBounds, sourceProjectionLimits, sourceProjectionToPixel } from '../src/globe/source-projection';

const close = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
const options: SvgOptions = { diameter: 3, paperSize: 'letter', goreCount: 6, hemisphere: 'north', cutLines: true, dashedCutLines: false, foldLines: true, tabs: true };

void test('geographic boundaries round trip, including longitude wrap', () => {
  for (const [x, y] of [[0, 0], [4096, 2048], [8192, 4096]]) {
    const geo = pixelToGeo(x, y, 8192, 4096); const point = geoToPixel(geo.longitude, geo.latitude, 8192, 4096);
    close(point.x % 8192, x % 8192); close(point.y, y);
  }
});
void test('Cassini round trips every supported gore width and both hemispheres', () => {
  for (const count of [4, 6, 8, 12]) for (const center of centralMeridians(count)) for (const latitude of [-89, -80, -45, -1, 0, 1, 45, 80, 89]) for (const offset of [-0.99, -0.5, 0, 0.5, 0.99]) {
    const lon = center + offset * 180 / count; const projected = cassiniForward(lon, latitude, center); const restored = cassiniInverse(projected.x, projected.y, center);
    close(angularDistance(restored.longitude, lon), 0); close(restored.latitude, latitude);
  }
});
void test('hemispheres retain opposite winding', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => goreRotationDegrees(6, 'north', i)), [180, 120, 60, 0, -60, -120]);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => goreRotationDegrees(6, 'south', i)), [180, 240, 300, 360, 420, 480]);
});
void test('tab attachments are not part of the cut path for all counts and hemispheres (#2)', () => {
  for (const count of [4, 6, 8, 12]) for (const hemisphere of ['north', 'south'] as Hemisphere[]) {
    const tab = glueTabOutline(count, 100); const outline = cutOutline(count, hemisphere, 100, true);
    close(tab[0].x, -tab[1].x); assert.ok(tab[2].y > 100);
    for (let index = 0; index < outline.length; index += 1) {
      const a = outline[index]; const b = outline[(index + 1) % outline.length];
      const crossesAttachment = Math.abs(a.y - 100) < 1e-8 && Math.abs(b.y - 100) < 1e-8 && Math.min(a.x, b.x) < tab[1].x && Math.max(a.x, b.x) > tab[0].x;
      assert.equal(crossesAttachment, false);
    }
    const svg = createTemplateSvg({ ...options, goreCount: count, hemisphere, cutLines: false });
    assert.doesNotMatch(svg, /data-layer="cut"/); assert.match(svg, /data-layer="tab-fold"/);
    assert.doesNotMatch(createTemplateSvg({ ...options, goreCount: count, hemisphere, foldLines: false }), /data-layer="(?:fold|tab-fold)"/);
  }
});
void test('diameter drives physical lengths, pages stay exact, and oversize is rejected (#1)', () => {
  for (const size of Object.keys(PAPER) as PaperSize[]) {
    const small = paperLayout(2, size); const large = paperLayout(3, size);
    close(large.radiusMm / small.radiusMm, 1.5); close(large.artMm / small.artMm, 1.5);
    close(small.radiusMm, Math.PI * 2 * 25.4 / 4);
    assert.equal(small.widthMm, large.widthMm);
    assert.throws(() => paperLayout(8, size), /will not fit/);
    paperLayout(maximumDiameter(size), size);
    for (const count of [4, 6, 8, 12]) for (const hemisphere of ['north', 'south'] as Hemisphere[]) {
      const svg = createTemplateSvg({ ...options, diameter: 2, paperSize: size, goreCount: count, hemisphere });
      assert.match(svg, new RegExp(`width="${PAPER[size].widthMm}mm"`)); assert.match(svg, /h 25\.4/);
      assert.notEqual(svg, createTemplateSvg({ ...options, diameter: 3, paperSize: size, goreCount: count, hemisphere }));
    }
  }
  for (const value of [NaN, Infinity, 0, -3]) assert.throws(() => paperLayout(value, 'letter'));
  close(paperLayout(4, 'tabloid').radiusMm / paperLayout(2, 'tabloid').radiusMm, 2);
});
void test('print resolution is independent from the 720-pixel preview and bounded (#10)', () => {
  assert.ok(exportSize(3.5, 'letter') > 720);
  assert.ok(exportSize(5, 'tabloid') ** 2 < 6_000_000);
  assert.throws(() => exportSize(5, 'tabloid', 300), /memory budget/);
});
void test('logos share scene layering and cannot embed SVG or external resources (#7, #9)', () => {
  const logo = { dataUrl: 'data:image/png;base64,AA==', scale: 0.5, position: 'north-pole' as const };
  const svg = createTemplateSvg({ ...options, logo });
  assert.match(svg, /data-layer="logo"/); assert.doesNotMatch(svg, /<circle/);
  assert.doesNotMatch(createTemplateSvg({ ...options, hemisphere: 'south', logo }), /data-layer="logo"/);
  assert.throws(() => createTemplateSvg({ ...options, logo: { ...logo, dataUrl: 'data:image/svg+xml;base64,AA==' } }), /PNG/);
  assert.throws(() => createTemplateSvg({ ...options, raster: 'https://example.invalid/map.png' }), /PNG/);
});
void test('annotations are escaped and bounded, sheet numbers and filenames identify output (#12)', () => {
  const svg = createTemplateSvg({ ...options, hemisphere: 'south', annotations: { description: '<script>&"\'\nWorld', legend: 'x'.repeat(180) } });
  assert.match(svg, /&lt;script&gt;&amp;&quot;&apos;/); assert.doesNotMatch(svg, /<script>/); assert.match(svg, /Sheet 2 of 2/);
  assert.equal(escapeXml('<&'), '&lt;&amp;'); assert.ok(wrapText('x'.repeat(240), 60).every((line) => line.length <= 40));
  assert.equal(exportFilename(options), 'paper-globe-north-6-gores-3in-letter.svg');
});
void test('source projection extents and content bounds preserve prototype behavior', () => {
  for (const projection of ['natural-earth', 'robinson', 'web-mercator'] as const) {
    const center = sourceProjectionToPixel(0, 0, 1000, 500, projection)!; close(center.x, 499.5); close(center.y, 249.5);
  }
  const top = sourceProjectionToPixel(0, sourceProjectionLimits.webMercatorMaximumLatitude, 500, 500, 'web-mercator')!;
  close(top.y, 0); assert.equal(sourceProjectionToPixel(0, 89, 500, 500, 'web-mercator'), null);
  const pixels = new Uint8ClampedArray(100 * 50 * 4);
  for (let y = 0; y < 50; y += 1) for (let x = 0; x < 100; x += 1) {
    const i = (y * 100 + x) * 4; pixels[i + 3] = 255;
    if (x >= 5 && x <= 94 && y >= 1 && y <= 48) pixels.set([20, 100, 180, 255], i);
  }
  assert.deepEqual(detectSourceContentBounds(pixels, 100, 50, 'natural-earth'), { left: 5, top: 1, width: 90, height: 48 });
});
