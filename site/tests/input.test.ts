import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectImage, validateDimensions, validateFile } from '../src/globe/input';
function png(width: number, height: number, animated = false) {
  const bytes = new Uint8Array(animated ? 65 : 45); const view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(8, 13); bytes.set(Buffer.from('IHDR'), 12); view.setUint32(16, width); view.setUint32(20, height);
  let end = 33;
  if (animated) { view.setUint32(33, 8); bytes.set(Buffer.from('acTL'), 37); end += 20; }
  bytes.set(Buffer.from('IEND'), end + 4); return bytes;
}
test('PNG headers expose dimensions before decode, animation and SVG are rejected (#9)', () => {
  assert.deepEqual(inspectImage(png(4096, 2048)), { mime: 'image/png', width: 4096, height: 2048 });
  assert.throws(() => inspectImage(png(16, 8, true)), /Animated/);
  assert.throws(() => inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), /SVG/);
  assert.throws(() => inspectImage(png(1, 1).slice(0, 30)));
});
test('source and logo allocation limits are enforced (#9)', () => {
  validateDimensions(4096, 2048, 'map'); validateDimensions(1024, 1024, 'logo');
  for (const [width, height] of [[0, 5], [8193, 1], [4096, 4096], [NaN, 20]]) assert.throws(() => validateDimensions(width, height, 'map'));
  assert.throws(() => validateDimensions(2000, 2000, 'logo'));
});
test('declared MIME/content mismatch, empty files, and encoded over-budget dimensions fail (#9)', async () => {
  await assert.rejects(validateFile(new File([png(16, 8)], 'wrong.jpg', { type: 'image/jpeg' }), 'map'), /does not match/);
  await assert.rejects(validateFile(new File([], 'empty.png', { type: 'image/png' }), 'map'), /nonempty/);
  await assert.rejects(validateFile(new File([png(16000, 16000)], 'large.png', { type: 'image/png' }), 'map'), /too large/);
  assert.equal((await validateFile(new File([png(16, 8)], 'no-mime.png'), 'map')).mime, 'image/png');
});
test('WebP lossless dimensions and animation flag are checked (#9)', () => {
  const bytes = new Uint8Array(26); const view = new DataView(bytes.buffer);
  bytes.set(Buffer.from('RIFF')); view.setUint32(4, 18, true); bytes.set(Buffer.from('WEBPVP8L'), 8); view.setUint32(16, 5, true); bytes[20] = 0x2f;
  view.setUint32(21, (31 << 14) | 63, true);
  assert.deepEqual(inspectImage(bytes), { mime: 'image/webp', width: 64, height: 32 });
  const animated = new Uint8Array(30); const av = new DataView(animated.buffer);
  animated.set(Buffer.from('RIFF')); av.setUint32(4, 22, true); animated.set(Buffer.from('WEBPVP8X'), 8); av.setUint32(16, 10, true); animated[20] = 2;
  assert.throws(() => inspectImage(animated), /Animated/);
});
