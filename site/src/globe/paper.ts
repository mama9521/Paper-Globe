import { RADIUS_FRACTION } from './geometry';

export const PAPER = {
  letter: { widthMm: 215.9, heightMm: 279.4, label: 'US Letter' },
  a4: { widthMm: 210, heightMm: 297, label: 'A4' },
  tabloid: { widthMm: 279.4, heightMm: 431.8, label: 'Tabloid' },
} as const;
export type PaperSize = keyof typeof PAPER;
export const PREVIEW_SIZE = 720;
export const EXPORT_DPI = 200;
export const MAX_OUTPUT_PIXELS = 6_000_000;
export const MARGIN_MM = 12;
const HEADER_MM = 20;
const FOOTER_MM = 48;

export function maximumDiameter(paperSize: PaperSize) {
  const paper = PAPER[paperSize];
  const side = Math.min(paper.widthMm - 2 * MARGIN_MM, paper.heightMm - 2 * MARGIN_MM - HEADER_MM - FOOTER_MM);
  return (side * RADIUS_FRACTION * 4) / Math.PI / 25.4;
}
/** Cassini's central-meridian pole-to-equator distance is pi*D/4. */
export function paperLayout(diameterIn: number, paperSize: PaperSize) {
  if (!Number.isFinite(diameterIn) || diameterIn < 2 || diameterIn > 8) throw new Error('Diameter must be between 2 and 8 inches.');
  const paper = PAPER[paperSize];
  if (!paper) throw new Error('Choose Letter, A4, or Tabloid paper.');
  const maximum = maximumDiameter(paperSize);
  if (diameterIn > maximum + 1e-9) throw new Error(`${diameterIn}" will not fit ${paper.label} at actual size. Maximum: ${maximum.toFixed(2)}". Reduce the diameter or choose larger paper.`);
  const radiusMm = (Math.PI * diameterIn * 25.4) / 4;
  const artMm = radiusMm / RADIUS_FRACTION;
  const availableHeight = paper.heightMm - 2 * MARGIN_MM - HEADER_MM - FOOTER_MM;
  return {
    ...paper, radiusMm, artMm, diameterIn, paperSize,
    x: (paper.widthMm - artMm) / 2,
    y: MARGIN_MM + HEADER_MM + (availableHeight - artMm) / 2,
  };
}
export function exportSize(diameterIn: number, paperSize: PaperSize, dpi = EXPORT_DPI) {
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 300) throw new Error('Output resolution must be between 72 and 300 DPI.');
  const size = Math.ceil((paperLayout(diameterIn, paperSize).artMm / 25.4) * dpi);
  if (size * size > MAX_OUTPUT_PIXELS) throw new Error('Output exceeds the browser memory budget. Reduce diameter or resolution.');
  return size;
}
