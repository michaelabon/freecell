import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardCode, parseCard } from '../engine/cards.ts';
import { ALMOST_WON, DEAD, LOSING_CARD, ONE_MOVE_FROM_LOST, STACKS } from '../engine/fixtures.ts';
import { stateFromLayout } from '../engine/notation.ts';
import { CELL0, FOUNDATION, assertValid, locate } from '../engine/state.ts';
import { InlineAnalyst } from '../worker/analyse.ts';
import { Game, type GameOptions } from './game.svelte.ts';

const card = parseCard;

function memoryStore() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

function countingAnalyst() {
  const analyst = new InlineAnalyst();
  const analyse = vi.spyOn(analyst, 'analyse');
  return { analyst, analyse };
}

function makeGame(options: Partial<GameOptions> = {}): Game {
  return new Game({ analyst: new InlineAnalyst(), stepMs: 0, ...options });
}

/** Lets pending analysis results land without moving the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

async function loaded(layout: Parameters<typeof stateFromLayout>[0], options: Partial<GameOptions> = {}): Promise<Game> {
  const game = makeGame(options);
  await game.loadPosition(stateFromLayout(layout));
  await settle();
  return game;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dealing', () => {
  it('deals a numbered game that can be won', async () => {
    const game = makeGame();
    await game.start(1);
    expect(game.ready).toBe(true);
    expect(game.dealNumber).toBe(1);
    assertValid(game.state);
    expect(game.panel).toBeNull();
  });

  it('keeps drawing until it finds a winnable deal', async () => {
    const draws = [11981.5 / 1_000_000, 616.5 / 1_000_000];
    const game = makeGame({ random: () => draws.shift()! });
    await game.newGame();
    expect(game.dealNumber).toBe(617);
  });

  it('declines to deal a numbered game that cannot be won', async () => {
    const game = makeGame();
    await game.newGame(11982);
    expect(game.ready).toBe(false);
    expect(game.panel).toMatchObject({ kind: 'message' });
    expect(JSON.stringify(game.panel)).toContain("can't be won");
  });

  it('keeps the current game when a requested deal is declined', async () => {
    const game = makeGame();
    await game.start(1);
    game.clickCard(card('6H'));
    await game.newGame(11982);
    expect(game.dealNumber).toBe(1);
    expect(game.moveCount).toBe(1);
    game.closePanel();
    expect(game.panel).toBeNull();
  });

  it('rejects a deal number that does not exist', async () => {
    const game = makeGame();
    await game.newGame(0);
    expect(JSON.stringify(game.panel)).toContain('no deal #0');
  });
});

describe('moving cards', () => {
  it('moves a clicked card and can undo, redo and restart', async () => {
    const game = makeGame();
    await game.start(1);
    expect(game.clickCard(card('6H'))).toBe(true);
    expect(locate(game.state, card('6H')).loc).toBe(CELL0);
    expect(game.moveCount).toBe(1);
    expect(game.canRedo).toBe(false);

    game.undo();
    expect(locate(game.state, card('6H')).loc).toBe(3);
    expect(game.canUndo).toBe(false);
    game.redo();
    expect(locate(game.state, card('6H')).loc).toBe(CELL0);

    game.clickCard(card('QS'));
    game.restart();
    expect(game.moveCount).toBe(0);
    expect(game.view).toEqual(game.state);
  });

  it('drops a card on the pile the player chose', async () => {
    const game = makeGame();
    await game.start(1);
    expect(game.dropCard(card('6H'), CELL0 + 3)).toBe(true);
    expect(game.state.cells[3]).toBe(card('6H'));
    expect(game.dropCard(card('QS'), 0)).toBe(false);
    expect(game.moveCount).toBe(1);
  });

  it('moves a stack as one action', async () => {
    const game = await loaded(STACKS);
    expect(game.clickCard(card('JC'))).toBe(true);
    expect(game.state.cascades[2].map(cardCode)).toEqual(['9D', 'KS', 'QD', 'JC', 'TH']);
    expect(game.moveCount).toBe(1);
    game.undo();
    expect(game.state.cascades[4].map(cardCode)).toEqual(['JC', 'TH']);
  });

  it('plays a stack move out one card at a time, and skips ahead on demand', async () => {
    const game = await loaded(STACKS, { stepMs: 50 });
    game.clickCard(card('JC'));
    expect(game.state.cascades[2]).toHaveLength(5);
    expect(game.view.cascades[4].map(cardCode)).toEqual(['JC']);
    expect(game.view.cells[3]).toBe(card('TH'));

    await vi.advanceTimersByTimeAsync(50);
    expect(game.view.cascades[2].map(cardCode)).toEqual(['9D', 'KS', 'QD', 'JC']);
    await vi.advanceTimersByTimeAsync(50);
    expect(game.view).toEqual(game.state);

    game.undo();
    game.clickCard(card('JC'));
    game.flush();
    expect(game.view).toEqual(game.state);
  });

  it('wiggles on a refused move and explains only when asked twice', async () => {
    const game = await loaded(STACKS);
    expect(game.clickCard(card('QS'))).toBe(false);
    expect(game.wiggle?.card).toBe(card('QS'));
    expect(game.panel).toBeNull();

    game.clickCard(card('QS'));
    expect(game.panel).toEqual({
      kind: 'message',
      text: 'A stack of 3 needs 2 free cells, and you have 1 open. Right now you can move 2 cards at a time.',
    });
    expect(game.moveCount).toBe(0);
  });

  it('forgets the refusal once the player does something else', async () => {
    const game = await loaded(STACKS);
    game.clickCard(card('QS'));
    game.clickCard(card('JC'));
    game.undo();
    expect(game.clickCard(card('QS'))).toBe(false);
    expect(game.panel).toBeNull();
  });

  it('clears an explanation on the next successful move', async () => {
    const game = await loaded(STACKS);
    game.clickCard(card('QS'));
    game.clickCard(card('QS'));
    game.clickCard(card('JC'));
    expect(game.panel).toBeNull();
  });

  it('declares the win', async () => {
    const game = await loaded(ALMOST_WON);
    expect(game.won).toBe(false);
    game.clickCard(card('KS'));
    expect(game.won).toBe(true);
    expect(game.panel).toEqual({ kind: 'won', moves: 1 });
    expect(game.clickCard(card('KS'))).toBe(false);
  });
});

describe('hints', () => {
  it('reveals the goal first, then the steps, and follows the player through them', async () => {
    const game = makeGame();
    await game.start(1);

    game.hint();
    expect(game.panel).toEqual({ kind: 'goal', target: card('AC'), stepCount: 2 });
    expect(game.hintTarget).toBe(card('AC'));
    expect(game.hintMove).toBeNull();

    game.hint();
    expect(game.panel).toMatchObject({ kind: 'steps', target: card('AC'), done: 0, total: 2 });
    expect(game.hintMove).toEqual({ from: 5, to: CELL0, count: 1 });

    game.clickCard(card('3D'));
    expect(game.panel).toMatchObject({ kind: 'steps', done: 1, total: 2 });

    game.clickCard(card('2C'));
    expect(locate(game.state, card('AC')).loc).toBe(FOUNDATION);
    expect(game.panel).toEqual({ kind: 'achieved', card: card('AC') });
    expect(game.hintTarget).toBeNull();

    await vi.advanceTimersByTimeAsync(3000);
    expect(game.panel).toBeNull();
  });

  it('plays the suggested step when asked to', async () => {
    const game = makeGame();
    await game.start(1);
    game.hint();
    game.hint();
    expect(game.playHintStep()).toBe(true);
    expect(game.playHintStep()).toBe(true);
    expect(game.panel).toMatchObject({ kind: 'achieved' });
  });

  it('does not search again while the player follows the known line', async () => {
    const { analyst, analyse } = countingAnalyst();
    const game = makeGame({ analyst });
    await game.start(1);
    expect(analyse).toHaveBeenCalledTimes(1);

    game.hint();
    game.hint();
    game.playHintStep();
    game.playHintStep();
    await settle();
    expect(analyse).toHaveBeenCalledTimes(1);

    game.clickCard(card('6H'));
    await settle();
    expect(analyse).toHaveBeenCalledTimes(2);
  });

  it('replans when the player goes their own way', async () => {
    const game = makeGame();
    await game.start(1);
    game.hint();
    game.hint();
    game.clickCard(card('6H'));
    expect(game.panel).toEqual({ kind: 'thinking' });
    await settle();
    expect(game.panel).toMatchObject({ kind: 'steps', done: 0 });
  });

  it('can be dismissed', async () => {
    const game = makeGame();
    await game.start(1);
    game.hint();
    game.closePanel();
    expect(game.panel).toBeNull();
    expect(game.hintTarget).toBeNull();
  });

  it('wins a whole deal by following hints', async () => {
    const game = makeGame();
    await game.start(164);
    for (let guard = 0; guard < 400 && !game.won; guard++) {
      if (game.hintLevel < 2) game.hint();
      else expect(game.playHintStep()).toBe(true);
      await settle();
    }
    expect(game.won).toBe(true);
  });
});

describe('stuck detection', () => {
  const lose = async (game: Game) => {
    game.clickCard(card(LOSING_CARD));
    await settle();
  };

  it('waits before telling the player the game is lost', async () => {
    const game = await loaded(ONE_MOVE_FROM_LOST, { stuckDelayMs: 90_000 });
    await lose(game);
    expect(game.panel).toBeNull();

    await vi.advanceTimersByTimeAsync(89_000);
    expect(game.panel).toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(game.panel).toEqual({ kind: 'stuck', cause: 'lost', rollbackMoves: 1 });
  });

  it('counts the wait from the move that lost the game, not from later ones', async () => {
    const game = await loaded(ONE_MOVE_FROM_LOST, { stuckDelayMs: 90_000 });
    await lose(game);
    await vi.advanceTimersByTimeAsync(60_000);
    game.clickCard(card('6C'));
    await settle();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(game.panel).toEqual({ kind: 'stuck', cause: 'lost', rollbackMoves: 2 });
  });

  it('rolls back to the last winnable position', async () => {
    const game = await loaded(ONE_MOVE_FROM_LOST, { stuckDelayMs: 1000 });
    await lose(game);
    game.clickCard(card('6C'));
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    game.rollback();
    expect(game.moveCount).toBe(0);
    expect(game.panel).toBeNull();
    expect(game.canRedo).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(game.panel).toBeNull();
  });

  it('stays quiet after the player chooses to keep playing', async () => {
    const game = await loaded(ONE_MOVE_FROM_LOST, { stuckDelayMs: 1000 });
    await lose(game);
    await vi.advanceTimersByTimeAsync(1000);
    game.closePanel();
    game.clickCard(card('6C'));
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(game.panel).toBeNull();
  });

  it('starts the wait again after the player undoes back to safety', async () => {
    const game = await loaded(ONE_MOVE_FROM_LOST, { stuckDelayMs: 90_000 });
    await lose(game);
    await vi.advanceTimersByTimeAsync(80_000);
    game.undo();
    await lose(game);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(game.panel).toBeNull();
    await vi.advanceTimersByTimeAsync(71_000);
    expect(game.panel).toMatchObject({ kind: 'stuck' });
  });

  it('answers a hint request in a lost position straight away', async () => {
    const game = await loaded(ONE_MOVE_FROM_LOST, { stuckDelayMs: 90_000 });
    await lose(game);
    game.hint();
    expect(game.panel).toEqual({ kind: 'stuck', cause: 'lost', rollbackMoves: 1 });
  });

  it('says so at once when no card can move', async () => {
    const game = await loaded(DEAD, { stuckDelayMs: 90_000 });
    expect(game.panel).toEqual({ kind: 'stuck', cause: 'no-moves', rollbackMoves: 0 });
  });
});

describe('saving', () => {
  it('resumes the saved game', async () => {
    const storage = memoryStore();
    const first = makeGame({ storage });
    await first.start(1);
    first.clickCard(card('6H'));
    first.clickCard(card('QS'));
    first.undo();

    const second = makeGame({ storage });
    await second.start();
    expect(second.dealNumber).toBe(1);
    expect(second.moveCount).toBe(1);
    expect(second.canRedo).toBe(true);
    expect(second.state).toEqual(first.state);
    expect(second.view).toEqual(first.state);
  });

  it('deals afresh when a different deal is asked for', async () => {
    const storage = memoryStore();
    const first = makeGame({ storage });
    await first.start(1);
    first.clickCard(card('6H'));

    const second = makeGame({ storage });
    await second.start(2);
    expect(second.dealNumber).toBe(2);
    expect(second.moveCount).toBe(0);
  });

  it('ignores a save it cannot trust', async () => {
    const storage = memoryStore();
    storage.setItem('freecell:game', '{"version":1,"dealNumber":1,"cursor":0,"positions":[{"state":{}}]}');
    const game = makeGame({ storage, random: () => 0 });
    await game.start();
    expect(game.dealNumber).toBe(1);
    expect(game.moveCount).toBe(0);
  });
});
