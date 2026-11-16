import fc from 'fast-check';
import { play } from './actions.ts';
import { deal } from './deal.ts';
import { type Step, stepMoves } from './hint.ts';
import { applySolverMove, legalMoves } from './solver.ts';
import { type GameState, applyMove, assertValid, autoHome, canMove, cloneState } from './state.ts';

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

/** Plays steps through the same single-card path the game uses, checking every move. */
export function playOut(start: GameState, steps: Step[]): GameState {
  let state = start;
  for (const step of steps) {
    const moves = stepMoves(state, step);
    if (!moves) throw new Error('Step cannot be carried out');
    const check = cloneState(state);
    for (const move of moves) {
      if (!canMove(check, move)) throw new Error('Step breaks the rules');
      applyMove(check, move);
    }
    state = play(state, moves).state;
    assertValid(state);
  }
  return state;
}

export function dealt(dealNumber: number): GameState {
  const state = deal(dealNumber);
  autoHome(state);
  return state;
}
