'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, CircleHelp, Download, ImagePlus, LockKeyhole, Printer, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GorePreview } from './GorePreview';
import { useWorkshop, type PreviewMode } from './useWorkshop';
import { PAPER, EXPORT_DPI, type PaperSize } from '../src/globe/paper';
import { SOURCE_PROJECTION_OPTIONS, sourceProjectionHint, type SourceProjection } from '../src/globe/source-projection';
import type { GoreCount } from '../src/globe/geometry';
import type { LogoSettings, TemplateMarks } from '../src/globe/export';
import './workshop.css';

function BrandMark() {
  return <svg viewBox="0 0 42 42" aria-hidden="true" className="size-9"><circle cx="21" cy="21" r="20" fill="#173f3a" />{[0, 60, 120, 180, 240, 300].map((angle) => <path key={angle} d="M21 21 C17 16 17 9 21 4 C25 9 25 16 21 21Z" fill="#f6f1e7" transform={`rotate(${angle} 21 21)`} opacity={angle % 120 === 0 ? 1 : 0.72} />)}</svg>;
}
function CheckSetting({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-check" htmlFor={id}><input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}
export default function Home() {
  const workshop = useWorkshop();
  const { settings, source, logo, notice } = workshop;
  const input = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const hemisphereName = settings.hemisphere === 'north' ? 'Northern' : 'Southern';
  const aspectWarning = source && settings.sourceProjection === 'equirectangular' && Math.abs(source.width / source.height - 2) >= 0.03;
  const busy = workshop.exporting || workshop.isRendering;
  const markOptions: [keyof TemplateMarks, string][] = [['cutLines', 'Cut lines'], ['dashedCutLines', 'Dashed cut outline'], ['foldLines', 'Fold lines'], ['tabs', 'Glue tabs']];
  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="#workspace" className="brand" aria-label="Paper Globe home"><BrandMark /><span><strong>Paper Globe</strong><small>Projection workshop</small></span></a>
        <div className="topbar-note"><LockKeyhole />Images stay on this device</div>
        <nav className="topbar-actions" aria-label="Project actions">
          <Dialog><DialogTrigger render={<Button variant="ghost" size="lg" aria-label="Open the quick guide" />}><CircleHelp /><span className="hide-mobile">Guide</span></DialogTrigger>
            <DialogContent className="guide-dialog"><DialogHeader><DialogTitle>From flat map to paper globe</DialogTitle><DialogDescription>Map processing and export stay in this browser. No source map or logo is uploaded.</DialogDescription></DialogHeader>
              <ol><li><span>1</span><div><strong>Choose a complete world map</strong><p>Select its projection. Use a still PNG, JPEG, or WebP, up to 20 MiB and 8 megapixels.</p></div></li><li><span>2</span><div><strong>Choose the physical size</strong><p>Set diameter, paper, and assembly marks. Oversized layouts are rejected rather than scaled silently.</p></div></li><li><span>3</span><div><strong>Print at actual size</strong><p>Download either SVG from any view, or print both sheets. Disable fit-to-page and measure the 1-inch scale check. Cut the outer boundary; fold, rather than cut, the red tab attachments.</p></div></li></ol>
              <p>Reset view returns to the northern template without deleting your settings. Physical assembly tolerances still require print testing; the globe illustration is not geometric verification.</p>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="lg" onClick={() => { void workshop.exportTemplates('svg'); }} disabled={!workshop.canExport}><Download />Export SVG</Button>
        </nav>
      </header>
      <div className="feedback-region" aria-live="polite" aria-atomic="true">
        {notice && <p className={`operation-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'error' && <AlertTriangle />}{notice.text}</p>}
      </div>
      <div id="workspace" className="workspace">
        <aside className="control-panel" aria-label="Globe settings">
          <fieldset className="workshop-controls" disabled={workshop.exporting}><legend className="sr-only">Source and template settings</legend>
            <section className="control-section upload-section">
              <div className="section-heading"><span>01</span><div><h2>Source map</h2><p>Complete projected world image</p></div></div>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose world map file" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void workshop.chooseMap(file); }} />
              <button className="upload-card" type="button" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void workshop.chooseMap(event.dataTransfer.files[0]); }}>
                <span className="upload-icon"><ImagePlus /></span><span className="upload-copy"><strong>{workshop.loading ? 'Checking image…' : source?.name ?? 'Choose a world map'}</strong><small>{source ? `${source.width.toLocaleString()} × ${source.height.toLocaleString()} pixels` : 'PNG, JPEG or WebP · up to 8 megapixels'}</small></span><Upload className="upload-arrow" />
              </button>
              <div className="field-stack"><label htmlFor="source-projection">Map projection</label><select id="source-projection" value={settings.sourceProjection} onChange={(event) => workshop.update({ sourceProjection: event.target.value as SourceProjection })}>{SOURCE_PROJECTION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><p className="projection-help">{sourceProjectionHint(settings.sourceProjection)}</p></div>
              {aspectWarning && <p className="input-warning" role="status">Accepted at this aspect ratio. Confirm the entire image represents 360° × 180°; otherwise the geography will be distorted.</p>}
            </section>
            <section className="control-section">
              <div className="section-heading"><span>02</span><div><h2>Globe format</h2><p>Shape and finished size</p></div></div>
              <div className="field-stack"><label htmlFor="gores">Number of gores</label><select id="gores" value={settings.goreCount} onChange={(event) => workshop.update({ goreCount: Number(event.target.value) as GoreCount })}>{[4, 6, 8, 12].map((count) => <option key={count} value={count}>{count} gores</option>)}</select></div>
              <div className="field-stack"><div className="field-label-row"><label htmlFor="diameter">Finished diameter</label><output htmlFor="diameter">{settings.diameter}&quot;</output></div><input id="diameter" type="range" min="2" max="8" step="0.5" value={settings.diameter} aria-describedby="diameter-help" onChange={(event) => workshop.update({ diameter: Number(event.target.value) })} /><p id="diameter-help" className="projection-help">Maximum for this paper: {workshop.maximumDiameter.toFixed(2)} in. Raster export: {EXPORT_DPI} DPI.</p></div>
              <div className="field-stack"><label htmlFor="paper">Paper size</label><select id="paper" value={settings.paperSize} onChange={(event) => workshop.update({ paperSize: event.target.value as PaperSize })}>{(Object.keys(PAPER) as PaperSize[]).map((size) => <option key={size} value={size}>{PAPER[size].label} · {PAPER[size].widthMm} × {PAPER[size].heightMm} mm</option>)}</select></div>
              {workshop.fitError && <p className="input-warning" role="alert">{workshop.fitError}</p>}
            </section>
            <section className="control-section line-settings"><div className="section-heading compact"><span>03</span><h2>Assembly marks</h2></div>{markOptions.map(([name, label]) => <CheckSetting key={name} id={name} label={label} checked={settings.marks[name]} disabled={name === 'dashedCutLines' && !settings.marks.cutLines} onChange={(checked) => workshop.setMark(name, checked)} />)}</section>
            <section className="control-section annotation-settings">
              <div className="section-heading"><span>04</span><div><h2>Notes &amp; legend</h2><p>Optional context for the printed globe</p></div></div>
              <CheckSetting id="description-box" label="Description box" checked={settings.descriptionEnabled} onChange={(descriptionEnabled) => workshop.update({ descriptionEnabled })} />
              {settings.descriptionEnabled && <div className="annotation-field"><label htmlFor="description-text">Globe description</label><textarea id="description-text" maxLength={240} value={settings.description} placeholder="What does this globe show?" onChange={(event) => workshop.update({ description: event.target.value })} /></div>}
              <CheckSetting id="custom-legend" label="Custom legend" checked={settings.legendEnabled} onChange={(legendEnabled) => workshop.update({ legendEnabled })} />
              {settings.legendEnabled && <div className="annotation-field"><label htmlFor="legend-text">Legend entries</label><textarea id="legend-text" maxLength={180} value={settings.legend} placeholder={'Blue = ocean\nGreen = forest'} onChange={(event) => workshop.update({ legend: event.target.value })} /></div>}
            </section>
            <div className="branding-control"><button type="button" className="branding-row" aria-expanded={brandingOpen} aria-controls="branding-fields" onClick={() => setBrandingOpen((open) => !open)}><span>Add a logo</span><span>{logo ? 'Added' : 'Optional'}</span></button>
              {brandingOpen && <div id="branding-fields" className="branding-fields">
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose logo file" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void workshop.chooseLogo(file); }} />
                <Button variant="outline" size="sm" onClick={() => logoInput.current?.click()}><ImagePlus />{workshop.logoLoading ? 'Checking logo…' : logo?.name ?? 'Upload authorized logo'}</Button>
                {(logo || workshop.logoLoading) && <Button variant="ghost" size="sm" onClick={workshop.removeLogo}>Remove logo</Button>}
                <div className="field-stack"><label htmlFor="logo-position">Position</label><select id="logo-position" value={settings.logoPosition} onChange={(event) => workshop.update({ logoPosition: event.target.value as LogoSettings['position'] })}><option value="north-pole">North Pole</option><option value="south-pole">South Pole</option><option value="equator">Near equator</option></select></div>
                <div className="field-stack"><label htmlFor="logo-size">Logo size: {Math.round(settings.logoScale * 100)}%</label><input id="logo-size" type="range" min="0.5" max="2" step="0.1" value={settings.logoScale} onChange={(event) => workshop.update({ logoScale: Number(event.target.value) })} /></div>
                <p>Still PNG, JPEG, or WebP only; up to 5 MiB and 1 megapixel. SVG is not accepted. Use only marks you are authorized to reproduce.</p>
              </div>}
            </div>
          </fieldset>
        </aside>
        <section className="preview-panel" aria-label="Paper globe preview">
          <div className="preview-toolbar"><Tabs value={workshop.mode} onValueChange={(value) => workshop.setMode(value as PreviewMode)}><TabsList className="preview-tabs"><TabsTrigger value="map">Map</TabsTrigger><TabsTrigger value="template">Template</TabsTrigger><TabsTrigger value="globe">Globe</TabsTrigger></TabsList></Tabs><Button variant="ghost" size="icon" aria-label="Reset view" title="Return to the northern template; keep source and settings" disabled={workshop.exporting} onClick={workshop.resetView}><RotateCcw /></Button></div>
          <div className="canvas-wrap" aria-busy={busy}>
            {workshop.mode === 'template' ? <GorePreview svg={workshop.previewSvg} label={`${hemisphereName} hemisphere, sheet ${settings.hemisphere === 'north' ? 1 : 2} of 2, ${settings.goreCount} gores, ${settings.diameter} inch target diameter`} /> : workshop.mode === 'map' ? (
              source ? <figure className="source-preview"><Image src={source.objectUrl} alt={`Uploaded world map: ${source.name}`} width={source.width} height={source.height} unoptimized /><figcaption>{source.name} · {source.width} × {source.height} px</figcaption></figure> : <p>Choose a world map to begin.</p>
            ) : <div className="globe-placeholder" aria-label="Illustrative globe only"><div className={`wire-globe ${source && settings.sourceProjection === 'equirectangular' ? 'textured' : ''}`} style={source && settings.sourceProjection === 'equirectangular' ? { backgroundImage: `url(${source.objectUrl})` } : undefined} /><strong>Illustration only — not a 3D projection</strong><span>This view does not verify geography, seam fit, or physical assembly. Use Template to inspect the projected output.</span></div>}
          </div>
          <div className="preview-footer">
            <div className="hemisphere-switch" role="group" aria-label="Preview hemisphere">{(['north', 'south'] as const).map((hemisphere) => <button key={hemisphere} type="button" disabled={workshop.exporting} aria-pressed={settings.hemisphere === hemisphere} className={settings.hemisphere === hemisphere ? 'active' : undefined} onClick={() => workshop.update({ hemisphere })}>{hemisphere === 'north' ? 'North' : 'South'}</button>)}</div>
            <div className="render-status" role="status" aria-live="polite">
              {workshop.exporting ? `Preparing print-quality output: ${Math.round(workshop.exportProgress * 100)}%` : workshop.isRendering ? `Projecting locally: ${Math.round((workshop.render?.progress ?? 0) * 100)}%` : workshop.ready ? `Sheet ${settings.hemisphere === 'north' ? 1 : 2} of 2 ready.` : workshop.render?.phase === 'failed' ? workshop.render.error : workshop.render?.phase === 'cancelled' ? 'Projection cancelled.' : 'Choose a map to begin.'}
            </div>
            {busy && <Button variant="ghost" size="sm" onClick={workshop.cancel}>Cancel</Button>}
            {!busy && source && !workshop.ready && <Button variant="outline" size="sm" onClick={workshop.retry}>Retry projection</Button>}
            <Button variant="outline" size="sm" onClick={() => { void workshop.exportTemplates('print'); }} disabled={!workshop.canExport}><Printer />Print / PDF</Button>
          </div>
        </section>
      </div>
    </main>
  );
}
