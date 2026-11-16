import { describe, expect, it } from 'vitest';
import { parseCard } from './cards.ts';
import { ALMOST_WON } from './fixtures.ts';
import { type Step, buildPlan, stepReasons, toSteps } from './hint.ts';
import { stateFromLayout } from './notation.ts';
import { prunePlan, refineLine, reorderPlan } from './refine.ts';
import { solve } from './solver.ts';
import { type GameState, isWon } from './state.ts';
import { dealt, playOut } from './testing.ts';

const card = parseCard;
const onto = (code: string, target: string): Step => ({ card: card(code), count: 1, dest: { kind: 'onto', card: card(target) } });
const park = (code: string): Step => ({ card: card(code), count: 1, dest: { kind: 'cell' } });

const quickLine = (state: GameState): Step[] | null => {
  const result = solve(state, { beamWidths: [48, 400], quickProofLimit: 0, proofLimit: 0 });
  return result.status === 'winnable' ? toSteps(state, result.moves) : null;
};

describe('prunePlan', () => {
  const state = stateFromLayout({ cascades: ['AC 9D 4H', 'TS KS', '5S', '7C 3H'] });
  const needed = [park('KS'), onto('4H', '5S'), onto('9D', 'TS')];

  it('drops moves the target can get home without', () => {
    expect(prunePlan(state, [park('3H'), ...needed], card('AC'))).toEqual(needed);
  });

  it('keeps every move when all of them are needed', () => {
    expect(prunePlan(state, needed, card('AC'))).toEqual(needed);
  });

  it('keeps a move whose removal would leave a bad position', () => {
    const steps = [park('3H'), ...needed];
    expect(prunePlan(state, steps, card('AC'), () => false)).toEqual(steps);
  });
});

describe('reorderPlan', () => {
  const state = stateFromLayout({ cascades: ['AC 9D 4H', 'TS 6C KS', '5S'] });
  const steps = [park('KS'), onto('4H', '5S'), park('6C'), onto('9D', 'TS')];
  const tidy = [onto('4H', '5S'), park('KS'), park('6C'), onto('9D', 'TS')];

  it('keeps the moves of one dig together and right before the move that needs them', () => {
    expect(reorderPlan(state, steps)).toEqual(tidy);
  });

  it('leaves an order alone when changing it would break a move', () => {
    const tight = stateFromLayout({ cascades: ['AC 9D 4H', 'TS KS', '5S'], cells: ['2C', '2D', '2H', ''] });
    const forced = [onto('4H', '5S'), park('KS'), onto('9D', 'TS')];
    expect(reorderPlan(tight, forced)).toEqual(forced);
  });

  it('says what each move is for', () => {
    expect(stepReasons(state, tidy)).toEqual([
      { kind: 'uncover', card: card('9D') },
      { kind: 'uncover', card: card('6C') },
      { kind: 'clear', card: card('TS'), for: card('9D') },
      { kind: 'release', card: card('AC') },
    ]);
  });
});

describe('refineLine', () => {
  it('sends a card where a click would send it when that still wins', () => {
    const state = stateFromLayout(ALMOST_WON);
    const refined = refineLine(state, [park('KS')], quickLine);
    expect(refined.steps).toEqual([{ card: card('KS'), count: 1, dest: { kind: 'empty' } }]);
    expect(refined.planLength).toBe(1);
  });

  it('still wins, and never lengthens the plan, across the first sixty deals', () => {
    let shorter = 0;
    for (let n = 1; n <= 60; n++) {
      const start = dealt(n);
      const line = toSteps(start, solve(start).moves);
      const refined = refineLine(start, line, quickLine);
      expect(isWon(playOut(start, refined.steps)), `deal ${n}`).toBe(true);
      const before = buildPlan(start, line)!.steps.length;
      expect(refined.planLength, `deal ${n}`).toBeLessThanOrEqual(before);
      expect(refined.planLength).toBe(buildPlan(start, refined.steps)!.steps.length);
      if (refined.planLength < before) shorter++;
    }
    expect(shorter).toBeGreaterThan(0);
  });

  it('gives back the original line when it has nothing to work with', () => {
    const won = stateFromLayout({ home: ['KS', 'KH', 'KD', 'KC'] });
    expect(refineLine(won, [], quickLine)).toEqual({ steps: [], planLength: 0 });
  });
});
