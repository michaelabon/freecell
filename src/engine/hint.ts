import { type Card, cardLabel } from './cards.ts';
import {
  CASCADE_COUNT,
  CELL0,
  FOUNDATION,
  type GameState,
  type Move,
  autoHome,
  canGoHome,
  cloneState,
  firstFreeCell,
  isCascade,
  locate,
  nextAutoMove,
  sourceCard,
} from './state.ts';
import { type SolverMove, applySolverMove, applyStackMove, canonicalKey } from './solver.ts';
import { planStackMove } from './stackMove.ts';

export type Destination = { kind: 'home' } | { kind: 'cell' } | { kind: 'empty' } | { kind: 'onto'; card: Card };

// Steps name cards rather than columns so a line of play stays valid when the
// player reaches the same position with piles in different cells or columns.
export interface Step {
  card: Card;
  count: number;
  dest: Destination;
}

export function toSteps(start: GameState, moves: SolverMove[]): Step[] {
  const state = cloneState(start);
  return moves.map((move) => {
    const source = isCascade(move.from) ? state.cascades[move.from] : null;
    const card = source ? source[source.length - move.count] : state.cells[move.from - CELL0]!;
    let dest: Destination;
    if (move.to === FOUNDATION) dest = { kind: 'home' };
    else if (!isCascade(move.to)) dest = { kind: 'cell' };
    else {
      const target = state.cascades[move.to];
      dest = target.length ? { kind: 'onto', card: target[target.length - 1] } : { kind: 'empty' };
    }
    applySolverMove(state, move);
    return { card, count: move.count, dest };
  });
}

/** Maps a step onto the columns and cells of `state`, or null when it no longer applies. */
export function resolveStep(state: GameState, step: Step): SolverMove | null {
  const { loc, index } = locate(state, step.card);
  if (loc === FOUNDATION) return null;
  if (isCascade(loc) && state.cascades[loc].length - index !== step.count) return null;

  let to = -1;
  switch (step.dest.kind) {
    case 'home':
      to = canGoHome(state, step.card) ? FOUNDATION : -1;
      break;
    case 'cell':
      to = firstFreeCell(state);
      break;
    case 'empty':
      for (let c = 0; c < CASCADE_COUNT && to < 0; c++) {
        if (c !== loc && state.cascades[c].length === 0) to = c;
      }
      break;
    case 'onto': {
      const onto = locate(state, step.dest.card);
      if (isCascade(onto.loc) && onto.index === state.cascades[onto.loc].length - 1) to = onto.loc;
      break;
    }
  }
  return to < 0 ? null : { from: loc, to, count: step.count };
}

export function stepMoves(state: GameState, step: Step): Move[] | null {
  const move = resolveStep(state, step);
  if (!move) return null;
  if (move.count === 1) return [{ from: move.from, to: move.to }];
  return planStackMove(state, move.from, move.count, move.to);
}

export interface HintPlan {
  /** The next card the line of play sends to the foundation. */
  target: Card;
  /** The moves that get it there. */
  steps: Step[];
}

export function buildPlan(start: GameState, steps: Step[]): HintPlan | null {
  const state = cloneState(start);
  for (let i = 0; i < steps.length; i++) {
    const move = resolveStep(state, steps[i]);
    if (!move) return null;
    applyStackMove(state, move);
    let target: Card | null = move.to === FOUNDATION ? steps[i].card : null;
    if (target === null) {
      const auto = nextAutoMove(state);
      if (auto) target = sourceCard(state, auto.from);
    }
    if (target !== null) return { target, steps: steps.slice(0, i + 1) };
    autoHome(state);
  }
  return null;
}

/** The position key reached by playing `step`, used to tell whether the player followed it. */
export function keyAfter(start: GameState, step: Step): string | null {
  const move = resolveStep(start, step);
  if (!move) return null;
  const state = cloneState(start);
  applySolverMove(state, move);
  return canonicalKey(state);
}

export function describeStep(step: Step): string {
  const label = cardLabel(step.card);
  const what = step.count > 1 ? `the ${label} and the ${step.count - 1 === 1 ? 'card' : `${step.count - 1} cards`} on it` : `the ${label}`;
  switch (step.dest.kind) {
    case 'home':
      return `Send ${what} up to the foundation`;
    case 'cell':
      return `Park ${what} in a free cell`;
    case 'empty':
      return `Move ${what} to an empty column`;
    case 'onto':
      return `Move ${what} onto the ${cardLabel(step.dest.card)}`;
  }
}
