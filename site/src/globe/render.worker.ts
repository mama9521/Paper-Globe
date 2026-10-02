import { RasterPipeline, type PixelImage, type RenderRequest } from './raster';
import { isAbort } from './lifecycle';

export type WorkerInput =
  | { kind: 'source'; source: PixelImage }
  | { kind: 'render'; id: number; request: RenderRequest }
  | { kind: 'cancel'; id: number };
export type WorkerOutput =
  | { kind: 'progress'; id: number; fraction: number }
  | { kind: 'result'; id: number; image: PixelImage }
  | { kind: 'error'; id: number; message: string };

// A structural type avoids mixing lib.dom and lib.webworker globals in the app's tsconfig.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerInput>) => void) | null;
  postMessage: (message: WorkerOutput, transfer?: Transferable[]) => void;
};
let pipeline: RasterPipeline | undefined;
let current: { id: number; controller: AbortController } | undefined;
scope.onmessage = (event) => {
  const message = event.data;
  if (message.kind === 'source') {
    current?.controller.abort();
    pipeline = new RasterPipeline(message.source);
    return;
  }
  if (message.kind === 'cancel') {
    if (current?.id === message.id) current.controller.abort();
    return;
  }
  current?.controller.abort();
  const job = { id: message.id, controller: new AbortController() };
  current = job;
  if (!pipeline) { scope.postMessage({ kind: 'error', id: job.id, message: 'Load a source before rendering.' }); return; }
  void pipeline.render(message.request, job.controller.signal, (fraction) => {
    if (!job.controller.signal.aborted) scope.postMessage({ kind: 'progress', id: job.id, fraction });
  }).then((image) => {
    if (!job.controller.signal.aborted) scope.postMessage({ kind: 'result', id: job.id, image }, [image.pixels.buffer as ArrayBuffer]);
  }).catch((error: unknown) => {
    if (!isAbort(error)) scope.postMessage({ kind: 'error', id: job.id, message: error instanceof Error ? error.message : 'Rendering failed.' });
  });
};
