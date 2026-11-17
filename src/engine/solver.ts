import { type Card, canStack } from './cards.ts';
import {
  CASCADE_COUNT,
  CELL0,
  CELL_COUNT,
  FOUNDATION,
  type GameState,
  HOME0,
  applyMove,
  canGoHome,
  chainHome,
  cloneState,
  isSafeHome,
  isUnneeded,
  isWon,
  runLength,
  sourceCard,
} from './state.ts';
import { stackCapacity } from './stackMove.ts';

/**
 * One player-level move: `count` cards from the top of `from` onto `to`.
 * `from` may also be a foundation (HOME0 + suit), taking its top card back.
 */
export interface SolverMove {
  from: number;
  to: number;
  count: number;
}

export type SolveStatus = 'winnable' | 'unwinnable' | 'unknown';

export interface SolveResult {
  status: SolveStatus;
  moves: SolverMove[];
  explored: number;
}

export interface SolveOptions {
  beamWidths?: number[];
  /** State budgets for the exhaustive passes that can prove a position lost. */
  quickProofLimit?: number;
  proofLimit?: number;
  maxDepth?: number;
  /** Whether lines of play may take cards back off the foundations. */
  takeBack?: boolean;
}

export const DEFAULT_OPTIONS: Required<SolveOptions> = {
  beamWidths: [48, 400, 3000, 12000],
  quickProofLimit: 4000,
  proofLimit: 400_000,
  maxDepth: 250,
  takeBack: true,
};

export function legalMoves(state: GameState, takeBack = true): SolverMove[] {
  const moves: SolverMove[] = [];
  let freeCells = 0;
  let firstCell = -1;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (state.cells[i] === null) {
      freeCells++;
      if (firstCell < 0) firstCell = CELL0 + i;
    }
  }
  let empties = 0;
  let firstEmpty = -1;
  for (let c = 0; c < CASCADE_COUNT; c++) {
    if (state.cascades[c].length === 0) {
      empties++;
      if (firstEmpty < 0) firstEmpty = c;
    }
  }
  const capacity = stackCapacity(freeCells, empties);
  const capacityIntoEmpty = empties > 0 ? stackCapacity(freeCells, empties - 1) : 0;

  for (let from = 0; from < CASCADE_COUNT; from++) {
    const cascade = state.cascades[from];
    const length = cascade.length;
    if (length === 0) continue;
    const top = cascade[length - 1];
    if (canGoHome(state, top)) moves.push({ from, to: FOUNDATION, count: 1 });
    const run = runLength(cascade);
    for (let count = 1; count <= run && count <= capacity; count++) {
      const head = cascade[length - count];
      for (let to = 0; to < CASCADE_COUNT; to++) {
        if (to === from) continue;
        const target = state.cascades[to];
        if (target.length > 0 && canStack(head, target[target.length - 1])) moves.push({ from, to, count });
      }
      if (firstEmpty >= 0 && count < length && count <= capacityIntoEmpty) {
        moves.push({ from, to: firstEmpty, count });
      }
    }
    if (firstCell >= 0) moves.push({ from, to: firstCell, count: 1 });
  }

  for (let i = 0; i < CELL_COUNT; i++) {
    const card = state.cells[i];
    if (card === null) continue;
    const from = CELL0 + i;
    if (canGoHome(state, card)) moves.push({ from, to: FOUNDATION, count: 1 });
    for (let to = 0; to < CASCADE_COUNT; to++) {
      const target = state.cascades[to];
      if (target.length > 0 && canStack(card, target[target.length - 1])) moves.push({ from, to, count: 1 });
    }
    if (firstEmpty >= 0) moves.push({ from, to: firstEmpty, count: 1 });
  }

  // A card is only worth taking back off a foundation to give a lower card
  // somewhere to sit, which rules out any card that nothing could need.
  for (let suit = 0; takeBack && suit < 4; suit++) {
    const count = state.foundations[suit];
    if (count === 0) continue;
    const card = (count - 1) * 4 + suit;
    if (isUnneeded(state, card)) continue;
    const from = HOME0 + suit;
    for (let to = 0; to < CASCADE_COUNT; to++) {
      const target = state.cascades[to];
      if (target.length > 0 && canStack(card, target[target.length - 1])) moves.push({ from, to, count: 1 });
    }
    if (firstEmpty >= 0) moves.push({ from, to: firstEmpty, count: 1 });
  }
  return moves;
}

/** Mutates `state` with the bare move, without the cards a trip home sets off. */
export function applyStackMove(state: GameState, move: SolverMove): void {
  if (move.from < CELL0 && move.to < CELL0) {
    const source = state.cascades[move.from];
    const target = state.cascades[move.to];
    const start = source.length - move.count;
    for (let i = start; i < source.length; i++) target.push(source[i]);
    source.length = start;
  } else {
    applyMove(state, move);
  }
}

/** Mutates `state` exactly as the game does when the player makes this move. */
export function applySolverMove(state: GameState, move: SolverMove): void {
  if (move.to === FOUNDATION) {
    const card = sourceCard(state, move.from)!;
    applyMove(state, move);
    chainHome(state, card, move.from);
  } else {
    applyStackMove(state, move);
  }
}

// Sending up a card that nothing could need is never a mistake, provided the
// cards it takes with it are the same kind. Treating that as the only move
// worth considering keeps the search from branching on when to do it.
function forcedHome(state: GameState): SolverMove | null {
  for (let from = 0; from < FOUNDATION; from++) {
    const card = sourceCard(state, from);
    if (card === null || !isSafeHome(state, card)) continue;
    const trial = cloneState(state);
    applyMove(trial, { from, to: FOUNDATION });
    const replay = cloneState(trial);
    let harmless = true;
    for (const follow of chainHome(trial, card, from)) {
      if (!isUnneeded(replay, sourceCard(replay, follow.from)!)) {
        harmless = false;
        break;
      }
      applyMove(replay, follow);
    }
    if (harmless) return { from, to: FOUNDATION, count: 1 };
  }
  return null;
}

/** Mutates `state`, making every forced trip home, and returns those moves. */
function settle(state: GameState): SolverMove[] {
  const made: SolverMove[] = [];
  for (let move = forcedHome(state); move; move = forcedHome(state)) {
    applySolverMove(state, move);
    made.push(move);
  }
  return made;
}

/** Mutates `state` with a move and whatever is forced after it; returns all of them. */
function advance(state: GameState, move: SolverMove): SolverMove[] {
  applySolverMove(state, move);
  return [move, ...settle(state)];
}

/**
 * Identifies a position regardless of which column or cell each pile sits in,
 * since rearranging whole columns or cells never changes what can be done.
 */
export function canonicalKey(state: GameState): string {
  const piles = state.cascades.map((cascade) => String.fromCharCode(...cascade.map((card) => card + 48)));
  piles.sort();
  const cells: number[] = [];
  for (const cell of state.cells) if (cell !== null) cells.push(cell + 48);
  cells.sort((a, b) => a - b);
  let key = `${piles.join('/')}|${String.fromCharCode(...cells)}`;
  // A held card only behaves differently while it is in play.
  const held = state.held.filter((card) => (card >> 2) >= state.foundations[card & 3]);
  if (held.length > 0) key += `|${String.fromCharCode(...held.sort((a, b) => a - b).map((card) => card + 48))}`;
  return key;
}

// Order-independent across cascades and cells for the same reason as
// canonicalKey, but lossy: only the beam search uses it, where a collision
// costs one skipped position rather than a wrong answer.
function hashState(state: GameState): number {
  let a = 0;
  let b = 0;
  for (let c = 0; c < CASCADE_COUNT; c++) {
    const cascade = state.cascades[c];
    let x = 0x811c9dc5;
    let y = 0x9747b28c;
    for (let i = 0; i < cascade.length; i++) {
      const v = cascade[i] + 1;
      x = Math.imul(x ^ v, 0x01000193);
      y = Math.imul((y << 5) + (y >>> 27) + v, 0x85ebca6b);
    }
    x ^= x >>> 15;
    x = Math.imul(x, 0x2c1b3c6d);
    x ^= x >>> 12;
    y ^= y >>> 13;
    y = Math.imul(y, 0xc2b2ae35);
    y ^= y >>> 16;
    a = (a + x) | 0;
    b = (b + y) | 0;
  }
  for (let i = 0; i < CELL_COUNT; i++) {
    const card = state.cells[i];
    if (card === null) continue;
    let x = Math.imul(card + 1, 0x9e3779b1);
    x ^= x >>> 15;
    let y = Math.imul(card + 101, 0x7feb352d);
    y ^= y >>> 13;
    a = (a + Math.imul(x, 0x85ebca6b)) | 0;
    b = (b + Math.imul(y, 0x846ca68b)) | 0;
  }
  for (const card of state.held) {
    if ((card >> 2) < state.foundations[card & 3]) continue;
    a = (a + Math.imul(card + 211, 0x27d4eb2f)) | 0;
    b = (b + Math.imul(card + 307, 0x165667b1)) | 0;
  }
  return (a >>> 0) * 2097152 + (b >>> 11);
}

export interface Weights {
  notHome: number;
  blocked: number;
  breaks: number;
  cell: number;
  empty: number;
  nextDepth: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  notHome: 10,
  blocked: 6,
  breaks: 2,
  cell: 3,
  empty: 8,
  nextDepth: 2,
};

/** Lower is closer to a win. */
export function evaluate(state: GameState, w: Weights = DEFAULT_WEIGHTS): number {
  const f = state.foundations;
  let score = (52 - f[0] - f[1] - f[2] - f[3]) * w.notHome;
  const lowest = [0, 0, 0, 0];
  for (let c = 0; c < CASCADE_COUNT; c++) {
    const cascade = state.cascades[c];
    const length = cascade.length;
    if (length === 0) {
      score -= w.empty;
      continue;
    }
    lowest[0] = lowest[1] = lowest[2] = lowest[3] = 99;
    for (let i = 0; i < length; i++) {
      const card: Card = cascade[i];
      const rank = card >> 2;
      const suit = card & 3;
      if (lowest[suit] < rank) score += w.blocked;
      else lowest[suit] = rank;
      if (i > 0 && !canStack(card, cascade[i - 1])) score += w.breaks;
      if (rank === f[suit]) score += (length - 1 - i) * w.nextDepth;
    }
  }
  for (let i = 0; i < CELL_COUNT; i++) if (state.cells[i] !== null) score += w.cell;
  return score;
}

interface BeamOutcome {
  moves: SolverMove[] | null;
  explored: number;
}

function beamSearch(
  start: GameState,
  width: number,
  maxDepth: number,
  weights: Weights,
  takeBack: boolean,
): BeamOutcome {
  const parents: number[] = [-1];
  const via: SolverMove[][] = [[]];
  let level: { state: GameState; node: number }[] = [{ state: start, node: 0 }];
  const seen = new Set<number>([hashState(start)]);
  let explored = 0;

  for (let depth = 0; depth < maxDepth && level.length > 0; depth++) {
    const next: { state: GameState; node: number; score: number }[] = [];
    for (const { state, node } of level) {
      explored++;
      for (const move of legalMoves(state, takeBack)) {
        const child = cloneState(state);
        const made = advance(child, move);
        if (isWon(child)) {
          const path = [made];
          for (let n = node; parents[n] >= 0; n = parents[n]) path.push(via[n]);
          return { moves: path.reverse().flat(), explored };
        }
        const hash = hashState(child);
        if (seen.has(hash)) continue;
        seen.add(hash);
        parents.push(node);
        via.push(made);
        next.push({ state: child, node: parents.length - 1, score: evaluate(child, weights) });
      }
    }
    if (next.length > width) {
      next.sort((p, q) => p.score - q.score);
      next.length = width;
    }
    level = next;
  }
  return { moves: null, explored };
}

interface ProofOutcome {
  status: SolveStatus;
  moves: SolverMove[];
  explored: number;
}

// Depth-first over every reachable position with exact keys, so running out
// of positions is a proof that the game is lost rather than a guess.
function exhaust(start: GameState, limit: number, weights: Weights, takeBack: boolean): ProofOutcome {
  interface Frame {
    children: { state: GameState; made: SolverMove[]; score: number }[];
    next: number;
  }
  const expand = (state: GameState): Frame => {
    const children = legalMoves(state, takeBack).map((move) => {
      const child = cloneState(state);
      const made = advance(child, move);
      return { state: child, made, score: evaluate(child, weights) };
    });
    children.sort((p, q) => p.score - q.score);
    return { children, next: 0 };
  };

  const seen = new Set<string>([canonicalKey(start)]);
  const stack: Frame[] = [expand(start)];
  const path: SolverMove[][] = [];
  let explored = 1;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.next >= frame.children.length) {
      stack.pop();
      path.pop();
      continue;
    }
    const { state, made } = frame.children[frame.next++];
    if (isWon(state)) return { status: 'winnable', moves: [...path, made].flat(), explored };
    const key = canonicalKey(state);
    if (seen.has(key)) continue;
    if (explored >= limit) return { status: 'unknown', moves: [], explored };
    seen.add(key);
    explored++;
    path.push(made);
    stack.push(expand(state));
  }
  return { status: 'unwinnable', moves: [], explored };
}

/**
 * Decides whether a position can still be won and, when it can, returns a
 * line of play. `unknown` means the budget ran out before either a win or a
 * proof of loss turned up.
 */
export function solve(start: GameState, options: SolveOptions = {}, weights: Weights = DEFAULT_WEIGHTS): SolveResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const root = cloneState(start);
  const opening = settle(root);
  if (isWon(root)) return { status: 'winnable', moves: opening, explored: 0 };

  let explored = 0;
  let fallback: SolverMove[] | null = null;
  const prove = (limit: number): SolveResult | null => {
    if (limit <= 0) return null;
    const proof = exhaust(root, limit, weights, opts.takeBack);
    explored += proof.explored;
    if (proof.status === 'unwinnable') return { status: 'unwinnable', moves: [], explored };
    if (proof.status === 'winnable') fallback = proof.moves;
    return null;
  };

  // A win that leaves the foundations alone reads as ordinary play, so those
  // are looked for first. Bringing cards back down is for when nothing else works.
  const passes: { width: number; takeBack: boolean }[] = [];
  if (opts.takeBack) for (const width of opts.beamWidths.slice(0, 3)) passes.push({ width, takeBack: false });
  for (const width of opts.beamWidths) passes.push({ width, takeBack: opts.takeBack });

  let proved = false;
  for (const pass of passes) {
    if (pass.takeBack === opts.takeBack && !proved) {
      proved = true;
      const lost = prove(opts.quickProofLimit);
      if (lost) return lost;
    }
    const beam = beamSearch(root, pass.width, opts.maxDepth, weights, pass.takeBack);
    explored += beam.explored;
    if (beam.moves) return { status: 'winnable', moves: [...opening, ...beam.moves], explored };
  }
  if (!fallback) {
    const lost = prove(opts.proofLimit);
    if (lost) return lost;
  }
  return fallback
    ? { status: 'winnable', moves: [...opening, ...(fallback as SolverMove[])], explored }
    : { status: 'unknown', moves: [], explored };
}
