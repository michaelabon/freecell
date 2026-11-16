import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cardCode, parseCard } from './cards.ts';
import { stateFromLayout } from './notation.ts';
import {
  CELL0,
  FOUNDATION,
  HOME0,
  applyMove,
  assertValid,
  canMove,
  chainHome,
  cloneState,
  hasAnyMove,
  idleCards,
  isSafeHome,
  isWon,
  locate,
  runLength,
} from './state.ts';
import { reachableState } from './testing.ts';

describe('move legality', () => {
  const state = stateFromLayout({
    cascades: ['KS 7H', '8S', '8D', '', 'AC', '3D 2D'],
    cells: ['9C', ''],
    home: ['AD'],
  });

  it('stacks only on the next rank up in the other colour', () => {
    expect(canMove(state, { from: 0, to: 1 })).toBe(true);
    expect(canMove(state, { from: 0, to: 2 })).toBe(false);
    expect(canMove(state, { from: 1, to: 2 })).toBe(false);
  });

  it('lets any card into an empty cascade or an empty cell', () => {
    expect(canMove(state, { from: 0, to: 3 })).toBe(true);
    expect(canMove(state, { from: 0, to: CELL0 + 1 })).toBe(true);
    expect(canMove(state, { from: 0, to: CELL0 })).toBe(false);
  });

  it('builds foundations up by suit from the ace', () => {
    expect(canMove(state, { from: 4, to: FOUNDATION })).toBe(true);
    expect(canMove(state, { from: 5, to: FOUNDATION })).toBe(true);
    expect(canMove(state, { from: 0, to: FOUNDATION })).toBe(false);
  });

  it('moves cards out of cells but never off the foundation or from empty piles', () => {
    expect(canMove(state, { from: CELL0, to: 3 })).toBe(true);
    expect(canMove(state, { from: CELL0 + 1, to: 3 })).toBe(false);
    expect(canMove(state, { from: 3, to: 0 })).toBe(false);
    expect(canMove(state, { from: FOUNDATION, to: 3 })).toBe(false);
    expect(canMove(state, { from: 0, to: 0 })).toBe(false);
  });

  it('applies a move to exactly one card', () => {
    const next = cloneState(state);
    applyMove(next, { from: 0, to: 1 });
    expect(next.cascades[0]).toEqual([parseCard('KS')]);
    expect(next.cascades[1]).toEqual([parseCard('8S'), parseCard('7H')]);
    applyMove(next, { from: 5, to: FOUNDATION });
    expect(next.foundations).toEqual([0, 2, 0, 0]);
    expect(locate(next, parseCard('2D')).loc).toBe(FOUNDATION);
  });
});

describe('safe cards', () => {
  it('always sends aces and twos home', () => {
    const state = stateFromLayout({ cascades: ['AS', '2H'], home: ['AH'] });
    expect(isSafeHome(state, parseCard('AS'))).toBe(true);
    expect(isSafeHome(state, parseCard('2H'))).toBe(true);
  });

  it('holds back a card that a lower opposite-colour card may still need', () => {
    const state = stateFromLayout({ cascades: ['4S'], home: ['3S', '2H', '2D'] });
    expect(isSafeHome(state, parseCard('4S'))).toBe(false);
  });

  it('sends a card home once both opposite-colour cards below it are home', () => {
    const state = stateFromLayout({ cascades: ['4S'], home: ['3S', '3H', '3D'] });
    expect(isSafeHome(state, parseCard('4S'))).toBe(true);
  });

  it('sends a card home when the cards that might need it can go home themselves', () => {
    const state = stateFromLayout({ cascades: ['4S'], home: ['3S', '2H', '2D', '2C'] });
    expect(isSafeHome(state, parseCard('4S'))).toBe(true);
  });

  it('never sends a card home out of order', () => {
    const state = stateFromLayout({ cascades: ['5S'], home: ['3S', 'KH', 'KD', 'KC'] });
    expect(isSafeHome(state, parseCard('5S'))).toBe(false);
  });

});

describe('cards going home', () => {
  const sendHome = (state: ReturnType<typeof stateFromLayout>, from: number) => {
    const card = state.cascades[from].at(-1)!;
    applyMove(state, { from, to: FOUNDATION });
    return chainHome(state, card, from).length;
  };

  it('take the next card of the suit with them when it is in reach', () => {
    const state = stateFromLayout({ cascades: ['9S 2H', '4H'], cells: ['3H'], home: ['AH'] });
    expect(sendHome(state, 0)).toBe(2);
    expect(state.foundations[2]).toBe(4);
  });

  it('take the card they uncover when it can go', () => {
    const state = stateFromLayout({ cascades: ['7C AD AS'] });
    expect(sendHome(state, 0)).toBe(1);
    expect(state.cascades[0]).toEqual([parseCard('7C')]);
  });

  it('leave alone a card that could already have gone', () => {
    const state = stateFromLayout({ cascades: ['AS', 'AD'] });
    expect(sendHome(state, 0)).toBe(0);
    expect(state.cascades[1]).toEqual([parseCard('AD')]);
  });

  it('take a card whether or not something might still need it', () => {
    const state = stateFromLayout({ cascades: ['3S', '4S'], home: ['2S'] });
    expect(isSafeHome(state, parseCard('4S'))).toBe(false);
    expect(sendHome(state, 0)).toBe(1);
    expect(state.foundations[3]).toBe(4);
  });

  it('never take a card the player brought back down', () => {
    const state = stateFromLayout({ cascades: ['AS', '2S'], held: ['2S'] });
    expect(sendHome(state, 0)).toBe(0);
    expect(state.foundations[3]).toBe(1);
  });

  it('carry on as far as the chain goes', () => {
    const state = stateFromLayout({
      cascades: ['KS QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S AS'],
      home: ['KH', 'KD', 'KC'],
    });
    assertValid(state);
    expect(sendHome(state, 0)).toBe(12);
    expect(isWon(state)).toBe(true);
  });
});

describe('taking a card back off a foundation', () => {
  const state = stateFromLayout({ cascades: ['6S', '9D', ''], cells: [''], home: ['5H'] });
  const hearts = HOME0 + 2;

  it('is allowed onto a card that accepts it or into an empty column', () => {
    expect(canMove(state, { from: hearts, to: 0 })).toBe(true);
    expect(canMove(state, { from: hearts, to: 2 })).toBe(true);
  });

  it('is not allowed anywhere else', () => {
    expect(canMove(state, { from: hearts, to: 1 })).toBe(false);
    expect(canMove(state, { from: hearts, to: CELL0 })).toBe(false);
    expect(canMove(state, { from: hearts, to: FOUNDATION })).toBe(false);
    expect(canMove(state, { from: HOME0, to: 2 })).toBe(false);
  });

  it('marks the card as held', () => {
    const next = cloneState(state);
    applyMove(next, { from: hearts, to: 0 });
    expect(next.cascades[0]).toEqual([parseCard('6S'), parseCard('5H')]);
    expect(next.foundations[2]).toBe(4);
    expect(next.held).toEqual([parseCard('5H')]);
    expect(state.held).toEqual([]);
  });
});

describe('helpers', () => {
  it('measures the run on top of a cascade', () => {
    const state = stateFromLayout({ cascades: ['2C QS JH TS 9H', '5D 5S', ''] });
    expect(runLength(state.cascades[0])).toBe(4);
    expect(runLength(state.cascades[1])).toBe(1);
    expect(runLength(state.cascades[2])).toBe(0);
  });

  it('picks out the buried cards that are no use yet', () => {
    const state = stateFromLayout({
      cascades: ['2C 5D QS JH TS', '3H AS 9C 9D', 'KD', ''],
      cells: ['7S'],
      home: ['2H'],
    });
    expect(idleCards(state).map(cardCode)).toEqual(['2C', '5D', '9C']);
  });

  it('detects a dead position', () => {
    const dead = stateFromLayout({
      cascades: ['KS', 'KH', 'KD', 'KC', 'QS', 'QH', 'QD', 'QC'],
      cells: ['JS', 'JH', 'JD', 'JC'],
    });
    expect(hasAnyMove(dead)).toBe(true);
    const stuck = stateFromLayout({
      cascades: ['2S', '2H', '2D', '2C', '4S', '4H', '4D', '4C'],
      cells: ['6S', '6H', '6D', '6C'],
    });
    expect(hasAnyMove(stuck)).toBe(false);
    const rescued = stateFromLayout({
      cascades: ['3S', '3H', '3D', '3C', '5S', '5H', '5D', '5C'],
      cells: ['7S', '7H', '7D', '7C'],
      home: ['2S', '2H'],
    });
    expect(hasAnyMove(rescued)).toBe(true);
  });
});

describe('properties', () => {
  it('keeps all 52 cards through any sequence of legal moves', () => {
    fc.assert(
      fc.property(reachableState, (state) => {
        assertValid(state);
      }),
      { numRuns: 300 },
    );
  });

  it('only ever makes moves the rules allow', () => {
    fc.assert(
      fc.property(reachableState, fc.array(fc.tuple(fc.nat(16), fc.nat(12)), { maxLength: 40 }), (start, tries) => {
        const state = cloneState(start);
        for (const [from, to] of tries) {
          if (!canMove(state, { from, to })) continue;
          applyMove(state, { from, to });
          assertValid(state);
        }
      }),
      { numRuns: 200 },
    );
  });
});
