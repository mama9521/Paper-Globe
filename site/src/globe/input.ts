import { abortError, throwIfAborted } from './lifecycle';
import { MAX_SOURCE_PIXELS, type PixelImage } from './raster';

export type InputKind = 'map' | 'logo';
export const INPUT_LIMITS = {
  map: { bytes: 20 * 1024 * 1024, pixels: MAX_SOURCE_PIXELS, dimension: 8192 },
  logo: { bytes: 5 * 1024 * 1024, pixels: 1_048_576, dimension: 2048 },
} as const;
export type MapResource = PixelImage & { id: number; objectUrl: string; name: string };
export type LogoResource = { dataUrl: string; name: string };
let sourceId = 0;
const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
const malformed = () => new Error('Malformed or unsupported image. Re-export a still PNG, JPEG, or WebP.');

/** Inspect encoded dimensions BEFORE asking the browser to allocate decoded pixels. */
export function inspectImage(bytes: Uint8Array): { mime: string; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const be = (offset: number) => view.getUint32(offset, false);
  const le = (offset: number) => view.getUint32(offset, true);
  if (bytes.length >= 33 && bytes[0] === 137 && ascii(bytes, 1, 7) === 'PNG\r\n\u001a\n') {
    if (be(8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') throw malformed();
    let ended = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = be(offset); const type = ascii(bytes, offset + 4, 4);
      if (offset + length + 12 > bytes.length) throw malformed();
      if (type === 'acTL') throw new Error('Animated PNG is not supported. Export a single still frame.');
      if (type === 'IEND') { ended = true; break; }
      offset += length + 12;
    }
    if (!ended) throw malformed();
    return { mime: 'image/png', width: be(16), height: be(20) };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const end = le(4) + 8;
    if (end > bytes.length) throw malformed();
    let dimensions: { width: number; height: number } | undefined;
    let frame = false;
    for (let offset = 12; offset + 8 <= end;) {
      const type = ascii(bytes, offset, 4); const length = le(offset + 4); const start = offset + 8;
      if (start + length > end) throw malformed();
      if (type === 'ANIM' || type === 'ANMF') throw new Error('Animated WebP is not supported. Export a single still frame.');
      if (type === 'VP8X') {
        if (length < 10) throw malformed();
        if (bytes[start] & 2) throw new Error('Animated WebP is not supported.');
        const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
        dimensions = { width: u24(start + 4) + 1, height: u24(start + 7) + 1 };
      } else if (type === 'VP8 ') {
        if (length < 10 || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) throw malformed();
        const decoded = { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff };
        dimensions ??= decoded; frame = true;
      } else if (type === 'VP8L') {
        if (length < 5 || bytes[start] !== 0x2f) throw malformed();
        const packed = le(start + 1);
        dimensions ??= { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 }; frame = true;
      }
      offset = start + length + (length % 2);
    }
    if (!dimensions || !frame) throw malformed();
    return { mime: 'image/webp', ...dimensions };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset++] !== 0xff) throw malformed();
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) throw malformed();
      const length = view.getUint16(offset, false);
      if (length < 2 || offset + length > bytes.length) throw malformed();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) throw malformed();
        return { mime: 'image/jpeg', width: view.getUint16(offset + 5, false), height: view.getUint16(offset + 3, false) };
      }
      offset += length;
    }
  }
  throw new Error('Choose a still PNG, JPEG, or WebP. SVG logos are not supported.');
}
export function validateDimensions(width: number, height: number, kind: InputKind) {
  const limits = INPUT_LIMITS[kind];
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > limits.dimension || height > limits.dimension || width * height > limits.pixels) throw new Error(`${kind === 'map' ? 'Map' : 'Logo'} is too large or has invalid dimensions. Limit: ${limits.dimension}px per side and ${(limits.pixels / 1_048_576).toFixed(0)} megapixels. Resize it and try again.`);
}
export async function validateFile(file: File, kind: InputKind, signal?: AbortSignal) {
  throwIfAborted(signal);
  if (!file.size || file.size > INPUT_LIMITS[kind].bytes) throw new Error(`Choose a nonempty ${kind} smaller than ${INPUT_LIMITS[kind].bytes / 1024 / 1024} MiB.`);
  const info = inspectImage(new Uint8Array(await file.arrayBuffer()));
  throwIfAborted(signal);
  if (file.type && file.type !== info.mime) throw new Error('The declared file type does not match its image content. Re-export it as PNG, JPEG, or WebP.');
  validateDimensions(info.width, info.height, kind);
  return info;
}
async function decodedCanvas(file: File, kind: InputKind, signal?: AbortSignal) {
  const info = await validateFile(file, kind, signal);
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        image.onload = null; image.onerror = null;
        if (error) reject(error); else resolve();
      };
      const abort = () => { image.src = ''; finish(abortError()); };
      const timer = setTimeout(() => finish(new Error('Image decoding timed out. Resize or re-export the image.')), 15_000);
      image.onload = () => finish();
      image.onerror = () => finish(new Error('That image could not be decoded. Re-export it as PNG, JPEG, or WebP.'));
      signal?.addEventListener('abort', abort, { once: true });
      image.src = url;
      if (signal?.aborted) abort();
    });
    throwIfAborted(signal);
    const width = image.naturalWidth; const height = image.naturalHeight;
    validateDimensions(width, height, kind);
    // Orientation metadata may swap dimensions; no arbitrary unexpected allocation is accepted.
    if (!((width === info.width && height === info.height) || (width === info.height && height === info.width))) throw malformed();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    context.drawImage(image, 0, 0);
    return { canvas, context, url };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
  finally { image.src = ''; }
}
export async function loadMap(file: File, signal?: AbortSignal): Promise<MapResource> {
  const { canvas, context, url } = await decodedCanvas(file, 'map', signal);
  try {
    throwIfAborted(signal);
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    return { id: ++sourceId, width, height, pixels, objectUrl: url, name: file.name };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
  finally { canvas.width = 0; canvas.height = 0; }
}
export async function loadLogo(file: File, signal?: AbortSignal): Promise<LogoResource> {
  const { canvas, url } = await decodedCanvas(file, 'logo', signal);
  try { throwIfAborted(signal); return { dataUrl: canvas.toDataURL('image/png'), name: file.name }; }
  finally { URL.revokeObjectURL(url); canvas.width = 0; canvas.height = 0; }
}
