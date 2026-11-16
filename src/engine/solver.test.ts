import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { play } from './actions.ts';
import { deal } from './deal.ts';
import { buildPlan, keyAfter, resolveStep, stepMoves, toSteps } from './hint.ts';
import { stateFromLayout } from './notation.ts';
import { canonicalKey, legalMoves, solve } from './solver.ts';
import { FOUNDATION, type GameState, autoHome, cloneState, isWon, locate } from './state.ts';
import { playOut, reachableState } from './testing.ts';

function dealt(dealNumber: number): GameState {
  const state = deal(dealNumber);
  autoHome(state);
  return state;
}

describe('solve', () => {
  it('wins the first forty classic deals with moves the game accepts', () => {
    for (let n = 1; n <= 40; n++) {
      const start = dealt(n);
      const result = solve(start);
      expect(result.status, `deal ${n}`).toBe('winnable');
      expect(isWon(playOut(start, toSteps(start, result.moves))), `deal ${n}`).toBe(true);
    }
  });

  it('proves the one unwinnable classic deal lost', () => {
    expect(solve(dealt(11982)).status).toBe('unwinnable');
  });

  it('proves a position with no moves lost', () => {
    const stuck = stateFromLayout({
      cascades: ['AS 2S', 'AH 2H', 'AD 2D', 'AC 2C', '3D 4S', '3C 4H', '3S 4D', '3H 4C'],
      cells: ['6S', '6H', '6D', '6C'],
    });
    expect(legalMoves(stuck)).toEqual([]);
    expect(solve(stuck).status).toBe('unwinnable');
  });

  it('reports unknown when the budget runs out first', () => {
    const result = solve(dealt(11982), { beamWidths: [4], quickProofLimit: 50, proofLimit: 50 });
    expect(result.status).toBe('unknown');
  });

  it('recognises a finished game', () => {
    const won = stateFromLayout({ home: ['KS', 'KH', 'KD', 'KC'] });
    expect(solve(won)).toEqual({ status: 'winnable', moves: [], explored: 0 });
  });

  it('never calls a reachable position lost when it finds a win from it', () => {
    fc.assert(
      fc.property(reachableState, (state) => {
        const result = solve(state, { beamWidths: [48], quickProofLimit: 2000, proofLimit: 0 });
        if (result.status !== 'winnable') return;
        expect(isWon(playOut(state, toSteps(state, result.moves)))).toBe(true);
      }),
      { numRuns: 40 },
    );
  });
});

describe('canonicalKey', () => {
  it('ignores which column and which cell a pile sits in', () => {
    const a = stateFromLayout({ cascades: ['KS QH', '5D', ''], cells: ['2C', '', '9D'] });
    const b = stateFromLayout({ cascades: ['', 'KS QH', '', '5D'], cells: ['9D', '2C'] });
    expect(canonicalKey(a)).toBe(canonicalKey(b));
  });

  it('tells apart positions that differ in card order', () => {
    const a = stateFromLayout({ cascades: ['KS QH'] });
    const b = stateFromLayout({ cascades: ['QH KS'] });
    expect(canonicalKey(a)).not.toBe(canonicalKey(b));
  });
});

describe('hint plans', () => {
  it('names the next card to go home and the moves that get it there', () => {
    const start = dealt(1);
    const steps = toSteps(start, solve(start).moves);
    const plan = buildPlan(start, steps)!;
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps).toEqual(steps.slice(0, plan.steps.length));
    expect(locate(start, plan.target).loc).not.toBe(FOUNDATION);
    const before = playOut(start, plan.steps.slice(0, -1));
    expect(locate(before, plan.target).loc).not.toBe(FOUNDATION);
    const after = playOut(start, plan.steps);
    expect(locate(after, plan.target).loc).toBe(FOUNDATION);
  });

  it('recognises a followed step by the position it leads to', () => {
    const start = dealt(5);
    const steps = toSteps(start, solve(start).moves);
    const next = play(start, stepMoves(start, steps[0])!).state;
    expect(keyAfter(start, steps[0])).toBe(canonicalKey(next));
  });

  it('still applies after the piles are rearranged', () => {
    const start = dealt(7);
    const steps = toSteps(start, solve(start).moves);
    const shuffled = cloneState(start);
    shuffled.cascades.reverse();
    expect(isWon(playOut(shuffled, steps))).toBe(true);
  });

  it('drops a step whose card has already gone home', () => {
    const state = stateFromLayout({ cascades: ['3S'], home: ['2H'] });
    expect(resolveStep(state, { card: 0 * 4 + 2, count: 1, dest: { kind: 'cell' } })).toBeNull();
  });
});
