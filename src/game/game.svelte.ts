import { type Refusal, explain, play, resolveClick, resolveDrop } from '../engine/actions.ts';
import type { Card } from '../engine/cards.ts';
import { deal, randomDealNumber } from '../engine/deal.ts';
import { type HintPlan, type Step, buildPlan, keyAfter, resolveStep, stepMoves } from '../engine/hint.ts';
import { type SolverMove, canonicalKey } from '../engine/solver.ts';
import {
  FOUNDATION,
  type GameState,
  type Move,
  applyMove,
  assertValid,
  cloneState,
  emptyState,
  hasAnyMove,
  isWon,
  locate,
} from '../engine/state.ts';
import type { Analysis, Analyst } from '../worker/protocol.ts';

const SAVE_KEY = 'freecell:game';
const SAVE_VERSION = 1;
const ACHIEVED_MS = 2600;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface GameOptions {
  analyst: Analyst;
  storage?: Store | null;
  /** How long the player may sit in a lost position before being told. */
  stuckDelayMs?: number;
  /** Gap between the single-card moves of one action; 0 shows them all at once. */
  stepMs?: number;
  random?: () => number;
  now?: () => number;
}

interface Position {
  state: GameState;
  enteredAt: number;
  verdict: 'winnable' | 'unwinnable' | null;
  analysis: Analysis | null;
}

interface SavedGame {
  version: number;
  dealNumber: number;
  cursor: number;
  positions: { state: GameState; verdict: Position['verdict'] }[];
}

export type Panel =
  | { kind: 'won'; moves: number }
  | { kind: 'message'; text: string }
  | { kind: 'stuck'; cause: 'lost' | 'no-moves'; rollbackMoves: number }
  | { kind: 'achieved'; card: Card }
  | { kind: 'thinking' }
  | { kind: 'unsure'; rollbackMoves: number }
  | { kind: 'goal'; target: Card; stepCount: number }
  | { kind: 'steps'; target: Card; steps: Step[]; done: number; total: number };

export class Game {
  dealNumber = $state(0);
  /** What is on screen. It trails the true position while an action's moves play out. */
  view = $state.raw<GameState>(emptyState());
  dealing = $state(false);
  wiggle = $state.raw<{ card: Card; nonce: number } | null>(null);

  #positions = $state.raw<Position[]>([]);
  #cursor = $state(0);
  #analysis = $state.raw<Analysis | null>(null);
  #verdicts = $state(0);
  #hintLevel = $state<0 | 1 | 2>(0);
  #goal = $state.raw<{ target: Card; total: number } | null>(null);
  #message = $state.raw<string | null>(null);
  #stuck = $state.raw<'lost' | 'no-moves' | null>(null);
  #achieved = $state.raw<Card | null>(null);

  #analyst: Analyst;
  #storage: Store | null;
  #stuckDelayMs: number;
  #stepMs: number;
  #random: () => number;
  #now: () => number;

  #queue: Move[] = [];
  #ticker: ReturnType<typeof setTimeout> | null = null;
  #stuckTimer: ReturnType<typeof setTimeout> | null = null;
  #achievedTimer: ReturnType<typeof setTimeout> | null = null;
  #epoch = 0;
  #snoozed = false;
  #lastRefused: { card: Card; position: Position } | null = null;
  #wiggles = 0;

  constructor(options: GameOptions) {
    this.#analyst = options.analyst;
    this.#storage = options.storage ?? null;
    this.#stuckDelayMs = options.stuckDelayMs ?? 90_000;
    this.#stepMs = options.stepMs ?? 70;
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? Date.now;
  }

  get #current(): Position | undefined {
    return this.#positions[this.#cursor];
  }

  /** The true position, with every pending animation already applied. */
  get state(): GameState {
    return this.#current?.state ?? this.view;
  }

  get ready(): boolean {
    return this.#positions.length > 0;
  }

  get moveCount(): number {
    return this.#cursor;
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#positions.length - 1;
  }

  get won(): boolean {
    return this.ready && isWon(this.state);
  }

  get hintLevel(): 0 | 1 | 2 {
    return this.#hintLevel;
  }

  plan: HintPlan | null = $derived.by(() => {
    const analysis = this.#analysis;
    if (this.#hintLevel === 0 || !analysis || analysis.status !== 'winnable') return null;
    return buildPlan(this.state, analysis.steps);
  });

  /** The card the current hint wants on the foundation. */
  hintTarget: Card | null = $derived(this.plan?.target ?? null);

  /** The move the step-by-step hint is asking for right now. */
  hintMove: SolverMove | null = $derived.by(() => {
    const plan = this.plan;
    return this.#hintLevel === 2 && plan ? resolveStep(this.state, plan.steps[0]) : null;
  });

  panel: Panel | null = $derived.by(() => {
    if (!this.ready) return this.#message ? { kind: 'message', text: this.#message } : null;
    if (this.won) return { kind: 'won', moves: this.#cursor };
    if (this.#message) return { kind: 'message', text: this.#message };
    if (this.#stuck) return { kind: 'stuck', cause: this.#stuck, rollbackMoves: this.#rollbackMoves() };
    if (this.#achieved !== null) return { kind: 'achieved', card: this.#achieved };
    if (this.#hintLevel === 0) return null;
    const analysis = this.#analysis;
    if (!analysis) return { kind: 'thinking' };
    if (analysis.status !== 'winnable') return { kind: 'unsure', rollbackMoves: this.#rollbackMoves() };
    const plan = this.plan;
    if (!plan) return { kind: 'thinking' };
    if (this.#hintLevel === 1) return { kind: 'goal', target: plan.target, stepCount: plan.steps.length };
    const total = Math.max(this.#goal?.total ?? 0, plan.steps.length);
    return { kind: 'steps', target: plan.target, steps: plan.steps, done: total - plan.steps.length, total };
  });

  /** Restores the saved game, or deals a new one. A deal number forces that deal. */
  async start(dealNumber?: number): Promise<void> {
    const saved = this.#load();
    if (saved && (dealNumber === undefined || saved.dealNumber === dealNumber)) {
      this.dealNumber = saved.dealNumber;
      const now = this.#now();
      this.#positions = saved.positions.map((p) => ({ ...p, enteredAt: now, analysis: null }));
      this.#cursor = saved.cursor;
      this.view = this.state;
      this.#moved();
      return;
    }
    await this.newGame(dealNumber);
  }

  /** Deals a game that can be won. With no number, keeps drawing deals until one is. */
  async newGame(dealNumber?: number): Promise<void> {
    const epoch = ++this.#epoch;
    this.dealing = true;
    this.#message = null;
    for (;;) {
      const number = dealNumber ?? randomDealNumber(this.#random);
      let raw: GameState;
      try {
        raw = deal(number);
      } catch {
        this.dealing = false;
        this.#message = `There is no deal #${number}. Deal numbers run from 1 to 2,147,483,647.`;
        return;
      }
      const opening = play(raw, []);
      const analysis = await this.#analyst.analyse(opening.state);
      if (epoch !== this.#epoch) return;
      if (analysis.status === 'winnable') {
        this.#begin(number, raw, opening.state, opening.moves, analysis);
        return;
      }
      if (dealNumber !== undefined) {
        this.dealing = false;
        this.#message =
          analysis.status === 'unwinnable'
            ? `Deal #${number} can't be won, so I won't deal it. Try another number.`
            : `I couldn't find a way to win deal #${number}, so I won't deal it. Try another number.`;
        if (this.ready && !this.won && !this.#analysis) this.#requestAnalysis();
        return;
      }
    }
  }

  /** Starts a game from an arbitrary position instead of a numbered deal. */
  async loadPosition(start: GameState): Promise<void> {
    assertValid(start);
    const epoch = ++this.#epoch;
    const opening = play(start, []);
    const analysis = await this.#analyst.analyse(opening.state);
    if (epoch !== this.#epoch) return;
    this.#begin(0, start, opening.state, opening.moves, analysis);
  }

  #begin(dealNumber: number, raw: GameState, state: GameState, opening: Move[], analysis: Analysis): void {
    this.flush();
    this.#clearTransient();
    this.#hintLevel = 0;
    this.#goal = null;
    this.dealNumber = dealNumber;
    const verdict = analysis.status === 'unknown' ? null : analysis.status;
    this.#positions = [{ state, enteredAt: this.#now(), verdict, analysis }];
    this.#cursor = 0;
    this.#analysis = analysis;
    this.#snoozed = false;
    this.view = raw;
    this.#animate(opening);
    this.dealing = false;
    this.#save();
    if (!isWon(state)) this.#judged();
  }

  clickCard(card: Card): boolean {
    return this.#attempt(card, (state) => resolveClick(state, card));
  }

  dropCard(card: Card, to: number): boolean {
    return this.#attempt(card, (state) => resolveDrop(state, card, to));
  }

  #attempt(card: Card, resolve: (state: GameState) => ReturnType<typeof resolveClick>): boolean {
    this.flush();
    if (!this.ready || this.won) return false;
    const attempt = resolve(this.state);
    if (attempt.ok) {
      this.#commit(attempt.moves);
      return true;
    }
    this.#refuse(card, attempt.refusal);
    return false;
  }

  /** Plays the move the step-by-step hint is asking for. */
  playHintStep(): boolean {
    this.flush();
    const plan = this.plan;
    if (!plan) return false;
    const moves = stepMoves(this.state, plan.steps[0]);
    if (!moves) return false;
    this.#commit(moves);
    return true;
  }

  #refuse(card: Card, refusal: Refusal): void {
    if (refusal.kind === 'ignored') return;
    this.wiggle = { card, nonce: ++this.#wiggles };
    const text = explain(refusal);
    const repeated = this.#lastRefused?.card === card && this.#lastRefused.position === this.#current;
    if (repeated && text) this.#message = text;
    this.#lastRefused = { card, position: this.#current! };
  }

  #commit(moves: Move[]): void {
    const before = this.#current!;
    const result = play(before.state, moves);
    const position: Position = { state: result.state, enteredAt: this.#now(), verdict: null, analysis: null };

    // A position reached from a lost one is lost too, and following the known
    // winning line leaves the rest of that line standing, so neither needs a search.
    const known = before.analysis;
    if (before.verdict === 'unwinnable') {
      position.verdict = 'unwinnable';
      position.analysis = { status: 'unwinnable', steps: [], explored: 0 };
    } else if (known?.status === 'winnable' && known.steps.length > 0) {
      if (keyAfter(before.state, known.steps[0]) === canonicalKey(result.state)) {
        position.verdict = 'winnable';
        position.analysis = { status: 'winnable', steps: known.steps.slice(1), explored: 0 };
      }
    }

    this.#positions = [...this.#positions.slice(0, this.#cursor + 1), position];
    this.#cursor++;
    this.#animate(result.moves);
    this.#moved();
  }

  undo(): void {
    this.#goTo(this.#cursor - 1);
  }

  redo(): void {
    this.#goTo(this.#cursor + 1);
  }

  restart(): void {
    this.#goTo(0);
  }

  /** Returns to the most recent position that is known to be winnable. */
  rollback(): void {
    this.#goTo(this.#lastWinnable());
  }

  #goTo(index: number): void {
    this.flush();
    if (index < 0 || index >= this.#positions.length || index === this.#cursor) return;
    this.#cursor = index;
    this.view = this.state;
    this.#moved();
  }

  hint(): void {
    this.flush();
    if (!this.ready || this.won) return;
    this.#message = null;
    this.#setAchieved(null);
    if (this.#analysis?.status === 'unwinnable') {
      this.#stuck = hasAnyMove(this.state) ? 'lost' : 'no-moves';
      return;
    }
    this.#hintLevel = this.#hintLevel === 0 ? 1 : 2;
    this.#syncGoal();
  }

  /** Dismisses whatever the drawer is showing. */
  closePanel(): void {
    if (this.#message) this.#message = null;
    else if (this.#stuck) {
      this.#stuck = null;
      this.#snoozed = true;
    } else if (this.#achieved !== null) this.#setAchieved(null);
    else {
      this.#hintLevel = 0;
      this.#goal = null;
    }
  }

  /** Shows the true position immediately, skipping any moves still playing out. */
  flush(): void {
    if (this.#ticker) clearTimeout(this.#ticker);
    this.#ticker = null;
    if (this.#queue.length > 0) {
      this.#queue = [];
      this.view = this.state;
    }
  }

  dispose(): void {
    this.#epoch++;
    this.flush();
    this.#clearTransient();
    this.#analyst.dispose();
  }

  #animate(moves: Move[]): void {
    if (moves.length === 0) return;
    if (this.#stepMs <= 0) {
      this.view = this.state;
      return;
    }
    this.#queue.push(...moves);
    if (!this.#ticker) this.#tick();
  }

  #tick = (): void => {
    this.#ticker = null;
    const move = this.#queue.shift();
    if (!move) return;
    const next = cloneState(this.view);
    applyMove(next, move);
    this.view = next;
    if (this.#queue.length > 0) {
      this.#ticker = setTimeout(this.#tick, this.#queue.length > 12 ? this.#stepMs / 2 : this.#stepMs);
    }
  };

  #clearTransient(): void {
    if (this.#stuckTimer) clearTimeout(this.#stuckTimer);
    this.#stuckTimer = null;
    this.#stuck = null;
    this.#message = null;
    this.#lastRefused = null;
    this.#setAchieved(null);
  }

  #setAchieved(card: Card | null): void {
    if (this.#achievedTimer) clearTimeout(this.#achievedTimer);
    this.#achievedTimer = null;
    this.#achieved = card;
    if (card !== null) {
      this.#achievedTimer = setTimeout(() => {
        this.#achievedTimer = null;
        this.#achieved = null;
      }, ACHIEVED_MS);
    }
  }

  /** Runs after every change of position, however it came about. */
  #moved(): void {
    this.#epoch++;
    const position = this.#current!;
    const goal = this.#goal;
    this.#clearTransient();
    this.#analysis = position.analysis;
    this.#save();

    if (goal && locate(position.state, goal.target).loc === FOUNDATION) {
      this.#hintLevel = 0;
      this.#goal = null;
      if (!isWon(position.state)) this.#setAchieved(goal.target);
    }
    if (isWon(position.state)) {
      this.#hintLevel = 0;
      this.#goal = null;
      return;
    }
    if (position.analysis) this.#judged();
    else this.#requestAnalysis();
  }

  #requestAnalysis(): void {
    const epoch = ++this.#epoch;
    const position = this.#current!;
    void this.#analyst.analyse(position.state).then((analysis) => {
      if (epoch !== this.#epoch) return;
      this.#record(position, analysis);
      this.#analysis = analysis;
      this.#judged();
    });
  }

  #record(position: Position, analysis: Analysis): void {
    position.analysis = analysis;
    if (analysis.status === 'winnable') {
      const index = this.#positions.indexOf(position);
      for (let i = 0; i <= index; i++) this.#positions[i].verdict = 'winnable';
    } else if (analysis.status === 'unwinnable') {
      position.verdict = 'unwinnable';
    }
    this.#verdicts++;
    this.#save();
  }

  /** Reacts to the verdict on the current position. */
  #judged(): void {
    const analysis = this.#analysis!;
    if (analysis.status === 'winnable') {
      this.#snoozed = false;
      this.#syncGoal();
      return;
    }
    if (analysis.status !== 'unwinnable') return;
    if (!hasAnyMove(this.state)) this.#stuck = 'no-moves';
    else if (this.#hintLevel > 0) this.#stuck = 'lost';
    this.#hintLevel = 0;
    this.#goal = null;
    this.#traceLoss(this.#cursor - 1);
  }

  // Positions the player passed through faster than they could be analysed
  // have no verdict yet. Settle them from newest to oldest so the rollback
  // lands on the latest winnable position, not merely the latest known one.
  #traceLoss(index: number): void {
    while (index >= 0 && this.#positions[index].verdict === 'unwinnable') index--;
    const position = this.#positions[index];
    if (!position || position.verdict === 'winnable') {
      this.#armStuckTimer();
      return;
    }
    const epoch = this.#epoch;
    void this.#analyst.analyse(position.state).then((analysis) => {
      if (epoch !== this.#epoch) return;
      this.#record(position, analysis);
      if (analysis.status === 'unwinnable') this.#traceLoss(index - 1);
      else this.#armStuckTimer();
    });
  }

  #armStuckTimer(): void {
    if (this.#stuckTimer) clearTimeout(this.#stuckTimer);
    this.#stuckTimer = null;
    if (this.#stuck || this.#snoozed || this.#current?.verdict !== 'unwinnable') return;
    let first = this.#cursor;
    while (first > 0 && this.#positions[first - 1].verdict === 'unwinnable') first--;
    const wait = this.#positions[first].enteredAt + this.#stuckDelayMs - this.#now();
    this.#stuckTimer = setTimeout(() => {
      this.#stuckTimer = null;
      if (this.#current?.verdict === 'unwinnable' && !this.#snoozed) this.#stuck = 'lost';
    }, Math.max(0, wait));
  }

  #lastWinnable(): number {
    for (let i = this.#cursor; i > 0; i--) {
      if (this.#positions[i].verdict === 'winnable') return i;
    }
    return 0;
  }

  #rollbackMoves(): number {
    void this.#verdicts;
    return this.#cursor - this.#lastWinnable();
  }

  #syncGoal(): void {
    const plan = this.plan;
    if (!plan) return;
    const goal = this.#goal;
    if (!goal || goal.target !== plan.target || plan.steps.length > goal.total) {
      this.#goal = { target: plan.target, total: plan.steps.length };
    }
  }

  #save(): void {
    if (!this.#storage || !this.ready) return;
    const saved: SavedGame = {
      version: SAVE_VERSION,
      dealNumber: this.dealNumber,
      cursor: this.#cursor,
      positions: this.#positions.map(({ state, verdict }) => ({ state, verdict })),
    };
    try {
      this.#storage.setItem(SAVE_KEY, JSON.stringify(saved));
    } catch {
      // A full or unavailable store only costs the ability to resume later.
    }
  }

  #load(): SavedGame | null {
    try {
      const text = this.#storage?.getItem(SAVE_KEY);
      if (!text) return null;
      const saved = JSON.parse(text) as SavedGame;
      if (saved.version !== SAVE_VERSION || !Array.isArray(saved.positions) || saved.positions.length === 0) return null;
      if (!Number.isInteger(saved.cursor) || saved.cursor < 0 || saved.cursor >= saved.positions.length) return null;
      for (const position of saved.positions) assertValid(position.state);
      return saved;
    } catch {
      return null;
    }
  }
}
