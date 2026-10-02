import { RasterPipeline, type PixelImage, type RenderRequest } from './raster';
import { abortError, throwIfAborted } from './lifecycle';
import type { WorkerOutput } from './render.worker';

type Job = {
  id: number; request: RenderRequest; controller: AbortController;
  resolve: (image: PixelImage) => void; reject: (error: unknown) => void;
  progress?: (fraction: number) => void; cleanup: () => void;
};
/** One source copy per worker lifetime, one live render; view mounting owns neither. */
export class RenderClient {
  private worker?: Worker;
  private readonly fallback: RasterPipeline;
  private current?: Job;
  private generation = 0;
  private disposed = false;
  constructor(source: PixelImage, options: { worker?: boolean } = {}) {
    this.fallback = new RasterPipeline(source);
    if (options.worker === false || typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
        const message = event.data;
        const job = this.current;
        if (!job || job.id !== message.id || job.controller.signal.aborted) return;
        if (message.kind === 'progress') job.progress?.(message.fraction);
        else if (message.kind === 'result') this.finish(job, message.image);
        else this.fail(job, new Error(message.message));
      };
      this.worker.onerror = (event) => {
        event.preventDefault();
        this.worker?.terminate(); this.worker = undefined;
        const job = this.current;
        if (job) this.runFallback(job);
      };
      // Structured cloning retains the bounded source for the tested fallback path.
      this.worker.postMessage({ kind: 'source', source });
    } catch {
      this.worker?.terminate(); this.worker = undefined;
    }
  }
  get executionMode() { return this.worker ? 'worker' : 'cooperative'; }
  render(request: RenderRequest, signal?: AbortSignal, progress?: (fraction: number) => void): Promise<PixelImage> {
    if (this.disposed) return Promise.reject(new Error('The source renderer has been released.'));
    throwIfAborted(signal);
    this.cancel();
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const job: Job = { id: ++this.generation, request, controller, resolve, reject, progress, cleanup: () => signal?.removeEventListener('abort', abort) };
      const abort = () => { if (this.current === job) this.cancel(); };
      this.current = job;
      signal?.addEventListener('abort', abort, { once: true });
      if (this.worker) {
        try { this.worker.postMessage({ kind: 'render', id: job.id, request }); }
        catch { this.worker.terminate(); this.worker = undefined; this.runFallback(job); }
      } else this.runFallback(job);
    });
  }
  private runFallback(job: Job) {
    void this.fallback.render(job.request, job.controller.signal, job.progress).then((image) => this.finish(job, image)).catch((error: unknown) => this.fail(job, error));
  }
  private finish(job: Job, image: PixelImage) {
    if (this.current !== job) return;
    job.cleanup(); this.current = undefined; job.resolve(image);
  }
  private fail(job: Job, error: unknown) {
    if (this.current !== job) return;
    job.cleanup(); this.current = undefined; job.reject(error);
  }
  cancel() {
    const job = this.current;
    if (!job) return;
    this.current = undefined;
    job.controller.abort(); job.cleanup();
    this.worker?.postMessage({ kind: 'cancel', id: job.id });
    job.reject(abortError());
  }
  dispose() { this.disposed = true; this.cancel(); this.worker?.terminate(); this.worker = undefined; }
}
