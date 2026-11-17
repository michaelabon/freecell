import type { SolveOptions } from '../engine/solver.ts';
import type { GameState } from '../engine/state.ts';
import type { Analysis, AnalyseRequest, AnalyseResponse, Analyst } from './protocol.ts';

export class WorkerAnalyst implements Analyst {
  private worker: Worker | null = null;
  private busy = false;
  private nextId = 1;

  private spawn(): Worker {
    return new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  }

  analyse(state: GameState, options?: SolveOptions): Promise<Analysis> {
    // The search runs to completion without yielding, so the only way to
    // abandon a stale position is to replace the worker.
    if (this.busy) {
      this.worker?.terminate();
      this.worker = null;
    }
    const worker = (this.worker ??= this.spawn());
    const id = this.nextId++;
    this.busy = true;
    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<AnalyseResponse>) => {
        if (event.data.id !== id) return;
        this.busy = false;
        resolve(event.data.analysis);
      };
      worker.onerror = (event) => {
        this.busy = false;
        reject(new Error(event.message));
      };
      const request: AnalyseRequest = { id, state, options };
      worker.postMessage(request);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
}
