'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RenderClient } from '../src/globe/render-client';
import { LatestResource, isAbort, throwIfAborted } from '../src/globe/lifecycle';
import { loadLogo, loadMap, type LogoResource, type MapResource } from '../src/globe/input';
import { createTemplateSvg, downloadSvg, exportFilename, openPrintSession, rasterDataUrl, type LogoSettings, type SvgOptions, type TemplateMarks } from '../src/globe/export';
import { exportSize, maximumDiameter, paperLayout, PREVIEW_SIZE, type PaperSize } from '../src/globe/paper';
import type { SourceProjection } from '../src/globe/source-projection';
import type { GoreCount, Hemisphere } from '../src/globe/geometry';

export type PreviewMode = 'map' | 'template' | 'globe';
export type Settings = {
  sourceProjection: SourceProjection; goreCount: GoreCount; hemisphere: Hemisphere;
  diameter: number; paperSize: PaperSize; marks: TemplateMarks;
  descriptionEnabled: boolean; description: string; legendEnabled: boolean; legend: string;
  logoPosition: LogoSettings['position']; logoScale: number;
};
export const DEFAULT_SETTINGS: Settings = {
  sourceProjection: 'equirectangular', goreCount: 6, hemisphere: 'north', diameter: 3.5, paperSize: 'letter',
  marks: { cutLines: true, dashedCutLines: false, foldLines: true, tabs: true },
  descriptionEnabled: false, description: '', legendEnabled: false, legend: '', logoPosition: 'south-pole', logoScale: 1,
};
type ExportOperation = { controller: AbortController; print?: ReturnType<typeof openPrintSession> };
type Notice = { kind: 'error' | 'success' | 'info'; text: string };
type RenderState = { key: string; phase: 'rendering' | 'ready' | 'failed' | 'cancelled'; progress: number; raster?: string; error?: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export function useWorkshop() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<PreviewMode>('template');
  const [source, setSource] = useState<MapResource>();
  const [logo, setLogo] = useState<LogoResource>();
  const [notice, setNotice] = useState<Notice>();
  const [loading, setLoading] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [render, setRender] = useState<RenderState>();
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const mapLoader = useMemo(() => new LatestResource<MapResource>((value) => URL.revokeObjectURL(value.objectUrl)), []);
  const logoLoader = useMemo(() => new LatestResource<LogoResource>(() => {}), []);
  const client = useRef<RenderClient | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const operation = useRef<ExportOperation | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      mapLoader.clear(); logoLoader.clear();
      operation.current?.controller.abort(); operation.current?.print?.close(); operation.current = null;
    };
  }, [mapLoader, logoLoader]);
  useEffect(() => {
    if (!source) return;
    const renderer = new RenderClient(source);
    client.current = renderer;
    return () => { renderer.dispose(); if (client.current === renderer) client.current = null; };
  }, [source]);
  const { goreCount, hemisphere, sourceProjection } = settings;
  const renderKey = `${source?.id ?? 0}:${sourceProjection}:${goreCount}:${hemisphere}:${retry}`;
  useEffect(() => {
    if (!source || !client.current) return;
    const controller = new AbortController(); previewAbort.current = controller;
    void client.current.render({ size: PREVIEW_SIZE, goreCount, hemisphere, sourceProjection }, controller.signal, (progress) => {
      if (!controller.signal.aborted) setRender({ key: renderKey, phase: 'rendering', progress });
    }).then((image) => rasterDataUrl(image, controller.signal)).then((raster) => {
      if (!controller.signal.aborted) setRender({ key: renderKey, phase: 'ready', progress: 1, raster });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isAbort(error)) {
        setRender({ key: renderKey, phase: 'failed', progress: 0, error: errorText(error) });
        setNotice({ kind: 'error', text: errorText(error) });
      }
    });
    return () => { controller.abort(); if (previewAbort.current === controller) previewAbort.current = null; };
  }, [source, goreCount, hemisphere, sourceProjection, renderKey]);

  let fitError: string | undefined;
  try { paperLayout(settings.diameter, settings.paperSize); } catch (error) { fitError = errorText(error); }
  const ready = Boolean(source && render?.key === renderKey && render.phase === 'ready');
  const isRendering = Boolean(source && (render?.key !== renderKey || render.phase === 'rendering'));
  const spec: SvgOptions = {
    goreCount, hemisphere, diameter: settings.diameter, paperSize: settings.paperSize, ...settings.marks,
    annotations: { description: settings.descriptionEnabled ? settings.description : undefined, legend: settings.legendEnabled ? settings.legend : undefined },
    logo: logo ? { dataUrl: logo.dataUrl, position: settings.logoPosition, scale: settings.logoScale } : undefined,
  };
  // A mismatched raster is never paired with new geometry or exported under new labels.
  const previewSvg = fitError ? undefined : createTemplateSvg({ ...spec, raster: ready ? render?.raster : undefined });
  const update = (patch: Partial<Settings>) => {
    setNotice(undefined);
    setSettings((previous) => ({ ...previous, ...patch }));
  };
  const setMark = (name: keyof TemplateMarks, checked: boolean) => setSettings((previous) => ({ ...previous, marks: { ...previous.marks, [name]: checked } }));

  const chooseMap = async (file?: File) => {
    if (!file || operation.current) return;
    setLoading(true); setNotice(undefined);
    const result = await mapLoader.load((signal) => loadMap(file, signal));
    if (!result || !mounted.current) return;
    setLoading(false);
    if ('error' in result) setNotice({ kind: 'error', text: errorText(result.error) });
    else { setSource(result.value); setMode('template'); setNotice({ kind: 'success', text: 'Map loaded locally. Confirm its projection and coverage before exporting.' }); }
  };
  const chooseLogo = async (file?: File) => {
    if (!file || operation.current) return;
    setLogoLoading(true); setNotice(undefined);
    const result = await logoLoader.load((signal) => loadLogo(file, signal));
    if (!result || !mounted.current) return;
    setLogoLoading(false);
    if ('error' in result) setNotice({ kind: 'error', text: errorText(result.error) });
    else { setLogo(result.value); setNotice({ kind: 'success', text: 'Logo added locally. Only reproduce marks you are authorized to use.' }); }
  };
  const removeLogo = () => { logoLoader.clear(); setLogo(undefined); setLogoLoading(false); setNotice({ kind: 'info', text: 'Logo removed.' }); };
  const resetView = () => { setMode('template'); update({ hemisphere: 'north' }); setNotice({ kind: 'info', text: 'View reset to the northern template. Your map, logo, and settings are unchanged.' }); };
  const cancel = () => {
    if (operation.current) { operation.current.controller.abort(); operation.current.print?.close(); }
    else { previewAbort.current?.abort(); client.current?.cancel(); setRender({ key: renderKey, phase: 'cancelled', progress: 0 }); }
    setNotice({ kind: 'info', text: 'Operation cancelled. Your map and settings are unchanged.' });
  };
  const exportTemplates = async (kind: 'svg' | 'print') => {
    if (operation.current) return;
    const renderer = client.current;
    if (!source || !renderer) { setNotice({ kind: 'error', text: 'Choose a world map before exporting.' }); return; }
    if (fitError) { setNotice({ kind: 'error', text: fitError }); return; }
    if (!ready || loading || logoLoading) { setNotice({ kind: 'info', text: 'Wait for the current image and projection to finish, or retry a failed render.' }); return; }
    const job: ExportOperation = { controller: new AbortController() };
    try {
      // Open synchronously while the user's click still permits a popup.
      if (kind === 'print') job.print = openPrintSession(settings.paperSize);
      operation.current = job; setExporting(true); setExportProgress(0); setNotice(undefined);
      const hemispheres: Hemisphere[] = kind === 'print' ? ['north', 'south'] : [hemisphere];
      const svgs: string[] = [];
      for (const [index, target] of hemispheres.entries()) {
        const image = await renderer.render({ size: exportSize(settings.diameter, settings.paperSize), goreCount, hemisphere: target, sourceProjection }, job.controller.signal, (fraction) => {
          if (!job.controller.signal.aborted) setExportProgress((index + fraction) / hemispheres.length);
        });
        const raster = await rasterDataUrl(image, job.controller.signal);
        throwIfAborted(job.controller.signal);
        svgs.push(createTemplateSvg({ ...spec, hemisphere: target, raster }));
      }
      throwIfAborted(job.controller.signal);
      if (job.print) await job.print.print(svgs, job.controller.signal);
      else downloadSvg(svgs[0], exportFilename(spec));
      if (mounted.current) setNotice({ kind: 'success', text: kind === 'print' ? 'Both sheets are ready. Print at 100% / actual size and measure the 1-inch scale check.' : `${hemisphere === 'north' ? 'Northern' : 'Southern'} SVG downloaded at print resolution.` });
    } catch (error) {
      job.print?.close();
      if (mounted.current && !isAbort(error)) setNotice({ kind: 'error', text: errorText(error) });
    } finally {
      if (operation.current === job) operation.current = null;
      if (mounted.current) setExporting(false);
    }
  };
  return {
    settings, update, setMark, mode, setMode, source, logo, notice, loading, logoLoading,
    chooseMap, chooseLogo, removeLogo, resetView, cancel, exportTemplates,
    retry: () => { setNotice(undefined); setRetry((value) => value + 1); }, render, ready, isRendering,
    exporting, exportProgress, previewSvg, fitError, maximumDiameter: maximumDiameter(settings.paperSize),
    canExport: ready && !loading && !logoLoading && !fitError && !exporting,
  };
}
