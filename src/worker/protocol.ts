import type { Step } from '../engine/hint.ts';
import type { SolveOptions, SolveStatus } from '../engine/solver.ts';
import type { GameState } from '../engine/state.ts';

export interface Analysis {
  status: SolveStatus;
  /** A winning line of play from the analysed position; empty unless winnable. */
  steps: Step[];
  explored: number;
}

export interface AnalyseRequest {
  id: number;
  state: GameState;
  options?: SolveOptions;
}

export interface AnalyseResponse {
  id: number;
  analysis: Analysis;
}

/** Analyses one position at a time: a new request abandons the one in flight. */
export interface Analyst {
  analyse(state: GameState, options?: SolveOptions): Promise<Analysis>;
  dispose(): void;
}
