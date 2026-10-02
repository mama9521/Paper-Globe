'use client';

import { useEffect, useRef } from 'react';

/** A view of the canonical SVG scene; render jobs and export do not depend on this view. */
export function GorePreview({ svg, label }: { svg?: string; label: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    image.src = url;
    return () => { image.removeAttribute('src'); URL.revokeObjectURL(url); };
  }, [svg]);
  return (
    <figure className="canonical-preview">
      {/* This SVG is generated locally; a server image optimizer must not receive it. */}
      {/* oxlint-disable-next-line nextjs/no-img-element */}
      <img ref={imageRef} hidden={!svg} alt={label} width={816} height={1056} />
      {!svg && <p>Choose a diameter that fits the selected paper.</p>}
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
