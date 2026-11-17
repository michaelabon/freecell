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

/** Two moves from a win: the K♠ steps aside, then the Q♠ goes up and takes the K♠ with it. */
export const ALMOST_WON: Layout = {
  cascades: ['QS KS'],
  home: ['JS', 'KH', 'KD', 'KC'],
};

/** Lost under the classic rules, but winnable by bringing a card back down off a foundation. */
export const NEEDS_TAKE_BACK: Layout = {
  cascades: [
    '6C 8H JC 6H KD',
    '5H 7S TC 7D 8S 7H',
    '9H 4D 9S TD JD 6D KS QD',
    'KC 8C 5D',
    'QC 2D AS JS 9C 8D 7C',
    '5S',
    '6S 4S 3D JH TS 9D',
    'KH TH',
  ],
  cells: ['2S', '3S', 'QS', 'QH'],
  home: ['5C', 'AD', '4H'],
};

/**
 * Lost under the classic rules. The way out brings six cards back down, and
 * the first card the winning line sends up is one of those six.
 */
export const RESCUE: Layout = {
  cascades: ['9H QH QD 6S 9S JD 7S', '8S', 'TH AD 4S KD', 'TC TD QC 4D', '8H 3S 2D', '5D 9C 8D 7C 6D 5S', '8C 7D', 'JC 9D KH QS JH TS'],
  cells: ['KC', '3D', 'JS', 'KS'],
  home: ['6C', '7H', '2S'],
};
