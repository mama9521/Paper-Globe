import type { Hemisphere } from './gore';

export function templateExportName(sourceName: string, goreCount: number, hemisphere?: Hemisphere) {
  const name = sourceName
    .replace(/\.(png|jpe?g|webp)$/i, '')
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 120)
    .trim();
  return `${name || 'paper-globe'}-${hemisphere ?? 'globe'}-${goreCount}-gores`;
}
