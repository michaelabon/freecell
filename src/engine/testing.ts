import fc from 'fast-check';
import { deal } from './deal.ts';
import { applySolverMove, legalMoves } from './solver.ts';
import { type GameState, autoHome } from './state.ts';

/** A reachable position: a numbered deal followed by an arbitrary run of legal moves. */
export function walk(dealNumber: number, picks: number[]): GameState {
  const state = deal(dealNumber);
  autoHome(state);
  for (const pick of picks) {
    const moves = legalMoves(state);
    if (moves.length === 0) break;
    applySolverMove(state, moves[pick % moves.length]);
  }
  return state;
}

export const reachableState = fc
  .tuple(fc.integer({ min: 1, max: 1_000_000 }), fc.array(fc.nat(1000), { maxLength: 60 }))
  .map(([dealNumber, picks]) => walk(dealNumber, picks));
