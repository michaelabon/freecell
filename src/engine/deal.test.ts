import { describe, expect, it } from 'vitest';
import { deal } from './deal.ts';
import { stateFromRows } from './notation.ts';
import { assertValid } from './state.ts';

describe('deal', () => {
  it('reproduces Microsoft deal #1', () => {
    const expected = stateFromRows(`
      JD 2D 9H JC 5D 7H 7C 5H
      KD KC 9S 5S AD QC KH 3H
      2S KS 9D QD JS AS AH 3C
      4C 5C TS QH 4H AC 4D 7S
      3S TD 4S TH 8H 2C JH 7D
      6D 8S 8D QS 6C 3D 8C TC
      6S 9C 2H 6H
    `);
    expect(deal(1).cascades).toEqual(expected.cascades);
  });

  it('reproduces Microsoft deal #617', () => {
    const expected = stateFromRows(`
      7D AD 5C 3S 5S 8C 2D AH
      TD 7S QD AC 6D 8H AS KH
      TH QC 3H 9D 6S 8D 3D TC
      KD 5H 9S 3C 8S 7H 4D JS
      4C QS 9C 9H 7C 6H 2C 2S
      4S TS 2H 5D JC 6C JH QH
      JD KS KC 4H
    `);
    expect(deal(617).cascades).toEqual(expected.cascades);
  });

  it('deals all 52 cards for a spread of deal numbers', () => {
    for (const n of [1, 2, 11982, 32000, 999_999, 0x7fffffff]) {
      const state = deal(n);
      assertValid(state);
      expect(state.cascades.map((c) => c.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    }
  });

  it('rejects out-of-range deal numbers', () => {
    expect(() => deal(0)).toThrow();
    expect(() => deal(1.5)).toThrow();
  });
});
