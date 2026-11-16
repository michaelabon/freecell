import { type Card, RANK_NAMES, canStack, cardLabel, isRed, rankOf } from './cards.ts';
import {
  CASCADE_COUNT,
  CELL0,
  FOUNDATION,
  type GameState,
  type Move,
  applyMove,
  autoHome,
  canGoHome,
  cloneState,
  emptyCascadeCount,
  firstFreeCell,
  freeCellCount,
  isCascade,
  isCell,
  locate,
  runLength,
} from './state.ts';
import { planStackMove, stackCapacity } from './stackMove.ts';

export type Refusal =
  | { kind: 'ignored' }
  | { kind: 'buried'; card: Card; blocker: Card; under: Card }
  | { kind: 'nowhere'; card: Card; count: number }
  | { kind: 'no-room'; card: Card; count: number; freeCells: number; emptyCascades: number }
  | { kind: 'bad-stack'; card: Card; onto: Card }
  | { kind: 'cell-taken' }
  | { kind: 'cell-single' }
  | { kind: 'home-single' }
  | { kind: 'home-order'; card: Card };

export type Attempt = { ok: true; moves: Move[] } | { ok: false; refusal: Refusal };

const refuse = (refusal: Refusal): Attempt => ({ ok: false, refusal });
const accept = (moves: Move[]): Attempt => ({ ok: true, moves });

interface Grab {
  loc: number;
  count: number;
}

function grab(state: GameState, card: Card): Grab | Refusal {
  const { loc, index } = locate(state, card);
  if (loc === FOUNDATION) return { kind: 'ignored' };
  if (isCell(loc)) return { loc, count: 1 };
  const cascade = state.cascades[loc];
  const count = cascade.length - index;
  if (count > runLength(cascade)) {
    let i = index + 1;
    while (canStack(cascade[i], cascade[i - 1])) i++;
    return { kind: 'buried', card, blocker: cascade[i], under: cascade[i - 1] };
  }
  return { loc, count };
}

function noRoom(state: GameState, card: Card, count: number, to: number): Refusal {
  const emptyCascades = emptyCascadeCount(state) - (state.cascades[to].length === 0 ? 1 : 0);
  return { kind: 'no-room', card, count, freeCells: freeCellCount(state), emptyCascades };
}

/** Works out where a clicked card should go, picking the most useful legal destination. */
export function resolveClick(state: GameState, card: Card): Attempt {
  const grabbed = grab(state, card);
  if ('kind' in grabbed) return refuse(grabbed);
  const { loc, count } = grabbed;

  if (count === 1 && canGoHome(state, card)) return accept([{ from: loc, to: FOUNDATION }]);

  const stackTargets: number[] = [];
  const emptyTargets: number[] = [];
  for (let c = 0; c < CASCADE_COUNT; c++) {
    if (c === loc) continue;
    const cascade = state.cascades[c];
    if (cascade.length === 0) emptyTargets.push(c);
    else if (canStack(card, cascade[cascade.length - 1])) stackTargets.push(c);
  }
  stackTargets.sort((a, b) => runLength(state.cascades[b]) - runLength(state.cascades[a]));

  const wholeColumn = isCascade(loc) && state.cascades[loc].length === count;
  const usableEmpties = wholeColumn ? [] : emptyTargets.slice(0, 1);
  const cell = isCascade(loc) && count === 1 ? firstFreeCell(state) : -1;
  const kingFirst = rankOf(card) === 12;

  if (isCell(loc)) {
    const to = stackTargets[0] ?? emptyTargets[0];
    return to === undefined ? refuse({ kind: 'nowhere', card, count }) : accept([{ from: loc, to }]);
  }

  for (const to of stackTargets) {
    const moves = planStackMove(state, loc, count, to);
    if (moves) return accept(moves);
  }
  if (cell >= 0 && !kingFirst) return accept([{ from: loc, to: cell }]);
  for (const to of usableEmpties) {
    const moves = planStackMove(state, loc, count, to);
    if (moves) return accept(moves);
  }
  if (cell >= 0) return accept([{ from: loc, to: cell }]);

  const wanted = stackTargets[0] ?? usableEmpties[0];
  if (wanted === undefined) return refuse({ kind: 'nowhere', card, count });
  return refuse(noRoom(state, card, count, wanted));
}

/** Validates dropping a card (and whatever sits on it) onto a specific location. */
export function resolveDrop(state: GameState, card: Card, to: number): Attempt {
  const grabbed = grab(state, card);
  if ('kind' in grabbed) return refuse(grabbed);
  const { loc, count } = grabbed;
  if (loc === to) return refuse({ kind: 'ignored' });

  if (to === FOUNDATION) {
    if (count > 1) return refuse({ kind: 'home-single' });
    return canGoHome(state, card) ? accept([{ from: loc, to }]) : refuse({ kind: 'home-order', card });
  }
  if (isCell(to)) {
    if (count > 1) return refuse({ kind: 'cell-single' });
    return state.cells[to - CELL0] === null ? accept([{ from: loc, to }]) : refuse({ kind: 'cell-taken' });
  }
  const target = state.cascades[to];
  if (target.length > 0 && !canStack(card, target[target.length - 1])) {
    return refuse({ kind: 'bad-stack', card, onto: target[target.length - 1] });
  }
  if (isCell(loc)) return accept([{ from: loc, to }]);
  const moves = planStackMove(state, loc, count, to);
  return moves ? accept(moves) : refuse(noRoom(state, card, count, to));
}

export interface Played {
  state: GameState;
  /** The player's moves followed by the cards that went home by themselves. */
  moves: Move[];
  /** Index in `moves` of the first card that went home by itself. */
  autoFrom: number;
}

/** Applies a player's moves to a copy of the state, then sends every safe card home. */
export function play(state: GameState, moves: Move[]): Played {
  const next = cloneState(state);
  for (const move of moves) applyMove(next, move);
  return { state: next, moves: [...moves, ...autoHome(next)], autoFrom: moves.length };
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function parentName(card: Card): string | null {
  if (rankOf(card) === 12) return null;
  const name = RANK_NAMES[rankOf(card) + 1];
  return `${isRed(card) ? 'a black' : 'a red'} ${name}`;
}

export function explain(refusal: Refusal): string {
  switch (refusal.kind) {
    case 'ignored':
      return '';
    case 'buried':
      return `The ${cardLabel(refusal.blocker)} can't ride on the ${cardLabel(refusal.under)}, so this stack can't move as one. Cards only move together when they count down in alternating colours.`;
    case 'nowhere': {
      const parent = parentName(refusal.card);
      const label = cardLabel(refusal.card);
      if (refusal.count > 1) {
        return parent
          ? `Nowhere for this stack to go yet. The ${label} needs ${parent} or an empty column.`
          : `Nowhere for this stack to go yet. A king can only lead a stack into an empty column.`;
      }
      return parent
        ? `Nowhere for the ${label} to go yet. It needs ${parent}, an empty column, or a free cell.`
        : `Nowhere for the ${label} to go yet. A king needs an empty column or a free cell.`;
    }
    case 'no-room': {
      const { count, freeCells, emptyCascades } = refusal;
      const needed = Math.ceil(count / (1 << emptyCascades)) - 1;
      const movable = stackCapacity(freeCells, emptyCascades);
      const have = `you have ${freeCells === 0 ? 'none' : freeCells} open`;
      const now = `Right now you can move ${plural(movable, 'card')} at a time.`;
      if (needed > 4) {
        return `A stack of ${count} is too big to move, even with every free cell open. Each empty column doubles how many cards can move at once. ${now}`;
      }
      const helpers = emptyCascades > 0 ? ` alongside your ${plural(emptyCascades, 'empty column')}` : '';
      return `A stack of ${count} needs ${plural(needed, 'free cell')}${helpers}, and ${have}. ${now}`;
    }
    case 'bad-stack': {
      const parent = parentName(refusal.card);
      const needs = parent ? `It needs ${parent}.` : 'A king only fits in an empty column.';
      return `The ${cardLabel(refusal.card)} can't go on the ${cardLabel(refusal.onto)}. ${needs}`;
    }
    case 'cell-taken':
      return 'That free cell is taken.';
    case 'cell-single':
      return 'A free cell holds just one card.';
    case 'home-single':
      return 'Cards go up to the foundation one at a time.';
    case 'home-order': {
      const rank = rankOf(refusal.card);
      if (rank === 0) return '';
      return `The ${cardLabel(refusal.card)} can't go up yet. The ${cardLabel(refusal.card - 4)} has to get there first.`;
    }
  }
}
