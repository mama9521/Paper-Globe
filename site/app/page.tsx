'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GorePreview } from './GorePreview';
import { useWorkshop, type PreviewMode } from './useWorkshop';
import { PAPER, EXPORT_DPI, type PaperSize } from '../src/globe/paper';
import {
  SOURCE_PROJECTION_OPTIONS,
  sourceProjectionHint,
  type SourceProjection,
} from '../src/globe/source-projection';
import {
  GLUE_TAB_OPTIONS,
  glueTabOutline,
  pointsToSvgPath,
  type GoreCount,
} from '../src/globe/geometry';
import {
  DEFAULT_FOLD_COLOR,
  GLUE_TAB_FILL,
  type LogoSettings,
} from '../src/globe/export';
import './workshop.css';

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
function CheckSetting({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export default function Home() {
  const workshop = useWorkshop();
  const { settings, source, logo, notice } = workshop;
  const input = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const hemisphereName =
    settings.hemisphere === 'north' ? 'Northern' : 'Southern';
  const aspectWarning =
    source &&
    settings.sourceProjection === 'equirectangular' &&
    Math.abs(source.width / source.height - 2) >= 0.03;
  const busy = workshop.exporting || workshop.isRendering;
  const tabShape = settings.marks.tabShape ?? 'trapezoid';
  const foldColor = settings.marks.foldColor ?? DEFAULT_FOLD_COLOR;
  const poleToEquator = ((Math.PI * settings.diameter) / 4).toFixed(2);
  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          type="button"
          className="brand"
          aria-label="Reset workshop and clear uploads"
          title="Start over and clear uploads"
          onClick={() => window.location.reload()}
        >
          <BrandMark />
          <span>
            <strong>Paper Globe</strong>
            <small>Projection workshop</small>
          </span>
        </button>
        <div className="topbar-note">
          <LockKeyhole />
          Your map and logo are processed in your browser. Files stay on your
          device.
        </div>
        <nav className="topbar-actions" aria-label="Project actions">
          <fieldset
            className="hemisphere-switch"
            aria-label="Preview hemisphere"
          >
            {(['north', 'south'] as const).map((hemisphere) => (
              <button
                key={hemisphere}
                type="button"
                disabled={workshop.exporting}
                aria-pressed={settings.hemisphere === hemisphere}
                onClick={() => {
                  workshop.setMode('template');
                  workshop.update({ hemisphere });
                }}
              >
                {hemisphere === 'north' ? 'North' : 'South'}
              </button>
            ))}
          </fieldset>
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="lg"
                  aria-label="Open the quick guide"
                />
              }
            >
              <CircleHelp />
              Guide
            </DialogTrigger>
            <DialogContent className="guide-dialog">
              <DialogHeader>
                <DialogTitle>Make your first paper globe</DialogTitle>
                <DialogDescription>
                  Start with a flat world map and turn it into two sheets you
                  can cut, fold, and glue.
                </DialogDescription>
              </DialogHeader>
              <ol>
                <li>
                  <span aria-hidden="true">1</span>
                  <div>
                    <strong>Choose a world map</strong>
                    <p>
                      Pick an image that shows the whole world and select the
                      projection it uses. For an equirectangular map, look for
                      an image twice as wide as it is tall. We recommend at
                      least 2 megapixels (2,000 × 1,000 pixels for a 2:1 map).
                      Use a still PNG, JPEG, or WebP up to 20 MiB and 8
                      megapixels. Web Mercator leaves the polar caps blank.
                    </p>
                  </div>
                </li>
                <li>
                  <span aria-hidden="true">2</span>
                  <div>
                    <strong>Set up the two sheets</strong>
                    <p>
                      Choose your paper size and finished diameter. If the
                      template is too large, reduce the diameter or use larger
                      paper. The map pieces are called gores. Choose how many
                      pieces to use per hemisphere, then check North and South
                      in the preview. The Globe view is an illustration. Use
                      Template to check the pieces and placement.
                    </p>
                  </div>
                </li>
                <li>
                  <span aria-hidden="true">3</span>
                  <div>
                    <strong>Choose your assembly marks</strong>
                    <p>
                      Cut around the outside outline. The dashed guides inside
                      the pieces and at the bases of the gray tabs show where to
                      fold. Use the tabs to glue the two halves together.
                    </p>
                  </div>
                </li>
                <li>
                  <span aria-hidden="true">4</span>
                  <div>
                    <strong>Add optional notes, a legend, or a logo</strong>
                    <p>
                      A logo near the equator appears on both sheets. A logo at
                      a pole appears on that hemisphere’s sheet.
                    </p>
                  </div>
                </li>
                <li>
                  <span aria-hidden="true">5</span>
                  <div>
                    <strong>Print at actual size</strong>
                    <p>
                      Print PDF prepares both sheets. Choose Actual size or 100%
                      and turn off Fit to page. At the current diameter, the
                      distance from the center pole to the base of a piece,
                      before the tab, should measure {poleToEquator} in. Save as
                      SVG downloads the selected hemisphere.
                    </p>
                  </div>
                </li>
              </ol>
              <p>
                Reset settings restores the template defaults and keeps your map
                and logo loaded. Click Projection workshop to start over with a
                blank template.
              </p>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              void workshop.exportTemplates('print');
            }}
            disabled={!workshop.canExport}
          >
            <Printer />
            Print PDF
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              void workshop.exportTemplates('svg');
            }}
            disabled={!workshop.canExport}
          >
            <Download />
            Save as SVG
          </Button>
        </nav>
      </header>
      <div className="feedback-region" aria-live="polite" aria-atomic="true">
        {notice && (
          <p
            className={`operation-notice ${notice.kind}`}
            role={notice.kind === 'error' ? 'alert' : 'status'}
          >
            {notice.kind === 'error' && <AlertTriangle />}
            {notice.text}
          </p>
        )}
      </div>
      <div id="workspace" className="workspace">
        <aside className="control-panel" aria-label="Globe settings">
          <fieldset className="workshop-controls" disabled={workshop.exporting}>
            <legend className="sr-only">Source and template settings</legend>
            <section className="control-section upload-section">
              <div className="section-heading">
                <span>
                  <span className="sr-only">Step </span>1
                </span>
                <div>
                  <h2>Source map</h2>
                  <p>Choose an image of the whole world</p>
                </div>
              </div>
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Choose world map file"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void workshop.chooseMap(file);
                }}
              />
              <button
                className="upload-card"
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void workshop.chooseMap(event.dataTransfer.files[0]);
                }}
              >
                <span className="upload-icon">
                  <ImagePlus />
                </span>
                <span className="upload-copy">
                  <strong>
                    {workshop.loading
                      ? 'Checking image…'
                      : (source?.name ?? 'Choose a world map')}
                  </strong>
                  <small>
                    {source
                      ? `${source.width.toLocaleString()} × ${source.height.toLocaleString()} pixels`
                      : 'PNG, JPEG or WebP · up to 8 megapixels'}
                  </small>
                </span>
                <Upload className="upload-arrow" />
              </button>
              <div className="field-stack">
                <label htmlFor="source-projection">Map projection</label>
                <select
                  id="source-projection"
                  value={settings.sourceProjection}
                  onChange={(event) =>
                    workshop.update({
                      sourceProjection: event.target.value as SourceProjection,
                    })
                  }
                >
                  {SOURCE_PROJECTION_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="projection-help">
                  {sourceProjectionHint(settings.sourceProjection)}
                </p>
              </div>
              {aspectWarning && (
                <output className="input-warning" aria-live="polite">
                  Accepted at this aspect ratio. Confirm the entire image
                  represents 360° × 180°; otherwise the geography will be
                  distorted.
                </output>
              )}
            </section>
            <section className="control-section">
              <div className="section-heading">
                <span>
                  <span className="sr-only">Step </span>2
                </span>
                <div>
                  <h2>Globe format</h2>
                  <p>Shape and finished size</p>
                </div>
              </div>
              <div className="field-stack">
                <label htmlFor="gores">Map pieces per hemisphere</label>
                <select
                  id="gores"
                  value={settings.goreCount}
                  onChange={(event) =>
                    workshop.update({
                      goreCount: Number(event.target.value) as GoreCount,
                    })
                  }
                >
                  {[4, 6, 8, 12].map((count) => (
                    <option key={count} value={count}>
                      {count} pieces
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-stack">
                <div className="field-label-row">
                  <label htmlFor="diameter">Finished diameter</label>
                  <output htmlFor="diameter">
                    {settings.diameter.toFixed(1)} in
                  </output>
                </div>
                <input
                  id="diameter"
                  type="range"
                  min="2"
                  max="8"
                  step="0.1"
                  value={settings.diameter}
                  aria-describedby="diameter-help"
                  onChange={(event) =>
                    workshop.update({ diameter: Number(event.target.value) })
                  }
                />
                <p id="diameter-help" className="projection-help">
                  Maximum for this paper: {workshop.maximumDiameter.toFixed(2)}{' '}
                  in. Raster export: {EXPORT_DPI} DPI.
                </p>
              </div>
              <div className="field-stack">
                <label htmlFor="paper">Paper size</label>
                <select
                  id="paper"
                  value={settings.paperSize}
                  onChange={(event) =>
                    workshop.update({
                      paperSize: event.target.value as PaperSize,
                    })
                  }
                >
                  {(Object.keys(PAPER) as PaperSize[]).map((size) => (
                    <option key={size} value={size}>
                      {PAPER[size].label} ·{' '}
                      {Number((PAPER[size].widthMm / 25.4).toFixed(2))} ×{' '}
                      {Number((PAPER[size].heightMm / 25.4).toFixed(2))} in
                    </option>
                  ))}
                </select>
              </div>
              {workshop.fitError && (
                <p className="input-warning" role="alert">
                  {workshop.fitError}
                </p>
              )}
            </section>
            <section className="control-section line-settings">
              <div className="section-heading compact">
                <span>
                  <span className="sr-only">Step </span>3
                </span>
                <h2>Assembly marks</h2>
              </div>
              <CheckSetting
                id="cutLines"
                label="Show cut outline"
                checked={settings.marks.cutLines}
                onChange={(checked) => workshop.setMark('cutLines', checked)}
              />
              <div className="field-stack mark-field">
                <label htmlFor="cut-style">Cut outline style</label>
                <select
                  id="cut-style"
                  value={settings.marks.dashedCutLines ? 'dashed' : 'solid'}
                  disabled={!settings.marks.cutLines}
                  aria-describedby="cut-help"
                  onChange={(event) =>
                    workshop.setMark(
                      'dashedCutLines',
                      event.target.value === 'dashed',
                    )
                  }
                >
                  <option value="solid">Solid outer line</option>
                  <option value="dashed">Dashed outer line</option>
                </select>
                <p id="cut-help" className="projection-help">
                  Cut around the outside edge, including the tabs.
                </p>
              </div>
              <CheckSetting
                id="foldLines"
                label="Show dashed fold guides"
                checked={settings.marks.foldLines}
                onChange={(checked) => workshop.setMark('foldLines', checked)}
              />
              <div className="fold-color mark-field">
                <label htmlFor="fold-color">Fold guide color</label>
                <input
                  id="fold-color"
                  type="color"
                  value={foldColor}
                  disabled={!settings.marks.foldLines}
                  onChange={(event) =>
                    workshop.setMark('foldColor', event.target.value)
                  }
                />
              </div>
              <CheckSetting
                id="tabs"
                label="Show gray glue tabs"
                checked={settings.marks.tabs}
                onChange={(checked) => workshop.setMark('tabs', checked)}
              />
              <fieldset
                className="tab-shape-options"
                disabled={!settings.marks.tabs}
              >
                <legend>Glue-tab shape</legend>
                <div className="tab-shape-grid">
                  {GLUE_TAB_OPTIONS.map((option) => (
                    <label key={option.value} className="tab-shape-choice">
                      <input
                        type="radio"
                        name="tab-shape"
                        value={option.value}
                        checked={tabShape === option.value}
                        onChange={() =>
                          workshop.setMark('tabShape', option.value)
                        }
                      />
                      <span>
                        <svg viewBox="-23 96 46 22" aria-hidden="true">
                          <path
                            d={pointsToSvgPath(
                              glueTabOutline(6, 100, option.value),
                            )}
                            fill={GLUE_TAB_FILL}
                            stroke="currentColor"
                            strokeWidth="1.1"
                          />
                        </svg>
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
                <p>
                  {
                    GLUE_TAB_OPTIONS.find((option) => option.value === tabShape)
                      ?.hint
                  }{' '}
                  Fold along the tab base.
                </p>
              </fieldset>
            </section>
            <section className="control-section annotation-settings">
              <div className="section-heading">
                <span>
                  <span className="sr-only">Step </span>4
                </span>
                <div>
                  <h2>Notes, legend &amp; logo</h2>
                  <p>Optional extras for the printed globe</p>
                </div>
              </div>
              <CheckSetting
                id="description-box"
                label="Description box"
                checked={settings.descriptionEnabled}
                onChange={(descriptionEnabled) =>
                  workshop.update({ descriptionEnabled })
                }
              />
              {settings.descriptionEnabled && (
                <div className="annotation-field">
                  <label htmlFor="description-text">Globe description</label>
                  <textarea
                    id="description-text"
                    maxLength={240}
                    value={settings.description}
                    placeholder="What does this globe show?"
                    onChange={(event) =>
                      workshop.update({ description: event.target.value })
                    }
                  />
                </div>
              )}
              <CheckSetting
                id="custom-legend"
                label="Custom legend"
                checked={settings.legendEnabled}
                onChange={(legendEnabled) => workshop.update({ legendEnabled })}
              />
              {settings.legendEnabled && (
                <div className="annotation-field">
                  <label htmlFor="legend-text">Legend entries</label>
                  <textarea
                    id="legend-text"
                    maxLength={180}
                    value={settings.legend}
                    placeholder={'Blue = ocean\nGreen = forest'}
                    onChange={(event) =>
                      workshop.update({ legend: event.target.value })
                    }
                  />
                </div>
              )}
              <div className="branding-control">
                <button
                  type="button"
                  className="branding-row"
                  aria-expanded={brandingOpen}
                  aria-controls="branding-fields"
                  onClick={() => setBrandingOpen((open) => !open)}
                >
                  <span>{logo ? 'Logo settings' : 'Add a logo'}</span>
                  <ChevronDown
                    className={brandingOpen ? 'open' : undefined}
                    aria-hidden="true"
                  />
                </button>
                {brandingOpen && (
                  <div id="branding-fields" className="branding-fields">
                    <input
                      ref={logoInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Choose logo file"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void workshop.chooseLogo(file);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => logoInput.current?.click()}
                    >
                      <ImagePlus />
                      {workshop.logoLoading
                        ? 'Checking logo…'
                        : (logo?.name ?? 'Choose a logo image')}
                    </Button>
                    {(logo || workshop.logoLoading) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={workshop.removeLogo}
                      >
                        Remove logo
                      </Button>
                    )}
                    <div className="field-stack">
                      <label htmlFor="logo-position">Position</label>
                      <select
                        id="logo-position"
                        value={settings.logoPosition}
                        onChange={(event) =>
                          workshop.setLogoPosition(
                            event.target.value as LogoSettings['position'],
                          )
                        }
                      >
                        <option value="north-pole">North Pole</option>
                        <option value="south-pole">South Pole</option>
                        <option value="equator">
                          Near equator (both sheets)
                        </option>
                      </select>
                    </div>
                    <div className="field-stack">
                      <label htmlFor="logo-size">
                        Logo size: {Math.round(settings.logoScale * 100)}%
                      </label>
                      <input
                        id="logo-size"
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={settings.logoScale}
                        onChange={(event) =>
                          workshop.update({
                            logoScale: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <p>
                      Use a still PNG, JPEG, or WebP up to 5 MiB and 1
                      megapixel. Choose a logo you have permission to use.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </fieldset>
        </aside>
        <section className="preview-panel" aria-label="Paper globe preview">
          <div className="preview-toolbar">
            <Tabs
              value={workshop.mode}
              onValueChange={(value) => workshop.setMode(value as PreviewMode)}
            >
              <TabsList className="preview-tabs">
                <TabsTrigger value="map">Map</TabsTrigger>
                <TabsTrigger value="template">Template</TabsTrigger>
                <TabsTrigger value="globe">Globe</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              title="Restore template defaults and keep your map and logo"
              disabled={workshop.exporting}
              onClick={() => {
                workshop.resetSettings();
                setBrandingOpen(false);
              }}
            >
              <RotateCcw />
              Reset settings
            </Button>
          </div>
          <div className="canvas-wrap" aria-busy={busy}>
            {workshop.mode === 'template' ? (
              <GorePreview
                svg={workshop.previewSvg}
                label={`${hemisphereName} hemisphere, sheet ${settings.hemisphere === 'north' ? 1 : 2} of 2, ${settings.goreCount} map pieces, ${settings.diameter} inch target diameter`}
              />
            ) : workshop.mode === 'map' ? (
              source ? (
                <figure className="source-preview">
                  <Image
                    src={source.objectUrl}
                    alt={`Uploaded world map: ${source.name}`}
                    width={source.width}
                    height={source.height}
                    unoptimized
                  />
                  <figcaption>
                    {source.name} · {source.width} × {source.height} px
                  </figcaption>
                </figure>
              ) : (
                <p>Choose a world map to begin.</p>
              )
            ) : (
              <div
                className="globe-placeholder"
                aria-label="Illustrative globe only"
              >
                <div
                  className={`wire-globe ${source && settings.sourceProjection === 'equirectangular' ? 'textured' : ''}`}
                  style={
                    source && settings.sourceProjection === 'equirectangular'
                      ? { backgroundImage: `url(${source.objectUrl})` }
                      : undefined
                  }
                />
                <strong>Illustration only — not a 3D projection</strong>
                <span>
                  This view does not verify geography, seam fit, or physical
                  assembly. Use Template to inspect the projected output.
                </span>
              </div>
            )}
          </div>
          <div className="preview-footer">
            <output className="render-status" aria-live="polite">
              {workshop.exporting
                ? `Preparing print-quality output: ${Math.round(workshop.exportProgress * 100)}%`
                : workshop.isRendering
                  ? `Projecting locally: ${Math.round((workshop.render?.progress ?? 0) * 100)}%`
                  : workshop.ready
                    ? `Sheet ${settings.hemisphere === 'north' ? 1 : 2} of 2 ready.`
                    : workshop.render?.phase === 'failed'
                      ? workshop.render.error
                      : workshop.render?.phase === 'cancelled'
                        ? 'Projection cancelled.'
                        : 'Choose a map to begin.'}
            </output>
            {busy && (
              <Button variant="ghost" size="sm" onClick={workshop.cancel}>
                Cancel
              </Button>
            )}
            {!busy && source && !workshop.ready && (
              <Button variant="outline" size="sm" onClick={workshop.retry}>
                Retry projection
              </Button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
