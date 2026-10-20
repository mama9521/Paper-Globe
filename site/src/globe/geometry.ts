import { cassiniForward } from './cassini';

export type Hemisphere = 'north' | 'south';
export type GoreCount = 4 | 6 | 8 | 12;
export type TemplatePoint = { x: number; y: number };
export const RADIUS_FRACTION = 0.405;
export const GLUE_TAB_OPTIONS = [
  { value: 'trapezoid', label: 'Trapezoid', hint: 'Tapered sides with a broad gluing edge.' },
  { value: 'rounded', label: 'Rounded', hint: 'A curved edge with no sharp corners.' },
  { value: 'rectangle', label: 'Rectangle', hint: 'Straight cuts and the largest gluing area.' },
  { value: 'triangle', label: 'Triangle', hint: 'Two angled cuts with a smaller gluing area.' },
] as const;
export type GlueTabShape = typeof GLUE_TAB_OPTIONS[number]['value'];
export function isGlueTabShape(value: unknown): value is GlueTabShape {
  return GLUE_TAB_OPTIONS.some((option) => option.value === value);
}

export function assertGoreCount(value: number): asserts value is GoreCount {
  if (![4, 6, 8, 12].includes(value)) throw new Error('Choose 4, 6, 8, or 12 gores.');
}
export function centralMeridians(goreCount: number) {
  assertGoreCount(goreCount);
  return Array.from({ length: goreCount }, (_, index) => -180 + (index * 360) / goreCount);
}
export function hemisphereLayoutDirection(hemisphere: Hemisphere) {
  return hemisphere === 'north' ? -1 : 1;
}
export function goreRotationDegrees(goreCount: number, hemisphere: Hemisphere, index: number) {
  return 180 + (hemisphereLayoutDirection(hemisphere) * index * 360) / goreCount;
}
export function lobeOutline(goreCount: number, hemisphere: Hemisphere, radius: number, samples = 72): TemplatePoint[] {
  assertGoreCount(goreCount);
  const sign = hemisphere === 'north' ? 1 : -1;
  const halfWidth = 180 / goreCount;
  const points: TemplatePoint[] = [{ x: 0, y: 0 }];
  for (const side of [-1, 1]) {
    for (let step = 1; step <= samples; step += 1) {
      const index = side === -1 ? step : samples + 1 - step;
      const projected = cassiniForward(side * halfWidth, sign * (90 - (index / samples) * 90), 0);
      points.push({ x: (projected.x / (Math.PI / 2)) * radius, y: (1 - Math.abs(projected.y) / (Math.PI / 2)) * radius });
    }
  }
  return points;
}
/** Every shape starts with its attachment base: [left base, right base, ...outer edge from right to left]. */
export function glueTabOutline(goreCount: number, radius: number, shape: GlueTabShape = 'trapezoid'): TemplatePoint[] {
  assertGoreCount(goreCount);
  const half = (radius * 2) / goreCount;
  const base = half * 0.6;
  const outer = base * 0.78;
  const height = Math.min(radius * 0.14, half * 0.55);
  const attachment = [{ x: -base, y: radius }, { x: base, y: radius }];
  if (shape === 'triangle') return [...attachment, { x: 0, y: radius + height }];
  if (shape === 'rectangle') return [...attachment, { x: base, y: radius + height }, { x: -base, y: radius + height }];
  if (shape === 'rounded') {
    return [...attachment, ...Array.from({ length: 23 }, (_, index) => {
      const angle = ((index + 1) / 24) * Math.PI;
      return { x: base * Math.cos(angle), y: radius + height * Math.sin(angle) };
    })];
  }
  return [...attachment, { x: outer, y: radius + height }, { x: -outer, y: radius + height }];
}
/** The cut boundary goes AROUND the tab, never across its attachment edge. */
export function cutOutline(goreCount: number, hemisphere: Hemisphere, radius: number, tabs: boolean, shape: GlueTabShape = 'trapezoid'): TemplatePoint[] {
  const points = lobeOutline(goreCount, hemisphere, radius);
  if (!tabs) return points;
  const edge = points.findIndex((point) => point.x < 0 && Math.abs(point.y - radius) < 1e-8);
  const tab = glueTabOutline(goreCount, radius, shape);
  return [...points.slice(0, edge + 1), tab[0], ...tab.slice(1).reverse(), ...points.slice(edge + 1)];
}
export function pointsToSvgPath(points: TemplatePoint[], close = true) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(5)} ${point.y.toFixed(5)}`).join(' ') + (close ? ' Z' : '');
}
