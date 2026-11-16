import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cardCode, parseCard } from './cards.ts';
import { stateFromLayout } from './notation.ts';
import {
  CELL0,
  FOUNDATION,
  applyMove,
  assertValid,
  autoHome,
  canMove,
  cloneState,
  hasAnyMove,
  idleCards,
  isSafeHome,
  isWon,
  locate,
  nextAutoMove,
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

  it('finishes any game whose cascades all count down', () => {
    const state = stateFromLayout({
      cascades: ['KS QS JS TS 9S 8S 7S 6S', 'KH QH JH TH 9H 8H 7H 6H', 'KD QD JD TD 9D 8D 7D 6D', 'KC QC JC TC 9C 8C 7C 6C'],
      home: ['5S', '5H', '5D', '5C'],
    });
    assertValid(state);
    autoHome(state);
    expect(isWon(state)).toBe(true);
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

  it('leaves no safe card behind after sending cards home', () => {
    fc.assert(
      fc.property(reachableState, (state) => {
        expect(nextAutoMove(state)).toBeNull();
      }),
      { numRuns: 300 },
    );
  });

  it('only ever makes moves the rules allow', () => {
    fc.assert(
      fc.property(reachableState, fc.array(fc.tuple(fc.nat(12), fc.nat(12)), { maxLength: 40 }), (start, tries) => {
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
