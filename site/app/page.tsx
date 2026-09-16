'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  ImagePlus,
  LockKeyhole,
  Printer,
  RotateCcw,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GorePreview } from './GorePreview';
import { createTemplateSvg, downloadSvg, printBothHemispheres } from '@/src/globe/export';
import { centralMeridians, glueTabOutline, lobeOutline, pointsToSvgPath } from '@/src/globe/gore';
import {
  SOURCE_PROJECTION_OPTIONS,
  sourceProjectionHint,
  sourceProjectionLabel,
  type SourceProjection,
} from '@/src/globe/source-projection';

type PreviewMode = 'map' | 'template' | 'globe';
type Hemisphere = 'north' | 'south';
type SourceMap = {
  image: HTMLImageElement;
  objectUrl: string;
  name: string;
  width: number;
  height: number;
};
type LogoLayer = {
  dataUrl: string;
  name: string;
};

function BrandMark() {
  return (
    <svg viewBox="0 0 42 42" aria-hidden="true" className="size-9">
      <circle cx="21" cy="21" r="20" fill="#173f3a" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <path
          key={angle}
          d="M21 21 C17 16 17 9 21 4 C25 9 25 16 21 21Z"
          fill="#f6f1e7"
          transform={`rotate(${angle} 21 21)`}
          opacity={angle % 120 === 0 ? 1 : 0.72}
        />
      ))}
    </svg>
  );
}

function TemplatePreview({
  hemisphere,
  goreCount,
  cutLines,
  dashedCutLines,
  foldLines,
  tabs,
}: {
  hemisphere: Hemisphere;
  goreCount: number;
  cutLines: boolean;
  dashedCutLines: boolean;
  foldLines: boolean;
  tabs: boolean;
}) {
  const radius = 170;
  const outline = pointsToSvgPath(lobeOutline(goreCount, hemisphere, radius));
  const tabOutline = pointsToSvgPath(glueTabOutline(goreCount, radius));

  return (
    <figure className="template-figure">
      <svg
        viewBox="-205 -205 410 410"
        className="h-full w-full drop-shadow-[0_18px_22px_rgba(29,43,39,0.08)]"
        aria-hidden="true"
      >
      <defs>
        <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e2ece2" />
          <stop offset="0.52" stopColor="#c9ddd5" />
          <stop offset="1" stopColor="#f2d6b7" />
        </linearGradient>
        <pattern id="longitude" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M 0 18 L 18 0" stroke="#365e58" strokeWidth="0.65" opacity="0.18" />
        </pattern>
      </defs>

      {centralMeridians(goreCount).map((centralMeridian, index) => (
        <g key={centralMeridian} transform={`rotate(${180 + (index * 360) / goreCount})`}>
          <path
            d={outline}
            fill="url(#paper)"
            stroke={cutLines ? '#173f3a' : 'none'}
            strokeWidth="1.6"
            strokeDasharray={dashedCutLines ? '5 4' : undefined}
            strokeLinecap={dashedCutLines ? 'round' : undefined}
          />
          <path d={outline} fill="url(#longitude)" />
          {foldLines && (
            <path
              d={`M0 1 L0 ${radius - 3}`}
              fill="none"
              stroke="#b04a3c"
              strokeDasharray="4 4"
              strokeWidth="0.9"
            />
          )}
          {tabs && (
            <path
              d={tabOutline}
              fill="#fffaf0"
              stroke="#173f3a"
              strokeWidth="0.8"
              strokeDasharray={dashedCutLines ? '5 4' : undefined}
              strokeLinecap={dashedCutLines ? 'round' : undefined}
            />
          )}
          {goreCount <= 8 && (
            <text x="0" y="115" fill="#173f3a" fontSize="7" textAnchor="middle" opacity="0.78">
              {Math.abs(centralMeridian)}° {centralMeridian < 0 ? 'W' : centralMeridian > 0 ? 'E' : ''}
            </text>
          )}
        </g>
      ))}

        <circle r="13" fill="#f8f4ea" stroke="#173f3a" strokeWidth="1.3" />
        <text x="0" y="3" fill="#173f3a" fontSize="9" fontWeight="700" textAnchor="middle">
          {hemisphere === 'north' ? 'N' : 'S'}
        </text>
      </svg>
      <figcaption className="sr-only">
        {hemisphere === 'north' ? 'North' : 'South'} hemisphere paper globe template with {goreCount} gores
      </figcaption>
    </figure>
  );
}

function SettingRow({
  id,
  label,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className={`setting-check${disabled ? ' disabled' : ''}`}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(Boolean(value))}
      />
      <span>{label}</span>
    </label>
  );
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<PreviewMode>('template');
  const [hemisphere, setHemisphere] = useState<Hemisphere>('north');
  const [sourceMap, setSourceMap] = useState<SourceMap | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState('PNG, JPEG or WebP · complete world map');
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceProjection, setSourceProjection] = useState<SourceProjection>('equirectangular');
  const [isRendering, setIsRendering] = useState(false);
  const [goreCount, setGoreCount] = useState(6);
  const [paperSize, setPaperSize] = useState<'letter' | 'a4' | 'tabloid'>('letter');
  const [cutLines, setCutLines] = useState(true);
  const [dashedCutLines, setDashedCutLines] = useState(false);
  const [foldLines, setFoldLines] = useState(true);
  const [tabs, setTabs] = useState(true);
  const [diameter, setDiameter] = useState(4);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [logoLayer, setLogoLayer] = useState<LogoLayer | null>(null);
  const [logoPosition, setLogoPosition] = useState<'north-pole' | 'south-pole' | 'equator'>('south-pole');
  const [logoScale, setLogoScale] = useState(1);

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setNotice('Choose a PNG, JPEG or WebP image.');
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const ratio = image.width / image.height;
      setFileName(file.name);
      if (sourceMap) URL.revokeObjectURL(sourceMap.objectUrl);
      setSourceMap({
        image,
        objectUrl: url,
        name: file.name,
        width: image.width,
        height: image.height,
      });
      setFileMeta(
        `${image.width.toLocaleString()} × ${image.height.toLocaleString()} · ${ratio.toFixed(2)}:1`,
      );
      setNotice(
        sourceProjection === 'equirectangular' && Math.abs(ratio - 2) >= 0.03
          ? 'Accepted. Confirm that the entire image still represents 360° × 180°.'
          : null,
      );
      setMode('template');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setNotice('That image could not be decoded. Try exporting it again as PNG or JPEG.');
    };
    image.src = url;
  };

  const handleLogo = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setNotice('Choose a PNG, JPEG, WebP or SVG logo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setLogoLayer({ dataUrl: reader.result, name: file.name });
      setNotice('Logo added. Only use marks you are authorized to reproduce.');
    };
    reader.readAsDataURL(file);
  };

  const paperLabel = paperSize === 'a4' ? 'A4 · 210 × 297 mm' : paperSize === 'tabloid' ? 'Tabloid · 11 × 17 in' : 'US Letter · 8.5 × 11 in';

  const handleExport = () => {
    if (!sourceMap || !canvasRef.current || isRendering) {
      setNotice('Upload a world map before exporting.');
      return;
    }
    const svg = createTemplateSvg({
      canvas: canvasRef.current,
      goreCount,
      hemisphere,
      diameter,
      paperLabel,
      paperSize,
      cutLines,
      dashedCutLines,
      foldLines,
      tabs,
      logo: logoLayer ? { dataUrl: logoLayer.dataUrl, position: logoPosition, scale: logoScale } : undefined,
    });
    downloadSvg(svg, `paper-globe-${hemisphere}-${goreCount}-gores.svg`);
    setNotice(`${hemisphere === 'north' ? 'Northern' : 'Southern'} hemisphere SVG downloaded.`);
  };

  const handlePrint = () => {
    if (!sourceMap) {
      setNotice('Upload a world map before printing.');
      return;
    }
    try {
      printBothHemispheres({
        sourceImage: sourceMap.image,
        sourceProjection,
        goreCount,
        diameter,
        paperLabel,
        paperSize,
        marks: { cutLines, dashedCutLines, foldLines, tabs },
        logo: logoLayer ? { dataUrl: logoLayer.dataUrl, position: logoPosition, scale: logoScale } : undefined,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The print preview could not open.');
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="#workspace" className="brand" aria-label="Paper Globe home">
          <BrandMark />
          <span>
            <strong>Paper Globe</strong>
            <small>Projection workshop</small>
          </span>
        </a>

        <div className="topbar-note">
          <LockKeyhole />
          Images stay on this device
        </div>

        <nav className="topbar-actions" aria-label="Project actions">
          <Dialog>
            <DialogTrigger render={<Button variant="ghost" size="lg" aria-label="Open the quick guide" />}>
              <CircleHelp />
              <span className="hide-mobile">Guide</span>
            </DialogTrigger>
            <DialogContent className="guide-dialog">
              <DialogHeader>
                <DialogTitle>From flat map to paper globe</DialogTitle>
                <DialogDescription>
                  Paper Globe runs entirely in this browser tab. Your source image is never uploaded.
                </DialogDescription>
              </DialogHeader>
              <ol>
                <li><span>1</span><div><strong>Upload a world map</strong><p>Choose its flat-map projection so the image can be sampled geographically.</p></div></li>
                <li><span>2</span><div><strong>Choose the finish</strong><p>Set gore count, paper, and assembly marks while checking each hemisphere.</p></div></li>
                <li><span>3</span><div><strong>Export and assemble</strong><p>Download each SVG or use Print / PDF for the two-sheet set.</p></div></li>
              </ol>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="lg" onClick={handleExport} disabled={!sourceMap || isRendering}>
            <Download />
            Export SVG
          </Button>
        </nav>
      </header>

      <div id="workspace" className="workspace">
        <aside className="control-panel" aria-label="Globe settings">
          <section className="control-section upload-section">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h2>Source map</h2>
                <p>Complete projected world image</p>
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <button
              className={`upload-card ${notice && !sourceMap ? 'invalid' : ''}`}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFile(event.dataTransfer.files[0]);
              }}
            >
              <span className="upload-icon"><ImagePlus /></span>
              <span className="upload-copy">
                <strong>{fileName ?? 'Choose a world map'}</strong>
                <small>{fileMeta}</small>
              </span>
              <Upload className="upload-arrow" />
            </button>
            {notice && !sourceMap && (
              <p className="upload-notice" role="alert"><AlertTriangle /> {notice}</p>
            )}

            <div className="field-stack source-projection-field">
              <label htmlFor="source-projection">Map projection</label>
              <NativeSelect
                id="source-projection"
                value={sourceProjection}
                className="w-full"
                onChange={(event) => setSourceProjection(event.target.value as SourceProjection)}
              >
                {SOURCE_PROJECTION_OPTIONS.map((projection) => (
                  <NativeSelectOption key={projection.value} value={projection.value}>
                    {projection.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="projection-help">{sourceProjectionHint(sourceProjection)}</p>
            </div>
          </section>

          <section className="control-section">
            <div className="section-heading">
              <span>02</span>
              <div>
                <h2>Globe format</h2>
                <p>Shape and finished size</p>
              </div>
            </div>

            <div className="field-stack">
              <label htmlFor="gores">Number of gores</label>
              <NativeSelect
                id="gores"
                value={String(goreCount)}
                className="w-full"
                onChange={(event) => setGoreCount(Number(event.target.value))}
              >
                <NativeSelectOption value="4">4 gores · simple</NativeSelectOption>
                <NativeSelectOption value="6">6 gores · classic</NativeSelectOption>
                <NativeSelectOption value="8">8 gores · refined</NativeSelectOption>
                <NativeSelectOption value="12">12 gores · smooth</NativeSelectOption>
              </NativeSelect>
            </div>

            <div className="field-stack">
              <div className="field-label-row">
                <label htmlFor="diameter">Finished diameter</label>
                <output>{diameter}&quot;</output>
              </div>
              <Slider
                id="diameter"
                value={[diameter]}
                min={2}
                max={8}
                step={0.5}
                onValueChange={(value) => setDiameter(typeof value === 'number' ? value : (value[0] ?? 4))}
              />
              <div className="range-notes"><span>2 in</span><span>8 in</span></div>
            </div>

            <div className="field-stack">
              <label htmlFor="paper">Paper size</label>
              <NativeSelect
                id="paper"
                value={paperSize}
                className="w-full"
                onChange={(event) => setPaperSize(event.target.value as typeof paperSize)}
              >
                <NativeSelectOption value="letter">US Letter · 8.5 × 11 in</NativeSelectOption>
                <NativeSelectOption value="a4">A4 · 210 × 297 mm</NativeSelectOption>
                <NativeSelectOption value="tabloid">Tabloid · 11 × 17 in</NativeSelectOption>
              </NativeSelect>
            </div>
          </section>

          <section className="control-section line-settings">
            <div className="section-heading compact">
              <span>03</span>
              <div><h2>Assembly marks</h2></div>
            </div>
            <SettingRow id="cut-lines" label="Cut lines" checked={cutLines} onCheckedChange={setCutLines} />
            <SettingRow
              id="dashed-cut-lines"
              label="Dashed cut outline"
              checked={dashedCutLines}
              disabled={!cutLines}
              onCheckedChange={setDashedCutLines}
            />
            <SettingRow id="fold-lines" label="Fold lines" checked={foldLines} onCheckedChange={setFoldLines} />
            <SettingRow id="tabs" label="Glue tabs" checked={tabs} onCheckedChange={setTabs} />
          </section>

          <div className="branding-control">
            <button
              type="button"
              className="branding-row"
              aria-expanded={brandingOpen}
              onClick={() => setBrandingOpen((open) => !open)}
            >
              <span>Add a logo</span>
              <span>{logoLayer ? 'Added' : 'Optional'}</span>
              <ChevronDown className={brandingOpen ? 'open' : undefined} />
            </button>
            {brandingOpen && (
              <div className="branding-fields">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(event) => handleLogo(event.target.files?.[0])}
                />
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <ImagePlus /> {logoLayer ? logoLayer.name : 'Upload authorized logo'}
                </Button>
                <div className="field-stack">
                  <label htmlFor="logo-position">Position</label>
                  <NativeSelect
                    id="logo-position"
                    value={logoPosition}
                    className="w-full"
                    onChange={(event) => setLogoPosition(event.target.value as typeof logoPosition)}
                  >
                    <NativeSelectOption value="north-pole">North Pole</NativeSelectOption>
                    <NativeSelectOption value="south-pole">South Pole</NativeSelectOption>
                    <NativeSelectOption value="equator">Equator</NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="field-stack">
                  <div className="field-label-row"><label htmlFor="logo-size">Logo size</label><output>{Math.round(logoScale * 100)}%</output></div>
                  <Slider
                    id="logo-size"
                    value={[logoScale]}
                    min={0.5}
                    max={2}
                    step={0.1}
                    onValueChange={(value) => setLogoScale(typeof value === 'number' ? value : (value[0] ?? 1))}
                  />
                </div>
                <p>Use only logos you’re authorized to reproduce.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="preview-panel" aria-label="Paper globe preview">
          <div className="preview-toolbar">
            <Tabs value={mode} onValueChange={(value) => setMode(value as PreviewMode)}>
              <TabsList className="preview-tabs">
                <TabsTrigger value="map">Map</TabsTrigger>
                <TabsTrigger value="template">Template</TabsTrigger>
                <TabsTrigger value="globe">Globe</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="preview-status">
              <span><i /> Live preview</span>
              <Button variant="ghost" size="icon" aria-label="Reset view"><RotateCcw /></Button>
            </div>
          </div>

          <div className="canvas-wrap">
            <div
              className="paper-stage"
              style={{ aspectRatio: paperSize === 'a4' ? '210 / 297' : paperSize === 'tabloid' ? '11 / 17' : '8.5 / 11' }}
            >
              <div className="paper-header">
                <span>Sheet 1 of 2</span>
                <strong>{hemisphere === 'north' ? 'Northern' : 'Southern'} hemisphere</strong>
                <span>{paperLabel.split(' · ')[0]}</span>
              </div>

              <div className="template-art">
                {mode === 'template' ? (
                  sourceMap ? (
                    <>
                      <GorePreview
                        canvasRef={canvasRef}
                        sourceImage={sourceMap.image}
                        sourceProjection={sourceProjection}
                        goreCount={goreCount}
                        hemisphere={hemisphere}
                        showCutLines={cutLines}
                        dashCutLines={dashedCutLines}
                        showFoldLines={foldLines}
                        showTabs={tabs}
                        onRenderingChange={setIsRendering}
                        logo={logoLayer ? { dataUrl: logoLayer.dataUrl, position: logoPosition, scale: logoScale } : undefined}
                      />
                      {isRendering && <span className="rendering-badge">Projecting map…</span>}
                    </>
                  ) : (
                    <TemplatePreview
                      hemisphere={hemisphere}
                      goreCount={goreCount}
                      cutLines={cutLines}
                      dashedCutLines={dashedCutLines}
                      foldLines={foldLines}
                      tabs={tabs}
                    />
                  )
                ) : mode === 'map' ? (
                  sourceMap ? (
                    <figure className="source-preview">
                      <Image
                        src={sourceMap.objectUrl}
                        alt={`Uploaded world map: ${sourceMap.name}`}
                        width={sourceMap.width}
                        height={sourceMap.height}
                        unoptimized
                      />
                      <figcaption>
                        <span>{sourceMap.name}</span>
                        <span>{sourceMap.width.toLocaleString()} × {sourceMap.height.toLocaleString()} px</span>
                      </figcaption>
                    </figure>
                  ) : (
                    <div className="map-empty">
                      <ImagePlus />
                      <strong>Your map will appear here</strong>
                      <span>Upload a complete world image to begin.</span>
                    </div>
                  )
                ) : (
                  <div className="globe-placeholder" aria-label="Three dimensional globe preview placeholder">
                    <div
                      className={`wire-globe ${sourceMap && sourceProjection === 'equirectangular' ? 'textured' : ''}`}
                      style={sourceMap && sourceProjection === 'equirectangular'
                        ? { backgroundImage: `url(${sourceMap.objectUrl})` }
                        : undefined}
                    />
                    <strong>{sourceMap ? 'Wrapped globe check' : 'Globe preview'}</strong>
                    <span>
                      {sourceMap
                        ? sourceProjection === 'equirectangular'
                          ? 'Inspect coverage before printing.'
                          : 'Use Template view to inspect the corrected projection.'
                        : 'Upload a map to inspect the assembled globe.'}
                    </span>
                  </div>
                )}
              </div>

              <div className="paper-footer">
                <span>Paper Globe · {goreCount} gores · {diameter}&quot; diameter</span>
                <span className="legend"><i className={`cut${dashedCutLines ? ' dashed' : ''}`} /> cut <i className="fold" /> fold</span>
              </div>
            </div>
          </div>

          <div className="preview-footer">
            <div className="hemisphere-switch" aria-label="Preview hemisphere">
              <button
                type="button"
                className={hemisphere === 'north' ? 'active' : undefined}
                onClick={() => setHemisphere('north')}
              >
                {hemisphere === 'north' && <Check />} North
              </button>
              <button
                type="button"
                className={hemisphere === 'south' ? 'active' : undefined}
                onClick={() => setHemisphere('south')}
              >
                {hemisphere === 'south' && <Check />} South
              </button>
            </div>
            <p>
              {isRendering ? (
                <><strong>Projecting.</strong> Sampling the source image locally.</>
              ) : sourceMap ? (
                <><strong>Projection ready.</strong> {sourceProjectionLabel(sourceProjection)} to {goreCount} Cassini gores.</>
              ) : (
                <><strong>Ready to customize.</strong> Upload a complete world image.</>
              )}
            </p>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!sourceMap || isRendering}>
              <Printer /> Print / PDF
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
