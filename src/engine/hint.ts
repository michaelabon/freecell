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

/** What a step is for, in terms of the steps that come after it. */
export type Reason =
  | { kind: 'release'; card: Card }
  | { kind: 'uncover'; card: Card }
  | { kind: 'clear'; card: Card; for: Card }
  | { kind: 'landing'; card: Card }
  | { kind: 'column' }
  | { kind: 'cell' };

export function stepReasons(start: GameState, steps: Step[]): (Reason | null)[] {
  interface Info {
    step: Step;
    fromCell: boolean;
    moved: Card[];
    uncovered: Card | null;
    emptied: boolean;
    released: Card | null;
  }
  const state = cloneState(start);
  const infos: Info[] = [];
  for (const step of steps) {
    const move = resolveStep(state, step);
    if (!move) break;
    const source = isCascade(move.from) ? state.cascades[move.from] : null;
    const moved = source ? source.slice(source.length - move.count) : [step.card];
    applyStackMove(state, move);
    const auto = nextAutoMove(state);
    infos.push({
      step,
      fromCell: source === null,
      moved,
      uncovered: source && source.length > 0 ? source[source.length - 1] : null,
      emptied: source !== null && source.length === 0,
      released: auto ? sourceCard(state, auto.from) : null,
    });
    autoHome(state);
  }

  return steps.map((step, i) => {
    const info = infos[i];
    if (!info || step.dest.kind === 'home') return null;
    if (info.released !== null) return { kind: 'release', card: info.released };
    const later = infos.slice(i + 1);
    const uncovered = info.uncovered;
    if (uncovered !== null && later.some((l) => l.moved.includes(uncovered))) return { kind: 'uncover', card: uncovered };
    const needs = uncovered === null ? undefined : later.find((l) => l.step.dest.kind === 'onto' && l.step.dest.card === uncovered);
    if (needs) return { kind: 'clear', card: uncovered!, for: needs.step.card };
    const top = info.moved[info.moved.length - 1];
    const lander = later.find((l) => l.step.dest.kind === 'onto' && l.step.dest.card === top);
    if (lander) return { kind: 'landing', card: lander.step.card };
    if (info.emptied && later.some((l) => l.step.dest.kind === 'empty')) return { kind: 'column' };
    if (info.fromCell && later.some((l) => l.step.dest.kind === 'cell')) return { kind: 'cell' };
    return null;
  });
}

export function reasonParts(reason: Reason): (string | Card)[] {
  switch (reason.kind) {
    case 'release':
      return ['frees the ', reason.card, ' to go home'];
    case 'uncover':
      return ['uncovers the ', reason.card];
    case 'clear':
      return ['clears the ', reason.card, ' for the ', reason.for];
    case 'landing':
      return ['makes a place for the ', reason.card];
    case 'column':
      return ['opens up a column'];
    case 'cell':
      return ['frees a cell'];
  }
}

/** A step as prose, with cards left as values so the UI can draw them. */
export function stepParts(step: Step): (string | Card)[] {
  const riders = step.count - 1;
  const stack: (string | Card)[] = ['the ', step.card];
  if (riders > 0) stack.push(riders === 1 ? ' and the card on it' : ` and the ${riders} cards on it`);
  switch (step.dest.kind) {
    case 'home':
      return ['Send ', ...stack, ' up to the foundation'];
    case 'cell':
      return ['Park ', ...stack, ' in a free cell'];
    case 'empty':
      return ['Move ', ...stack, ' to an empty column'];
    case 'onto':
      return ['Move ', ...stack, ' onto the ', step.dest.card];
  }
}

export function describeStep(step: Step): string {
  return stepParts(step)
    .map((part) => (typeof part === 'string' ? part : cardLabel(part)))
    .join('');
}
