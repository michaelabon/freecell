import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stateFromLayout } from './notation.ts';
import { canReceiveStack, capacityFor, planStackMove, stackCapacity } from './stackMove.ts';
import { CASCADE_COUNT, CELL0, type GameState, type Move, applyMove, canMove, cloneState, runLength } from './state.ts';
import { reachableState } from './testing.ts';

function carryOut(state: GameState, moves: Move[]): GameState {
  const next = cloneState(state);
  for (const move of moves) {
    if (!canMove(next, move)) throw new Error(`Illegal move ${move.from} -> ${move.to}`);
    applyMove(next, move);
  }
  return next;
}

function spliced(state: GameState, from: number, count: number, to: number): GameState {
  const next = cloneState(state);
  next.cascades[to].push(...next.cascades[from].splice(next.cascades[from].length - count));
  return next;
}

describe('stackCapacity', () => {
  it('doubles for every empty cascade', () => {
    expect(stackCapacity(0, 0)).toBe(1);
    expect(stackCapacity(3, 0)).toBe(4);
    expect(stackCapacity(1, 1)).toBe(4);
    expect(stackCapacity(4, 2)).toBe(20);
  });

  it('does not count an empty destination as parking', () => {
    const state = stateFromLayout({ cascades: ['KS QH', ''], cells: ['2C', '3C'] });
    expect(capacityFor(state, 1)).toBe(3 * (1 << 6));
    expect(capacityFor(state, 0)).toBe(3 * (1 << 7));
  });
});

describe('planStackMove', () => {
  it('moves one card directly', () => {
    const state = stateFromLayout({ cascades: ['9H', 'TS'] });
    expect(planStackMove(state, 0, 1, 1)).toEqual([{ from: 0, to: 1 }]);
  });

  it('moves four cards through three free cells in seven moves', () => {
    const state = stateFromLayout({
      cascades: ['2C QS JH TS 9H', 'KH', '3C', '4C', '5C', '6C', '7C', '8C'],
      cells: ['2D'],
    });
    const moves = planStackMove(state, 0, 4, 1)!;
    expect(moves).toHaveLength(7);
    expect(carryOut(state, moves)).toEqual(spliced(state, 0, 4, 1));
  });

  it('refuses four cards when only one free cell is open', () => {
    const state = stateFromLayout({
      cascades: ['2C QS JH TS 9H', 'KH', '3C', '4C', '5C', '6C', '7C', '8C'],
      cells: ['2D', '3D', '4D'],
    });
    expect(planStackMove(state, 0, 4, 1)).toBeNull();
    expect(planStackMove(state, 0, 2, 2)).toBeNull();
  });

  it('parks cards on other cascades that accept them', () => {
    const state = stateFromLayout({
      cascades: ['2C QS JH TS 9H', '', 'JD', '4C', '5C', '6C', '7C', '8C'],
      cells: ['2D', '3D', '4D'],
    });
    const moves = planStackMove(state, 0, 3, 1)!;
    expect(moves).toEqual([
      { from: 0, to: CELL0 + 3 },
      { from: 0, to: 2 },
      { from: 0, to: 1 },
      { from: 2, to: 1 },
      { from: CELL0 + 3, to: 1 },
    ]);
    expect(carryOut(state, moves)).toEqual(spliced(state, 0, 3, 1));
  });

  it('uses empty cascades to move more than the free cells alone allow', () => {
    const state = stateFromLayout({
      cascades: ['2C TS 9H 8S 7H 6S 5H 4S 3H', 'JD', '', '', '5C', '6C', '7C', '8C'],
      cells: ['2D', '3D', '4D'],
    });
    const moves = planStackMove(state, 0, 8, 1)!;
    expect(carryOut(state, moves)).toEqual(spliced(state, 0, 8, 1));
  });

  it('rejects a destination that does not accept the stack', () => {
    const state = stateFromLayout({ cascades: ['QS JH', 'QD', 'KS'] });
    expect(planStackMove(state, 0, 1, 2)).toBeNull();
    expect(planStackMove(state, 0, 2, 1)).toBeNull();
    expect(planStackMove(state, 0, 3, 2)).toBeNull();
  });

  it('never needs more room than the free-cell formula, with or without the search', () => {
    fc.assert(
      fc.property(reachableState, fc.boolean(), (state, searchFirst) => {
        for (let from = 0; from < CASCADE_COUNT; from++) {
          const run = runLength(state.cascades[from]);
          for (let count = 2; count <= run; count++) {
            for (let to = 0; to < CASCADE_COUNT; to++) {
              const moves = planStackMove(state, from, count, to, searchFirst ? 20000 : 0);
              if (moves === null) {
                if (canReceiveStack(state, from, count, to)) {
                  expect(count).toBeGreaterThan(capacityFor(state, to));
                }
                continue;
              }
              expect(carryOut(state, moves)).toEqual(spliced(state, from, count, to));
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
