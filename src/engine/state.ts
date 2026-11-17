import { type Card, canStack, isRed, rankOf, suitOf } from './cards.ts';

export const CASCADE_COUNT = 8;
export const CELL_COUNT = 4;
export const CELL0 = CASCADE_COUNT;
export const FOUNDATION = CELL0 + CELL_COUNT;
/** Source locations for taking the top card back off a foundation: HOME0 + suit. */
export const HOME0 = FOUNDATION + 1;

export interface GameState {
  cascades: Card[][];
  cells: (Card | null)[];
  /** Indexed by suit: how many cards of that suit are home. */
  foundations: number[];
  /** Cards the player took back off a foundation, which never go up by themselves again. */
  held: Card[];
}

/**
 * Moves the single card on top of `from`. Locations: 0..7 cascades, 8..11
 * cells, 12 the foundation as a destination, 13..16 a foundation as a source.
 */
export interface Move {
  from: number;
  to: number;
}

export const isCascade = (loc: number): boolean => loc < CELL0;
export const isCell = (loc: number): boolean => loc >= CELL0 && loc < FOUNDATION;

export function emptyState(): GameState {
  return {
    cascades: Array.from({ length: CASCADE_COUNT }, () => []),
    cells: Array.from({ length: CELL_COUNT }, () => null),
    foundations: [0, 0, 0, 0],
    held: [],
  };
}

export function cloneState(state: GameState): GameState {
  return {
    cascades: state.cascades.map((cascade) => cascade.slice()),
    cells: state.cells.slice(),
    foundations: state.foundations.slice(),
    held: state.held.length ? state.held.slice() : [],
  };
}

export function sourceCard(state: GameState, loc: number): Card | null {
  if (isCascade(loc)) {
    const cascade = state.cascades[loc];
    return cascade.length ? cascade[cascade.length - 1] : null;
  }
  if (isCell(loc)) return state.cells[loc - CELL0];
  if (loc >= HOME0) {
    const suit = loc - HOME0;
    const count = state.foundations[suit];
    return count > 0 ? (count - 1) * 4 + suit : null;
  }
  return null;
}

export const canGoHome = (state: GameState, card: Card): boolean =>
  state.foundations[suitOf(card)] === rankOf(card);

export function canPlace(state: GameState, card: Card, to: number): boolean {
  if (to === FOUNDATION) return canGoHome(state, card);
  if (isCell(to)) return state.cells[to - CELL0] === null;
  const cascade = state.cascades[to];
  return cascade.length === 0 || canStack(card, cascade[cascade.length - 1]);
}

export function canMove(state: GameState, move: Move): boolean {
  if (move.from === move.to || move.from === FOUNDATION || move.from < 0 || move.from > HOME0 + 3) return false;
  if (move.to < 0 || move.to > FOUNDATION) return false;
  // A card only comes back off a foundation onto a cascade.
  if (move.from >= HOME0 && !isCascade(move.to)) return false;
  const card = sourceCard(state, move.from);
  return card !== null && canPlace(state, card, move.to);
}

/** Mutates `state`. The move must be legal. */
export function applyMove(state: GameState, move: Move): void {
  let card: Card;
  if (isCascade(move.from)) {
    card = state.cascades[move.from].pop()!;
  } else if (isCell(move.from)) {
    card = state.cells[move.from - CELL0]!;
    state.cells[move.from - CELL0] = null;
  } else {
    const suit = move.from - HOME0;
    card = --state.foundations[suit] * 4 + suit;
    if (!state.held.includes(card)) state.held.push(card);
  }
  if (move.to === FOUNDATION) state.foundations[suitOf(card)]++;
  else if (isCell(move.to)) state.cells[move.to - CELL0] = card;
  else state.cascades[move.to].push(card);
}

/** Where a card can be picked up from, or -1 when it is buried or home. */
export function accessibleAt(state: GameState, card: Card): number {
  const cell = state.cells.indexOf(card);
  if (cell >= 0) return CELL0 + cell;
  for (let c = 0; c < CASCADE_COUNT; c++) {
    const cascade = state.cascades[c];
    if (cascade.length > 0 && cascade[cascade.length - 1] === card) return c;
  }
  return -1;
}

/**
 * Mutates `state` after `card` went home from `from`, sending up each card
 * that this made playable: the next card of the suit if it is in reach, and
 * the card it uncovered. Each of those can set off more. Held cards stay put.
 */
export function chainHome(state: GameState, card: Card, from: number): Move[] {
  const moves: Move[] = [];
  const pending: { card: Card; from: number }[] = [{ card, from }];
  const send = (next: Card, at: number): void => {
    if (at < 0 || state.held.includes(next) || !canGoHome(state, next)) return;
    const move = { from: at, to: FOUNDATION };
    applyMove(state, move);
    moves.push(move);
    pending.push({ card: next, from: at });
  };
  for (let event = pending.shift(); event; event = pending.shift()) {
    if (rankOf(event.card) < 12) send(event.card + 4, accessibleAt(state, event.card + 4));
    if (isCascade(event.from)) {
      const cascade = state.cascades[event.from];
      if (cascade.length > 0) send(cascade[cascade.length - 1], event.from);
    }
  }
  return moves;
}

// Nothing still in play could need to sit on this card: every opposite-colour
// card one rank lower is home, or can itself go home without stranding
// anything (which is what the second clause checks).
export function isUnneeded(state: GameState, card: Card): boolean {
  const rank = rankOf(card);
  const f = state.foundations;
  const oppositeMin = isRed(card) ? Math.min(f[0], f[3]) : Math.min(f[1], f[2]);
  return oppositeMin >= rank || (oppositeMin >= rank - 1 && f[3 - suitOf(card)] >= rank - 2);
}

export const isSafeHome = (state: GameState, card: Card): boolean => canGoHome(state, card) && isUnneeded(state, card);

export const homeCount = (state: GameState): number =>
  state.foundations[0] + state.foundations[1] + state.foundations[2] + state.foundations[3];

export const isWon = (state: GameState): boolean => homeCount(state) === 52;

export function freeCellCount(state: GameState): number {
  let count = 0;
  for (const cell of state.cells) if (cell === null) count++;
  return count;
}

export function emptyCascadeCount(state: GameState): number {
  let count = 0;
  for (const cascade of state.cascades) if (cascade.length === 0) count++;
  return count;
}

export function firstFreeCell(state: GameState): number {
  const index = state.cells.indexOf(null);
  return index < 0 ? -1 : CELL0 + index;
}

export interface CardPosition {
  loc: number;
  /** Depth in a cascade (0 is the bottom card); 0 elsewhere. */
  index: number;
}

export function locate(state: GameState, card: Card): CardPosition {
  if (rankOf(card) < state.foundations[suitOf(card)]) return { loc: FOUNDATION, index: 0 };
  const cell = state.cells.indexOf(card);
  if (cell >= 0) return { loc: CELL0 + cell, index: 0 };
  for (let c = 0; c < CASCADE_COUNT; c++) {
    const index = state.cascades[c].indexOf(card);
    if (index >= 0) return { loc: c, index };
  }
  throw new Error(`Card ${card} is not in the state`);
}

/** Length of the alternating-colour descending run on top of a cascade. */
export function runLength(cascade: Card[]): number {
  if (cascade.length === 0) return 0;
  let length = 1;
  while (length < cascade.length && canStack(cascade[cascade.length - length], cascade[cascade.length - length - 1])) {
    length++;
  }
  return length;
}

/**
 * Cards with nothing to offer right now: buried in a cascade beneath the run
 * on top of it, and not the next card any foundation is waiting for.
 */
export function idleCards(state: GameState): Card[] {
  const idle: Card[] = [];
  for (const cascade of state.cascades) {
    const buried = cascade.length - runLength(cascade);
    for (let i = 0; i < buried; i++) {
      if (!canGoHome(state, cascade[i])) idle.push(cascade[i]);
    }
  }
  return idle;
}

export function hasAnyMove(state: GameState): boolean {
  if (isWon(state)) return false;
  if (freeCellCount(state) > 0 || emptyCascadeCount(state) > 0) return true;
  for (let from = 0; from <= HOME0 + 3; from++) {
    if (from === FOUNDATION) continue;
    const card = sourceCard(state, from);
    if (card === null) continue;
    if (from < FOUNDATION && canGoHome(state, card)) return true;
    for (let to = 0; to < CASCADE_COUNT; to++) {
      if (to !== from && canPlace(state, card, to)) return true;
    }
  }
  return false;
}

/** Throws unless the state holds each of the 52 cards exactly once. */
export function assertValid(state: GameState): void {
  const seen = new Uint8Array(52);
  const mark = (card: Card) => {
    if (!Number.isInteger(card) || card < 0 || card > 51) throw new Error(`Invalid card ${card}`);
    if (seen[card]++) throw new Error(`Duplicate card ${card}`);
  };
  state.cascades.forEach((cascade) => cascade.forEach(mark));
  state.cells.forEach((cell) => cell !== null && mark(cell));
  state.foundations.forEach((count, suit) => {
    for (let rank = 0; rank < count; rank++) mark(rank * 4 + suit);
  });
  if (seen.some((n) => n !== 1)) throw new Error('State does not hold all 52 cards');
  if (!Array.isArray(state.held) || state.held.some((card) => !Number.isInteger(card) || card < 0 || card > 51)) {
    throw new Error('Invalid held list');
  }
}
