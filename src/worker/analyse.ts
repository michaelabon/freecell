import { type Step, toSteps } from '../engine/hint.ts';
import { refineLine } from '../engine/refine.ts';
import { type SolveOptions, solve } from '../engine/solver.ts';
import type { GameState } from '../engine/state.ts';
import type { Analysis, Analyst } from './protocol.ts';

// Refining a plan asks "is it still winnable if I do this instead?" several
// times over, so those checks only get the fast passes of the solver.
const QUICK: SolveOptions = { beamWidths: [48, 400], quickProofLimit: 0, proofLimit: 0 };

function quickLine(state: GameState): Step[] | null {
  const result = solve(state, QUICK);
  return result.status === 'winnable' ? toSteps(state, result.moves) : null;
}

export function analysePosition(state: GameState, options?: SolveOptions): Analysis {
  const result = solve(state, options);
  if (result.status !== 'winnable') return { status: result.status, steps: [], planLength: 0, explored: result.explored };
  const refined = refineLine(state, toSteps(state, result.moves), quickLine);
  return { status: 'winnable', ...refined, explored: result.explored };
}

/** Runs the solver on the calling thread, for tests and scripts. */
export class InlineAnalyst implements Analyst {
  analyse(state: GameState, options?: SolveOptions): Promise<Analysis> {
    return Promise.resolve(analysePosition(state, options));
  }
  dispose(): void {}
}
