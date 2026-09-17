'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import Image from 'next/image';

import {
  centralMeridians,
  goreRotationDegrees,
  glueTabOutline,
  lobeOutline,
  pointsToSvgPath,
  renderHemisphereGores,
  type Hemisphere,
} from '@/src/globe/gore';
import type { LogoSettings } from '@/src/globe/export';
import type { SourceProjection } from '@/src/globe/source-projection';

type GorePreviewProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sourceImage: HTMLImageElement;
  sourceProjection: SourceProjection;
  goreCount: number;
  hemisphere: Hemisphere;
  showCutLines: boolean;
  dashCutLines: boolean;
  showFoldLines: boolean;
  showTabs: boolean;
  onRenderingChange?: (rendering: boolean) => void;
  logo?: LogoSettings;
};

const SIZE = 720;
const CENTER = SIZE / 2;
const RADIUS = SIZE * 0.405;

export function GorePreview({
  canvasRef,
  sourceImage,
  sourceProjection,
  goreCount,
  hemisphere,
  showCutLines,
  dashCutLines,
  showFoldLines,
  showTabs,
  onRenderingChange,
  logo,
}: GorePreviewProps) {
  const [renderError, setRenderError] = useState<string | null>(null);
  const outline = useMemo(
    () => pointsToSvgPath(lobeOutline(goreCount, hemisphere, RADIUS)),
    [goreCount, hemisphere],
  );
  const tabOutline = useMemo(
    () => pointsToSvgPath(glueTabOutline(goreCount, RADIUS)),
    [goreCount],
  );

  useEffect(() => {
    let active = true;
    onRenderingChange?.(true);

    const frame = requestAnimationFrame(() => {
      setRenderError(null);
      try {
        const rendered = renderHemisphereGores({
          source: sourceImage,
          sourceWidth: sourceImage.naturalWidth,
          sourceHeight: sourceImage.naturalHeight,
          size: SIZE,
          goreCount,
          hemisphere,
          sourceProjection,
        });
        if (!active || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = SIZE;
        canvas.height = SIZE;
        canvas.getContext('2d')?.drawImage(rendered, 0, 0);
      } catch (error) {
        if (active) setRenderError(error instanceof Error ? error.message : 'Could not render this map.');
      } finally {
        if (active) onRenderingChange?.(false);
      }
    });

    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [canvasRef, goreCount, hemisphere, onRenderingChange, sourceImage, sourceProjection]);

  if (renderError) {
    return <p className="render-error">{renderError}</p>;
  }

  const logoVisible = logo && (
    logo.position === 'equator'
    || (logo.position === 'north-pole' && hemisphere === 'north')
    || (logo.position === 'south-pole' && hemisphere === 'south')
  );

  return (
    <div className="gore-preview">
      <canvas ref={canvasRef} aria-label={`Projected ${hemisphere} hemisphere map gores`} />
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" className="template-overlay">
        {centralMeridians(goreCount).map((_, index) => {
          const rotation = goreRotationDegrees(goreCount, hemisphere, index);

          return (
            <g key={index} transform={`translate(${CENTER} ${CENTER}) rotate(${rotation})`}>
              {showCutLines && (
                <path
                  d={outline}
                  fill="none"
                  stroke="#173f3a"
                  strokeWidth="1.45"
                  strokeDasharray={dashCutLines ? '6 4' : undefined}
                  strokeLinecap={dashCutLines ? 'round' : undefined}
                />
              )}
              {showFoldLines && (
                <path
                  d={`M 0 2 L 0 ${RADIUS - 2}`}
                  fill="none"
                  stroke="#b04a3c"
                  strokeDasharray="5 4"
                  strokeWidth="1"
                />
              )}
              {showTabs && (
                <path
                  d={tabOutline}
                  fill="#fffaf0"
                  stroke="#173f3a"
                  strokeWidth="1"
                  strokeDasharray={dashCutLines ? '6 4' : undefined}
                  strokeLinecap={dashCutLines ? 'round' : undefined}
                />
              )}
            </g>
          );
        })}
        <circle cx={CENTER} cy={CENTER} r="12" fill="#fffaf0" stroke="#173f3a" strokeWidth="1.2" />
        <text
          x={CENTER}
          y={CENTER + 3.5}
          fill="#173f3a"
          fontSize="9"
          fontWeight="700"
          textAnchor="middle"
        >
          {hemisphere === 'north' ? 'N' : 'S'}
        </text>
      </svg>
      {logoVisible && (
        <Image
          className={`template-logo ${logo.position === 'equator' ? 'equator' : 'pole'}`}
          src={logo.dataUrl}
          alt="Uploaded organization logo"
          width={96}
          height={96}
          unoptimized
          style={{ width: `${7.5 * logo.scale}%` }}
        />
      )}
    </div>
  );
}

export const templateRenderSize = SIZE;
export const templateRenderRadius = RADIUS;
