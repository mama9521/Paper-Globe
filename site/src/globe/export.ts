import { centralMeridians, cutOutline, glueTabOutline, goreRotationDegrees, isGlueTabShape, pointsToSvgPath, type GlueTabShape, type Hemisphere } from './geometry';
import { MARGIN_MM, PAPER, paperLayout, type PaperSize } from './paper';
import { abortError, throwIfAborted } from './lifecycle';
import { templateExportName } from './export-name';
import type { PixelImage } from './raster';

export const GLUE_TAB_FILL = '#c5c7c6';
export const DEFAULT_FOLD_COLOR = '#a12d44';

export type TemplateMarks = { cutLines: boolean; dashedCutLines: boolean; foldLines: boolean; foldColor?: string; tabs: boolean; tabShape?: GlueTabShape };
export type LogoSettings = { dataUrl: string; position: 'north-pole' | 'south-pole' | 'equator'; scale: number };
export type TemplateAnnotations = { description?: string; legend?: string };
export type SvgOptions = TemplateMarks & {
  raster?: string; goreCount: number; hemisphere: Hemisphere; diameter: number;
  paperSize: PaperSize; showPreviewNotes?: boolean; logo?: LogoSettings; annotations?: TemplateAnnotations;
};
export function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ?? character);
}
function png(value: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) throw new Error('Only locally rasterized PNG data may be embedded in a template.');
  return value;
}
export function wrapText(value: string, width: number, limit = 6) {
  const maximum = Math.max(8, Math.floor(width / 1.5));
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const original of paragraph.trim().split(/\s+/).filter(Boolean)) {
      let word = original;
      if (line && line.length + 1 + word.length > maximum) { lines.push(line); line = ''; }
      while (word.length > maximum) { lines.push(word.slice(0, maximum)); word = word.slice(maximum); }
      line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  if (lines.length > limit) return [...lines.slice(0, limit - 1), `${lines[limit - 1].slice(0, maximum - 1)}…`];
  return lines;
}
/** The one physical scene used by screen preview, downloaded SVG, and both print pages. */
export function createTemplateSvg(options: SvgOptions) {
  const { goreCount, hemisphere, diameter, paperSize, raster, logo, annotations, showPreviewNotes = false, ...marks } = options;
  const layout = paperLayout(diameter, paperSize);
  const { widthMm: width, heightMm: height, radiusMm: radius, artMm: art } = layout;
  if (hemisphere !== 'north' && hemisphere !== 'south') throw new Error('Invalid hemisphere.');
  if (logo && (!Number.isFinite(logo.scale) || logo.scale < 0.5 || logo.scale > 2 || !['north-pole', 'south-pole', 'equator'].includes(logo.position))) throw new Error('Invalid logo placement or scale.');
  if (marks.tabShape !== undefined && !isGlueTabShape(marks.tabShape)) throw new Error('Invalid glue-tab shape.');
  const center = art / 2;
  const outline = pointsToSvgPath(cutOutline(goreCount, hemisphere, radius, marks.tabs, marks.tabShape));
  const tab = glueTabOutline(goreCount, radius, marks.tabShape);
  const dash = marks.dashedCutLines ? ' stroke-dasharray="1.6 1.1"' : '';
  const foldColor = marks.foldColor && /^#[\da-f]{6}$/i.test(marks.foldColor) ? marks.foldColor : DEFAULT_FOLD_COLOR;
  const foldPath = (layer: string, path: string) => `<g data-layer="${layer}" fill="none" stroke-dasharray="1.4 1">
    <path d="${path}" stroke="#fffdf8" stroke-width="0.65"/>
    <path d="${path}" stroke="${foldColor}" stroke-width="0.32"/>
  </g>`;
  const overlay = centralMeridians(goreCount).map((_, index) => `<g transform="translate(${center} ${center}) rotate(${goreRotationDegrees(goreCount, hemisphere, index)})">
    ${marks.tabs ? `<path data-layer="tab-fill" d="${pointsToSvgPath(tab)}" fill="${GLUE_TAB_FILL}" stroke="none"/>` : ''}
    ${marks.cutLines ? `<path data-layer="cut" d="${outline}" fill="none" stroke="#173f3a" stroke-width="0.25"${dash}/>` : ''}
    ${marks.foldLines ? foldPath('fold', `M 0 0.6 L 0 ${radius - 0.6}`) : ''}
    ${marks.foldLines && marks.tabs ? foldPath('tab-fold', pointsToSvgPath(tab.slice(0, 2), false)) : ''}
  </g>`).join('');
  const visible = logo && (logo.position === 'equator' || logo.position === `${hemisphere}-pole`);
  const logoSize = logo ? art * 0.075 * logo.scale : 0;
  const logoY = logo?.position === 'equator' ? center + radius * 0.68 - logoSize / 2 : center - logoSize / 2;
  const items = [
    annotations?.description !== undefined ? { title: 'DESCRIPTION', value: annotations.description.slice(0, 240) } : null,
    annotations?.legend !== undefined ? { title: 'LEGEND', value: annotations.legend.slice(0, 180) } : null,
  ].filter((item): item is { title: string; value: string } => item !== null);
  const boxWidth = (width - 2 * MARGIN_MM - Math.max(0, items.length - 1) * 4) / Math.max(1, items.length);
  const notes = items.map((item, index) => {
    const x = MARGIN_MM + index * (boxWidth + 4); const y = height - MARGIN_MM - 44;
    return `<g><rect x="${x}" y="${y}" width="${boxWidth}" height="25" fill="#fffdf8" stroke="#d9d4c9" stroke-width="0.2"/>
      <text x="${x + 2}" y="${y + 4}" font-size="2.3" font-weight="bold">${item.title}</text>
      <text font-size="2.5">${wrapText(item.value, boxWidth - 4).map((line, i) => `<tspan x="${x + 2}" y="${y + 8 + i * 3}">${escapeXml(line)}</tspan>`).join('')}</text></g>`;
  }).join('');
  const name = hemisphere === 'north' ? 'Northern' : 'Southern';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" font-family="Arial, sans-serif" fill="#173f3a">
  <title>${name} hemisphere, ${goreCount} map pieces, ${diameter} inch diameter</title>
  <rect width="${width}" height="${height}" fill="#fffdf8"/>
  <text x="12" y="18" font-size="5" font-weight="bold">PAPER GLOBE</text>
  <text x="12" y="25" font-size="2.8">${name} hemisphere · Sheet ${hemisphere === 'north' ? 1 : 2} of 2 · ${goreCount} map pieces</text>
  <text x="${width - 12}" y="18" text-anchor="end" font-size="2.8">${layout.label}</text>
  <g data-layer="art" transform="translate(${layout.x} ${layout.y})">
    ${raster ? `<image data-layer="raster" href="${png(raster)}" width="${art}" height="${art}"/>` : ''}
    ${overlay}
    ${visible && logo.position !== 'equator' ? '' : `<circle cx="${center}" cy="${center}" r="2.8" fill="#fffaf0" stroke="#173f3a" stroke-width="0.2"/><text x="${center}" y="${center + 1}" text-anchor="middle" font-size="2.8">${hemisphere === 'north' ? 'N' : 'S'}</text>`}
    ${visible ? `<image data-layer="logo" href="${png(logo.dataUrl)}" x="${center - logoSize / 2}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>` : ''}
  </g>
  ${notes}
  ${showPreviewNotes ? `<g data-layer="preview-notes">
  <text x="12" y="${height - 26}" font-size="2.7">Target diameter: ${diameter} in · Print at 100% / actual size. Disable fit-to-page.</text>
  <path data-layer="scale-check" d="M 12 ${height - 20} v 3 m 0 -1.5 h 25.4 m 0 -1.5 v 3" fill="none" stroke="#173f3a" stroke-width="0.25"/>
  <text x="40" y="${height - 18}" font-size="2.5">Scale check: exactly 1 in / 25.4 mm</text>
  <text x="12" y="${height - 12}" font-size="2.4">Cut ${marks.cutLines ? (marks.dashedCutLines ? 'green dashed' : 'green solid') : 'marks hidden'} · Fold ${marks.foldLines ? 'along the dashed guides' : 'marks hidden'}</text>
  </g>` : ''}
</svg>`;
}
export function exportFilename(options: Pick<SvgOptions, 'hemisphere' | 'goreCount' | 'diameter' | 'paperSize'> & { sourceName?: string }) {
  return `${templateExportName(options.sourceName ?? '', options.goreCount, options.hemisphere)}-${options.diameter}in-${options.paperSize}.svg`;
}
export async function rasterDataUrl(image: PixelImage, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable.');
    const data = context.createImageData(image.width, image.height); data.data.set(image.pixels); context.putImageData(data, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode the rendered map.')), 'image/png'));
    throwIfAborted(signal);
    const result = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the rendered map.'));
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid rendered map.'));
      reader.readAsDataURL(blob);
    });
    throwIfAborted(signal); return result;
  } finally { canvas.width = 0; canvas.height = 0; }
}
export function downloadSvg(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  // Delayed revocation lets browsers start the download; never revoke in the click's stack.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function openPrintSession(paperSize: PaperSize, title = 'Paper Globe — Print') {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow pop-ups for Paper Globe, then choose Print PDF again.');
  // Finish the new document explicitly so print() is not deferred behind an
  // unfinished about:blank navigation or document load.
  popup.document.open();
  // oxlint-disable-next-line typescript/no-deprecated -- Only a fixed skeleton is written to this isolated, new print document.
  popup.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
  popup.document.close();
  // Browsers suggest the document title as the Save as PDF filename.
  popup.document.title = title;
  const paper = PAPER[paperSize];
  const style = popup.document.createElement('style');
  style.textContent = `body{margin:0;background:#ddd;font-family:Arial,sans-serif}.print-controls{padding:16px;text-align:center;background:white}.print-controls p{margin:0 0 12px}.print-controls button{padding:8px 16px;font:inherit}.sheet{width:${paper.widthMm}mm;height:${paper.heightMm}mm;margin:12px auto}.sheet img{display:block;width:100%;height:100%}@media print{@page{size:${paper.widthMm}mm ${paper.heightMm}mm;margin:0}body{background:white}.print-controls{display:none}.sheet{margin:0;break-after:page}.sheet:last-child{break-after:auto}}`;
  popup.document.head.append(style);
  const controls = popup.document.createElement('header'); controls.className = 'print-controls';
  const status = popup.document.createElement('p'); status.setAttribute('role', 'status');
  status.textContent = 'Preparing both templates locally… 0%';
  const button = popup.document.createElement('button'); button.type = 'button'; button.textContent = 'Print / Save as PDF'; button.disabled = true;
  controls.append(status, button);
  const sheets = popup.document.createElement('main');
  popup.document.body.append(controls, sheets);
  const urls: string[] = [];
  let interval: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    while (urls.length) URL.revokeObjectURL(urls.pop()!);
    if (interval !== undefined) { clearInterval(interval); interval = undefined; }
    window.removeEventListener('pagehide', cleanup);
    popup.removeEventListener('pagehide', cleanup);
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  popup.addEventListener('pagehide', cleanup, { once: true });
  interval = setInterval(() => { if (popup.closed) cleanup(); }, 500);
  const close = () => { cleanup(); if (!popup.closed) popup.close(); };
  const requestPrint = () => {
    try { popup.focus(); popup.print(); }
    catch { status.textContent = 'Both sheets are ready. Use Print / Save as PDF to open the print dialog.'; }
  };
  button.addEventListener('click', requestPrint);
  return {
    close,
    setProgress(fraction: number) {
      if (!popup.closed) status.textContent = `Preparing both templates locally… ${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    },
    async print(svgs: string[], signal?: AbortSignal) {
      if (svgs.length !== 2) throw new Error('Printing requires north and south templates.');
      throwIfAborted(signal);
      if (popup.closed) throw abortError();
      try {
        status.textContent = 'Loading both print sheets…';
        await Promise.all(svgs.map((svg, index) => new Promise<void>((resolve, reject) => {
          const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); urls.push(url);
          const sheet = popup.document.createElement('div'); sheet.className = 'sheet';
          const image = popup.document.createElement('img'); image.alt = `${index === 0 ? 'North' : 'South'} hemisphere template`;
          const finish = (error?: Error) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); image.onload = null; image.onerror = null; if (error) reject(error); else resolve(); };
          const abort = () => finish(abortError());
          const timer = setTimeout(() => finish(new Error('Print images could not load. Try downloading SVG instead.')), 30_000);
          signal?.addEventListener('abort', abort, { once: true });
          image.onload = () => image.naturalWidth ? finish() : finish(new Error('A print image is empty.'));
          image.onerror = () => finish(new Error('A print image failed to load. Try downloading SVG instead.'));
          sheet.append(image); sheets.append(sheet); image.src = url;
        })));
        throwIfAborted(signal); if (popup.closed) throw abortError();
        status.textContent = 'Both sheets are ready. Choose Actual size or 100% and turn off Fit to page. If the dialog does not open, use Print / Save as PDF.';
        button.disabled = false;
        requestPrint();
      } catch (error) { close(); throw error; }
    },
  };
}
