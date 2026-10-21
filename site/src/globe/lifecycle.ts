export function abortError() { return new DOMException('Operation cancelled.', 'AbortError'); }
export function throwIfAborted(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }
export function isAbort(error: unknown) { return error instanceof Error && error.name === 'AbortError'; }

/** Owns exactly one accepted resource. Stale successes are released, stale errors ignored. */
export class LatestResource<T> {
  private generation = 0;
  private controller?: AbortController;
  private value?: T;
  constructor(private readonly release: (value: T) => void) {}
  async load(task: (signal: AbortSignal) => Promise<T>): Promise<{ value: T } | { error: unknown } | undefined> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const value = await task(controller.signal);
      if (generation !== this.generation || controller.signal.aborted) { this.release(value); return undefined; }
      if (this.value !== undefined) this.release(this.value);
      this.value = value;
      return { value };
    } catch (error) {
      if (generation !== this.generation || controller.signal.aborted) return undefined;
      return { error };
    }
  }
  clear() {
    this.generation += 1;
    this.controller?.abort();
    if (this.value !== undefined) this.release(this.value);
    this.value = undefined;
  }
}

/** Cooperative fallback and worker scheduler; each row is a cancellable unit. */
export async function runCooperatively<T>(iterator: Generator<number, T>, signal?: AbortSignal, progress?: (fraction: number) => void): Promise<T> {
  let lastReport = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const deadline = performance.now() + 8;
      do {
        throwIfAborted(signal);
        const step = iterator.next();
        if (step.done) { progress?.(1); return step.value; }
        if (performance.now() - lastReport > 100) { progress?.(step.value); lastReport = performance.now(); }
      } while (performance.now() < deadline);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    iterator.return(undefined as T);
  }
}
