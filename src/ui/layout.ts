import type { Card } from '../engine/cards.ts';
import { CASCADE_COUNT, CELL0, CELL_COUNT, FOUNDATION, type GameState } from '../engine/state.ts';

export interface Metrics {
  cardW: number;
  cardH: number;
  gap: number;
  /** Top of the cascades, below the row of cells and foundations. */
  cascadeY: number;
  fan: number;
  /** Height the cascades may use before they start squeezing. */
  room: number;
}

export interface Placed {
  card: Card;
  x: number;
  y: number;
  z: number;
  /** Height of the strip left showing by the card on top, or null when nothing covers it. */
  strip: number | null;
}

// Foundations sit left to right as spades, hearts, clubs, diamonds so the
// colours alternate and each pile is easy to tell apart at a glance.
export const FOUNDATION_SUITS = [3, 2, 0, 1] as const;
const FOUNDATION_SLOT = [2, 3, 1, 0] as const;

const CARD_RATIO = 1.4;
const FAN_RATIO = 0.27;
const MAX_FAN_RATIO = 0.52;
const MIN_FAN_RATIO = 0.12;
const ROOMY_CASCADE = 11;

export function computeMetrics(width: number, height: number, reserve = 0): Metrics {
  const gap = Math.max(4, Math.round(width * 0.016));
  let cardW = (width - gap * (CASCADE_COUNT - 1)) / CASCADE_COUNT;
  // On short, wide windows the cards shrink so a full cascade still fits.
  const tallest = CARD_RATIO * (2 + 0.6 + 8 * FAN_RATIO);
  cardW = Math.max(24, Math.min(cardW, height / tallest));
  const cardH = cardW * CARD_RATIO;
  const cascadeY = cardH + gap * 2;
  // Spare height goes into the fan, because the strip of a covered card is
  // the whole tap target for it and is far too thin on a phone otherwise.
  const spare = (height - cascadeY - cardH) / (ROOMY_CASCADE - 1);
  const fan = Math.min(cardH * MAX_FAN_RATIO, Math.max(cardH * FAN_RATIO, spare));
  return { cardW, cardH, gap, cascadeY, fan, room: height - reserve - cascadeY };
}

export function boardWidth(m: Metrics): number {
  return m.cardW * CASCADE_COUNT + m.gap * (CASCADE_COUNT - 1);
}

export const columnX = (m: Metrics, column: number): number => column * (m.cardW + m.gap);

export const foundationX = (m: Metrics, suit: number): number => columnX(m, CELL_COUNT + FOUNDATION_SLOT[suit]);

/** The fan between cards of one cascade, squeezed when the cascade would run off the board. */
export function fanFor(m: Metrics, length: number): number {
  if (length <= 1) return m.fan;
  const room = m.room - m.cardH;
  return Math.max(m.cardH * MIN_FAN_RATIO, Math.min(m.fan, room / (length - 1)));
}

/** Indexed by card. Cards missing from the state leave holes. */
export function placeCards(state: GameState, m: Metrics): (Placed | undefined)[] {
  const placed: (Placed | undefined)[] = new Array(52).fill(undefined);
  state.cascades.forEach((cascade, column) => {
    const fan = fanFor(m, cascade.length);
    cascade.forEach((card, index) => {
      const strip = index === cascade.length - 1 ? null : fan;
      placed[card] = { card, x: columnX(m, column), y: m.cascadeY + index * fan, z: index + 1, strip };
    });
  });
  state.cells.forEach((card, index) => {
    if (card !== null) placed[card] = { card, x: columnX(m, index), y: 0, z: 1, strip: null };
  });
  state.foundations.forEach((count, suit) => {
    for (let rank = 0; rank < count; rank++) {
      const card = rank * 4 + suit;
      placed[card] = { card, x: foundationX(m, suit), y: 0, z: rank + 1, strip: rank === count - 1 ? null : 0 };
    }
  });
  return placed;
}

/** Where the next card placed on `loc` would land. */
export function landingSpot(state: GameState, m: Metrics, loc: number, suit: number): { x: number; y: number } {
  if (loc === FOUNDATION) return { x: foundationX(m, suit), y: 0 };
  if (loc >= CELL0) return { x: columnX(m, loc - CELL0), y: 0 };
  const length = state.cascades[loc].length;
  return { x: columnX(m, loc), y: m.cascadeY + length * fanFor(m, length + 1) };
}

/** The pile under a point on the board, or null when the point is between piles. */
export function pileAt(m: Metrics, x: number, y: number): number | null {
  const pitch = m.cardW + m.gap;
  const column = Math.floor((x + m.gap / 2) / pitch);
  if (column < 0 || column >= CASCADE_COUNT) return null;
  if (y >= m.cascadeY - m.gap) return column;
  if (y < -m.cardH / 2) return null;
  return column < CELL_COUNT ? CELL0 + column : FOUNDATION;
}
