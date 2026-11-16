// Encoded as rank * 4 + suit with clubs first, which is the deck order the
// Microsoft deal shuffle indexes into, so deal numbers map straight to cards.
export type Card = number;

export const CLUBS = 0;
export const DIAMONDS = 1;
export const HEARTS = 2;
export const SPADES = 3;

export const SUIT_LETTERS = ['C', 'D', 'H', 'S'] as const;
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const;
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export const RANK_LETTERS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const RANK_NAMES = [
  'ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king',
] as const;

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const isRed = (card: Card): boolean => {
  const suit = card & 3;
  return suit === DIAMONDS || suit === HEARTS;
};
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit;

export const canStack = (card: Card, onto: Card): boolean =>
  rankOf(onto) === rankOf(card) + 1 && isRed(card) !== isRed(onto);

export const cardCode = (card: Card): string => RANK_LETTERS[rankOf(card)] + SUIT_LETTERS[suitOf(card)];

export const cardLabel = (card: Card): string => RANK_LABELS[rankOf(card)] + SUIT_SYMBOLS[suitOf(card)];

export function parseCard(code: string): Card {
  const rank = RANK_LETTERS.indexOf(code[0]?.toUpperCase() as (typeof RANK_LETTERS)[number]);
  const suit = SUIT_LETTERS.indexOf(code[1]?.toUpperCase() as (typeof SUIT_LETTERS)[number]);
  if (code.length !== 2 || rank < 0 || suit < 0) throw new Error(`Bad card code: ${code}`);
  return makeCard(rank, suit);
}
