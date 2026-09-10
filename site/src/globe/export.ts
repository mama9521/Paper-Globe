import {
  centralMeridians,
  lobeOutline,
  pointsToSvgPath,
  renderHemisphereGores,
  type Hemisphere,
} from './gore';

export type TemplateMarks = {
  cutLines: boolean;
  foldLines: boolean;
  tabs: boolean;
};

export type LogoSettings = {
  dataUrl: string;
  position: 'north-pole' | 'south-pole' | 'equator';
  scale: number;
};

type SvgOptions = TemplateMarks & {
  canvas: HTMLCanvasElement;
  goreCount: number;
  hemisphere: Hemisphere;
  diameter: number;
  paperLabel: string;
  paperSize: 'letter' | 'a4' | 'tabloid';
  logo?: LogoSettings;
};

const PAPER = {
  letter: { width: 816, height: 1056, css: 'letter' },
  a4: { width: 794, height: 1123, css: 'A4' },
  tabloid: { width: 1056, height: 1632, css: 'tabloid' },
} as const;
const ART_SIZE = 720;
const ART_OFFSET_Y = 126;
const CENTER = ART_SIZE / 2;
const RADIUS = ART_SIZE * 0.405;

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character] ?? character);
}

function overlayMarkup(goreCount: number, hemisphere: Hemisphere, marks: TemplateMarks) {
  const outline = pointsToSvgPath(lobeOutline(goreCount, hemisphere, RADIUS));

  return centralMeridians(goreCount)
    .map((_, index) => {
      const rotation = 180 + (index * 360) / goreCount;
      const tabWidth = Math.max(9, 17 - goreCount * 0.55);
      const tabStart = RADIUS * 0.52;
      const tabEnd = RADIUS * 0.72;
      return `<g transform="translate(${CENTER} ${CENTER}) rotate(${rotation})">
        ${marks.cutLines ? `<path d="${outline}" fill="none" stroke="#173f3a" stroke-width="1.45"/>` : ''}
        ${marks.foldLines ? `<path d="M 0 2 L 0 ${RADIUS - 2}" fill="none" stroke="#b04a3c" stroke-width="1" stroke-dasharray="5 4"/>` : ''}
        ${marks.tabs ? `<path d="M ${RADIUS * 0.205} ${tabStart} L ${RADIUS * 0.205 + tabWidth} ${tabStart + 6} L ${RADIUS * 0.22 + tabWidth} ${tabEnd - 6} L ${RADIUS * 0.22} ${tabEnd} Z" fill="#fffaf0" stroke="#173f3a" stroke-width="1"/>` : ''}
      </g>`;
    })
    .join('');
}

export function createTemplateSvg({
  canvas,
  goreCount,
  hemisphere,
  diameter,
  paperLabel,
  paperSize,
  logo,
  ...marks
}: SvgOptions) {
  const page = PAPER[paperSize];
  const artOffsetX = (page.width - ART_SIZE) / 2;
  const raster = canvas.toDataURL('image/png');
  const hemisphereLabel = hemisphere === 'north' ? 'Northern' : 'Southern';
  const logoVisible = logo && (
    logo.position === 'equator'
    || (logo.position === 'north-pole' && hemisphere === 'north')
    || (logo.position === 'south-pole' && hemisphere === 'south')
  );
  const logoSize = logo ? 54 * logo.scale : 0;
  const logoX = CENTER - logoSize / 2;
  const logoY = logo?.position === 'equator' ? CENTER + RADIUS * 0.68 - logoSize / 2 : CENTER - logoSize / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.width / 96}in" height="${page.height / 96}in" viewBox="0 0 ${page.width} ${page.height}">
  <rect width="${page.width}" height="${page.height}" fill="#fffdf8"/>
  <text x="48" y="54" fill="#173f3a" font-family="Arial, sans-serif" font-size="18" font-weight="700">PAPER GLOBE</text>
  <text x="48" y="74" fill="#6b746e" font-family="Arial, sans-serif" font-size="9" letter-spacing="1.1">${hemisphereLabel.toUpperCase()} HEMISPHERE · ${goreCount} GORES</text>
  <text x="${page.width - 48}" y="63" text-anchor="end" fill="#6b746e" font-family="Arial, sans-serif" font-size="9">${escapeXml(paperLabel)}</text>
  <g transform="translate(${artOffsetX} ${ART_OFFSET_Y})">
    <image href="${raster}" xlink:href="${raster}" width="${ART_SIZE}" height="${ART_SIZE}"/>
    ${overlayMarkup(goreCount, hemisphere, marks)}
    ${logoVisible ? `<image href="${logo.dataUrl}" xlink:href="${logo.dataUrl}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>` : ''}
    <circle cx="${CENTER}" cy="${CENTER}" r="12" fill="#fffaf0" stroke="#173f3a" stroke-width="1.2"/>
    <text x="${CENTER}" y="${CENTER + 3.5}" text-anchor="middle" fill="#173f3a" font-family="Arial, sans-serif" font-size="9" font-weight="700">${hemisphere === 'north' ? 'N' : 'S'}</text>
  </g>
  <line x1="48" y1="${page.height - 147}" x2="${page.width - 48}" y2="${page.height - 147}" stroke="#e0dbd0"/>
  <text x="48" y="${page.height - 122}" fill="#6b746e" font-family="Arial, sans-serif" font-size="9">Finished globe: ${diameter} in diameter</text>
  <text x="${page.width - 48}" y="${page.height - 122}" text-anchor="end" fill="#6b746e" font-family="Arial, sans-serif" font-size="9">Cut solid · Fold dashed</text>
  <text x="48" y="${page.height - 48}" fill="#8b8f88" font-family="Arial, sans-serif" font-size="8">Generated locally with Paper Globe</text>
</svg>`;
}

export function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function printBothHemispheres({
  sourceImage,
  goreCount,
  diameter,
  paperLabel,
  paperSize,
  marks,
  logo,
}: {
  sourceImage: HTMLImageElement;
  goreCount: number;
  diameter: number;
  paperLabel: string;
  paperSize: 'letter' | 'a4' | 'tabloid';
  marks: TemplateMarks;
  logo?: LogoSettings;
}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Allow pop-ups to open the print preview.');

  const north = renderHemisphereGores({
    source: sourceImage,
    sourceWidth: sourceImage.naturalWidth,
    sourceHeight: sourceImage.naturalHeight,
    goreCount,
    hemisphere: 'north',
  });
  const south = renderHemisphereGores({
    source: sourceImage,
    sourceWidth: sourceImage.naturalWidth,
    sourceHeight: sourceImage.naturalHeight,
    goreCount,
    hemisphere: 'south',
  });
  const northSvg = createTemplateSvg({ canvas: north, goreCount, hemisphere: 'north', diameter, paperLabel, paperSize, logo, ...marks });
  const southSvg = createTemplateSvg({ canvas: south, goreCount, hemisphere: 'south', diameter, paperLabel, paperSize, logo, ...marks });
  const northUrl = URL.createObjectURL(new Blob([northSvg], { type: 'image/svg+xml' }));
  const southUrl = URL.createObjectURL(new Blob([southSvg], { type: 'image/svg+xml' }));

  const printSize = PAPER[paperSize].css;
  printWindow.document.title = 'Paper Globe — Print';
  printWindow.document.head.innerHTML = `<style>
    *{box-sizing:border-box} body{margin:0;background:#d9d7d1} .sheet{width:${PAPER[paperSize].width / 96}in;height:${PAPER[paperSize].height / 96}in;margin:20px auto;background:white;page-break-after:always}.sheet img{display:block;width:100%;height:100%}
    @media print{body{background:white}.sheet{margin:0;page-break-after:always}@page{size:${printSize};margin:0}}
  </style>`;
  printWindow.document.body.innerHTML = `<div class="sheet"><img src="${northUrl}" alt="Northern hemisphere template"></div><div class="sheet"><img src="${southUrl}" alt="Southern hemisphere template"></div>`;
  const images = Array.from(printWindow.document.images);
  void Promise.all(images.map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    })))
    .then(() => printWindow.setTimeout(() => printWindow.print(), 250))
    .catch(() => printWindow.print());
  printWindow.addEventListener('afterprint', () => {
    URL.revokeObjectURL(northUrl);
    URL.revokeObjectURL(southUrl);
  }, { once: true });
}
