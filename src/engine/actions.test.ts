import { describe, expect, it } from 'vitest';
import { parseCard } from './cards.ts';
import { type Attempt, explain, play, resolveClick, resolveDrop } from './actions.ts';
import { stateFromLayout } from './notation.ts';
import { CELL0, FOUNDATION, HOME0, isWon } from './state.ts';

const card = parseCard;

function moves(attempt: Attempt) {
  if (!attempt.ok) throw new Error(`Refused: ${explain(attempt.refusal)}`);
  return attempt.moves;
}

function refusal(attempt: Attempt): string {
  if (attempt.ok) throw new Error('Expected a refusal');
  return explain(attempt.refusal);
}

describe('resolveClick', () => {
  it('sends a card home ahead of any other destination', () => {
    const state = stateFromLayout({ cascades: ['9S 2H', '3S'], home: ['AH'] });
    expect(moves(resolveClick(state, card('2H')))).toEqual([{ from: 0, to: FOUNDATION }]);
  });

  it('prefers building on a cascade, and the longer run when two accept the card', () => {
    const state = stateFromLayout({ cascades: ['2C 9H', 'TS', 'KD QS JH TC', '', '', '', '', ''] });
    expect(moves(resolveClick(state, card('9H')))).toEqual([{ from: 0, to: 2 }]);
  });

  it('parks a lone card in a free cell before using up an empty column', () => {
    const state = stateFromLayout({ cascades: ['2C 9H', '5S', '', '', '', '', '', ''] });
    expect(moves(resolveClick(state, card('9H')))).toEqual([{ from: 0, to: CELL0 }]);
  });

  it('sends a king to an empty column instead of a free cell', () => {
    const state = stateFromLayout({ cascades: ['2C KH', '5S', '', '', '', '', '', ''] });
    expect(moves(resolveClick(state, card('KH')))).toEqual([{ from: 0, to: 2 }]);
  });

  it('moves the clicked card along with the run on top of it', () => {
    const state = stateFromLayout({
      cascades: ['2C QS JH TS 9H', '', 'JD', '4C', '5C', '6C', '7C', '8C'],
      cells: ['2D', '3D', '4D'],
    });
    const result = play(state, moves(resolveClick(state, card('JH'))));
    expect(result.state.cascades[0]).toEqual([card('2C'), card('QS')]);
    expect(result.state.cascades[1]).toEqual([card('JH'), card('TS'), card('9H')]);
    expect(result.state.cells).toEqual(state.cells);
  });

  it('moves a card out of a cell onto a cascade or into an empty column', () => {
    const state = stateFromLayout({ cascades: ['TS', '4C', ''], cells: ['', '9H', '7D'] });
    expect(moves(resolveClick(state, card('9H')))).toEqual([{ from: CELL0 + 1, to: 0 }]);
    expect(moves(resolveClick(state, card('7D')))).toEqual([{ from: CELL0 + 2, to: 2 }]);
  });

  it('ignores cards already on the foundation', () => {
    const state = stateFromLayout({ cascades: ['3S'], home: ['2H'] });
    expect(resolveClick(state, card('AH'))).toEqual({ ok: false, refusal: { kind: 'ignored' } });
  });

  it('explains a stack that is too big for the open free cells', () => {
    const state = stateFromLayout({
      cascades: ['2C QS JH TS 9H', 'KH', '3C', '4C', '5C', '6C', '7C', '8C'],
      cells: ['2D', '3D', '4D'],
    });
    expect(refusal(resolveClick(state, card('QS')))).toBe(
      'A stack of 4 needs 3 free cells, and you have 1 open. Right now you can move 2 cards at a time.',
    );
  });

  it('explains a card that is buried under an out-of-sequence card', () => {
    const state = stateFromLayout({ cascades: ['QS JH 4D', 'KH'] });
    expect(refusal(resolveClick(state, card('QS')))).toBe(
      "The 4♦ can't ride on the J♥, so this stack can't move as one. Cards only move together when they count down in alternating colours.",
    );
  });

  it('explains when nothing accepts the card', () => {
    const state = stateFromLayout({
      cascades: ['2C 9H', '3C', '4C', '5C', '6C', '7C', '8C', '9C'],
      cells: ['2D', '3D', '4D', '5D'],
    });
    expect(refusal(resolveClick(state, card('9H')))).toBe(
      'Nowhere for the 9♥ to go yet. It needs a black 10, an empty column, or a free cell.',
    );
  });

  it('will not shuffle a whole column into another empty column', () => {
    const state = stateFromLayout({
      cascades: ['QS JH', '', '3C', '4C', '5C', '6C', '7C', '8C'],
      cells: ['2D', '3D', '4D', '5D'],
    });
    expect(resolveClick(state, card('QS')).ok).toBe(false);
  });
});

describe('resolveDrop', () => {
  const state = stateFromLayout({
    cascades: ['2C QS JH', 'KD', 'QD', '', '3S 2H', '4C', '5C', '6C'],
    cells: ['9C', '', '', ''],
    home: ['AH'],
  });

  it('accepts a legal stack onto a cascade', () => {
    const result = play(state, moves(resolveDrop(state, card('QS'), 1)));
    expect(result.state.cascades[1]).toEqual([card('KD'), card('QS'), card('JH')]);
  });

  it('accepts drops on an empty cell, an empty column and the foundation', () => {
    expect(moves(resolveDrop(state, card('JH'), CELL0 + 2))).toEqual([{ from: 0, to: CELL0 + 2 }]);
    expect(moves(resolveDrop(state, card('9C'), 3))).toEqual([{ from: CELL0, to: 3 }]);
    expect(moves(resolveDrop(state, card('2H'), FOUNDATION))).toEqual([{ from: 4, to: FOUNDATION }]);
  });

  it('explains each kind of bad drop', () => {
    expect(refusal(resolveDrop(state, card('JH'), 2))).toBe("The J♥ can't go on the Q♦. It needs a black queen.");
    expect(refusal(resolveDrop(state, card('JH'), CELL0))).toBe('That free cell is taken.');
    expect(refusal(resolveDrop(state, card('QS'), CELL0 + 1))).toBe('A free cell holds just one card.');
    expect(refusal(resolveDrop(state, card('QS'), FOUNDATION))).toBe('Cards go up to the foundation one at a time.');
    expect(refusal(resolveDrop(state, card('JH'), FOUNDATION))).toBe(
      "The J♥ can't go up yet. The 10♥ has to get there first.",
    );
  });

  it('ignores a drop back where the card started', () => {
    expect(resolveDrop(state, card('JH'), 0)).toEqual({ ok: false, refusal: { kind: 'ignored' } });
  });
});

describe('taking a card back off a foundation', () => {
  const state = stateFromLayout({ cascades: ['6S', '9D', ''], cells: [''], home: ['5H'] });

  it('takes a drag onto a column that accepts the card', () => {
    expect(moves(resolveDrop(state, card('5H'), 0))).toEqual([{ from: HOME0 + 2, to: 0 }]);
    expect(moves(resolveDrop(state, card('5H'), 2))).toEqual([{ from: HOME0 + 2, to: 2 }]);
  });

  it('explains the drops it refuses', () => {
    expect(refusal(resolveDrop(state, card('5H'), 1))).toBe("The 5♥ can't go on the 9♦. It needs a black 6.");
    expect(refusal(resolveDrop(state, card('5H'), CELL0))).toBe(
      'A card from the foundation can only come back down onto a column.',
    );
    expect(refusal(resolveDrop(state, card('4H'), 0))).toBe(
      'Only the top card of a foundation can come back down, and the 4♥ is under others.',
    );
  });

  it('never happens on a click', () => {
    expect(resolveClick(state, card('5H'))).toEqual({ ok: false, refusal: { kind: 'ignored' } });
  });

  it('keeps the card from going up by itself afterwards', () => {
    const back = stateFromLayout({ cascades: ['6S', '4H 3H'], home: ['2H'], held: ['4H'] });
    const result = play(back, [{ from: 1, to: FOUNDATION }]);
    expect(result.state.foundations[2]).toBe(3);
    expect(result.state.cascades[1]).toEqual([card('4H')]);
  });
});

describe('play', () => {
  it('sends up everything a card going home sets off', () => {
    const state = stateFromLayout({
      cascades: ['KS QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S', 'KH QH JH TH 9H 8H 7H 6H 5H 4H 3H 2H AS'],
      home: ['AH', 'KD', 'KC'],
    });
    const result = play(state, [{ from: 1, to: FOUNDATION }]);
    expect(isWon(result.state)).toBe(true);
    expect(result.moves).toHaveLength(25);
    expect(state.cascades[1]).toHaveLength(13);
  });

  it('sends nothing up when no card went home', () => {
    const state = stateFromLayout({ cascades: ['AS', '9D'] });
    const result = play(state, [{ from: 1, to: CELL0 }]);
    expect(result.moves).toHaveLength(1);
    expect(result.state.foundations).toEqual([0, 0, 0, 0]);
  });
});
