import type { Card } from './cards.ts';
import { CASCADE_COUNT, type GameState, emptyState } from './state.ts';

export const MAX_DEAL = 0x7fffffff;

// The shuffle Microsoft FreeCell used, reproduced so deal numbers match the
// ones players already know and so known-outcome deals can anchor solver tests.
export function deal(dealNumber: number): GameState {
  if (!Number.isInteger(dealNumber) || dealNumber < 1 || dealNumber > MAX_DEAL) {
    throw new Error(`Deal number out of range: ${dealNumber}`);
  }
  const deck: Card[] = Array.from({ length: 52 }, (_, i) => i);
  const state = emptyState();
  let seed = dealNumber;
  for (let i = 0; i < 52; i++) {
    const remaining = 52 - i;
    seed = (Math.imul(seed, 214013) + 2531011) & 0x7fffffff;
    const pick = ((seed >> 16) & 0x7fff) % remaining;
    state.cascades[i % CASCADE_COUNT].push(deck[pick]);
    deck[pick] = deck[remaining - 1];
  }
  return state;
}

export function randomDealNumber(random: () => number = Math.random, max = 1_000_000): number {
  return 1 + Math.floor(random() * max);
}
