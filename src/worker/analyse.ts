import { toSteps } from '../engine/hint.ts';
import { type SolveOptions, solve } from '../engine/solver.ts';
import { type GameState, autoHome, cloneState } from '../engine/state.ts';
import type { Analysis, Analyst } from './protocol.ts';

export function analysePosition(state: GameState, options?: SolveOptions): Analysis {
  const root = cloneState(state);
  autoHome(root);
  const result = solve(root, options);
  return { status: result.status, steps: toSteps(root, result.moves), explored: result.explored };
}

/** Runs the solver on the calling thread, for tests and scripts. */
export class InlineAnalyst implements Analyst {
  analyse(state: GameState, options?: SolveOptions): Promise<Analysis> {
    return Promise.resolve(analysePosition(state, options));
  }
  dispose(): void {}
}
