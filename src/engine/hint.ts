import { type Card, cardLabel, rankOf, suitOf } from './cards.ts';
import {
  CASCADE_COUNT,
  FOUNDATION,
  type GameState,
  HOME0,
  type Move,
  canGoHome,
  cloneState,
  firstFreeCell,
  isCascade,
  locate,
  sourceCard,
} from './state.ts';
import { type SolverMove, applySolverMove, canonicalKey } from './solver.ts';
import { planStackMove } from './stackMove.ts';

export type Destination = { kind: 'home' } | { kind: 'cell' } | { kind: 'empty' } | { kind: 'onto'; card: Card };

// Steps name cards rather than columns so a line of play stays valid when the
// player reaches the same position with piles in different cells or columns.
export interface Step {
  card: Card;
  count: number;
  dest: Destination;
  /** Set when the card comes back down off a foundation. */
  fromHome?: true;
}

export function toSteps(start: GameState, moves: SolverMove[]): Step[] {
  const state = cloneState(start);
  return moves.map((move) => {
    const source = isCascade(move.from) ? state.cascades[move.from] : null;
    const card = source ? source[source.length - move.count] : sourceCard(state, move.from)!;
    let dest: Destination;
    if (move.to === FOUNDATION) dest = { kind: 'home' };
    else if (!isCascade(move.to)) dest = { kind: 'cell' };
    else {
      const target = state.cascades[move.to];
      dest = target.length ? { kind: 'onto', card: target[target.length - 1] } : { kind: 'empty' };
    }
    applySolverMove(state, move);
    const step: Step = { card, count: move.count, dest };
    if (move.from >= HOME0) step.fromHome = true;
    return step;
  });
}

/** Maps a step onto the columns and cells of `state`, or null when it no longer applies. */
export function resolveStep(state: GameState, step: Step): SolverMove | null {
  const { loc, index } = locate(state, step.card);
  let from = loc;
  if (loc === FOUNDATION) {
    const suit = suitOf(step.card);
    if (!step.fromHome || state.foundations[suit] !== rankOf(step.card) + 1) return null;
    if (step.dest.kind === 'home' || step.dest.kind === 'cell') return null;
    from = HOME0 + suit;
  } else if (step.fromHome) {
    return null;
  } else if (isCascade(loc) && state.cascades[loc].length - index !== step.count) {
    return null;
  }

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
  return to < 0 ? null : { from, to, count: step.count };
}

export function stepMoves(state: GameState, step: Step): Move[] | null {
  const move = resolveStep(state, step);
  if (!move) return null;
  if (move.count === 1) return [{ from: move.from, to: move.to }];
  return planStackMove(state, move.from, move.count, move.to);
}

export interface HintPlan {
  /** The next card the line of play adds to the foundations. */
  target: Card;
  /** The moves that get it there, ending with the one that sends it up. */
  steps: Step[];
}

// A line may bring cards down off a foundation and send them up again later.
// Those round trips are not progress, so the goal is the first card to go up
// that was never brought down. Held cards mark exactly that, and stay marked,
// which keeps the goal the same card from the first step of a plan to the last.
export function buildPlan(start: GameState, steps: Step[]): HintPlan | null {
  const state = cloneState(start);
  for (let i = 0; i < steps.length; i++) {
    const move = resolveStep(state, steps[i]);
    if (!move) return null;
    const before = state.foundations.slice();
    applySolverMove(state, move);
    if (move.to !== FOUNDATION) continue;
    if (!state.held.includes(steps[i].card)) return { target: steps[i].card, steps: steps.slice(0, i + 1) };
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = before[suit]; rank < state.foundations[suit]; rank++) {
        const card = rank * 4 + suit;
        if (!state.held.includes(card)) return { target: card, steps: steps.slice(0, i + 1) };
      }
    }
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
  | { kind: 'uncover'; card: Card }
  | { kind: 'clear'; card: Card; for: Card }
  | { kind: 'landing'; card: Card }
  | { kind: 'column' }
  | { kind: 'cell' }
  | { kind: 'chain'; cards: Card[] };

export function stepReasons(start: GameState, steps: Step[]): (Reason | null)[] {
  interface Info {
    step: Step;
    fromCell: boolean;
    moved: Card[];
    uncovered: Card | null;
    emptied: boolean;
    followers: Card[];
  }
  const state = cloneState(start);
  const infos: Info[] = [];
  for (const step of steps) {
    const move = resolveStep(state, step);
    if (!move) break;
    const source = isCascade(move.from) ? state.cascades[move.from] : null;
    const moved = source ? source.slice(source.length - move.count) : [step.card];
    const remaining = source ? source.length - move.count : 0;
    const before = state.foundations.slice();
    applySolverMove(state, move);
    const followers: Card[] = [];
    if (move.to === FOUNDATION) {
      for (let suit = 0; suit < 4; suit++) {
        for (let rank = before[suit]; rank < state.foundations[suit]; rank++) {
          if (rank * 4 + suit !== step.card) followers.push(rank * 4 + suit);
        }
      }
    }
    infos.push({
      step,
      fromCell: source === null && move.from < FOUNDATION,
      moved,
      uncovered: source && remaining > 0 ? source[remaining - 1] : null,
      emptied: source !== null && remaining === 0,
      followers,
    });
  }

  return steps.map((step, i) => {
    const info = infos[i];
    if (!info) return null;
    if (step.dest.kind === 'home') return info.followers.length > 0 ? { kind: 'chain', cards: info.followers } : null;
    const later = infos.slice(i + 1);
    const uncovered = info.uncovered;
    if (uncovered !== null) {
      if (later.some((l) => l.moved.includes(uncovered))) return { kind: 'uncover', card: uncovered };
      const needs = later.find((l) => l.step.dest.kind === 'onto' && l.step.dest.card === uncovered);
      if (needs) return { kind: 'clear', card: uncovered, for: needs.step.card };
    }
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
    case 'chain': {
      const { cards } = reason;
      if (cards.length > 3) return [`takes ${cards.length} more cards up with it`];
      const parts: (string | Card)[] = ['takes the '];
      cards.forEach((card, i) => {
        if (i > 0) parts.push(i === cards.length - 1 ? ' and the ' : ', the ');
        parts.push(card);
      });
      return [...parts, ' up with it'];
    }
  }
}

/** A step as prose, with cards left as values so the UI can draw them. */
export function stepParts(step: Step): (string | Card)[] {
  const riders = step.count - 1;
  const stack: (string | Card)[] = ['the ', step.card];
  if (riders > 0) stack.push(riders === 1 ? ' and the card on it' : ` and the ${riders} cards on it`);
  if (step.fromHome) {
    const where: (string | Card)[] = step.dest.kind === 'onto' ? [' onto the ', step.dest.card] : [' into an empty column'];
    return ['Bring ', ...stack, ' back down', ...where];
  }
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
