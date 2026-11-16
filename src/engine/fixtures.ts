import type { Layout } from './notation.ts';

/**
 * A winnable position in which parking the 9♠ (a click on it does exactly
 * that) leaves a game that can no longer be won, yet still has moves to make.
 */
export const ONE_MOVE_FROM_LOST: Layout = {
  cascades: [
    'KC 7D TC 4H 6C 9S',
    '2D JH QH AS TD 2C',
    'QC 9D TS JD 2S 3H 5S',
    '7H JS 5D 8D 3C 4C',
    '6S QS 6H AC 9H 8C',
    '8H 8S KS',
    'TH 9C 7C 3D 7S 6D 5C',
    '4D QD AD KH 3S 5H 4S',
  ],
  cells: ['KD', 'JC', '', ''],
  home: ['2H'],
};
export const LOSING_CARD = '9S';

/**
 * One free cell is open. The J♣ and 10♥ can move together onto the Q♦, but
 * the three cards led by the Q♠ cannot reach the K♥. Nothing is ready to go
 * home, so the position holds still until a card is moved.
 */
export const STACKS: Layout = {
  cascades: ['9S KD QS JH TS', '9H QC KH', '9D KS QD', '7C 9C', 'JC TH', 'QH JS', 'KC', '8C'],
  cells: ['JD', 'TC', 'TD', ''],
  home: ['8S', '8H', '8D', '6C'],
};

/** No card can move anywhere. */
export const DEAD: Layout = {
  cascades: [
    '5S 7S 8S 9S AS 2S',
    '5H 7H 8H 9H AH 2H',
    '5D 7D 8D 9D AD 2D',
    '5C 7C 8C 9C AC 2C',
    'TS JS QS KS 3D 4S',
    'TH JH QH KH 3C 4H',
    'TD JD QD KD 3S 4D',
    'TC JC QC KC 3H 4C',
  ],
  cells: ['6S', '6H', '6D', '6C'],
};

/** One move from a win: the K♠ has to step aside for the Q♠. */
export const ALMOST_WON: Layout = {
  cascades: ['QS KS'],
  home: ['JS', 'KH', 'KD', 'KC'],
};
