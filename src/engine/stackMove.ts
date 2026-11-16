import { type Card, canStack } from './cards.ts';
import {
  CASCADE_COUNT,
  CELL0,
  CELL_COUNT,
  type GameState,
  type Move,
  emptyCascadeCount,
  freeCellCount,
  isCascade,
  runLength,
} from './state.ts';

/** How many cards can move as one stack using only free cells and empty cascades as parking. */
export const stackCapacity = (freeCells: number, emptyCascades: number): number =>
  (freeCells + 1) << emptyCascades;

/** Capacity for a move into `to`, which does not count as parking when it is itself empty. */
export function capacityFor(state: GameState, to: number): number {
  const empties = emptyCascadeCount(state) - (state.cascades[to].length === 0 ? 1 : 0);
  return stackCapacity(freeCellCount(state), empties);
}

export function canReceiveStack(state: GameState, from: number, count: number, to: number): boolean {
  if (from === to || !isCascade(from) || !isCascade(to)) return false;
  const source = state.cascades[from];
  if (count < 1 || count > runLength(source)) return false;
  const target = state.cascades[to];
  return target.length === 0 || canStack(source[source.length - count], target[target.length - 1]);
}

/**
 * Finds the single-card moves that carry `count` cards from one cascade to
 * another, or null when there is not enough room. Only the cards in the stack
 * ever move, so everything else ends exactly where it started.
 */
export function planStackMove(
  state: GameState,
  from: number,
  count: number,
  to: number,
  nodeLimit = 20000,
): Move[] | null {
  if (!canReceiveStack(state, from, count, to)) return null;
  if (count === 1) return [{ from, to }];
  const searched = searchPlan(state, from, count, to, nodeLimit);
  if (searched !== 'limit') return searched;
  return count <= capacityFor(state, to) ? classicPlan(state, from, count, to) : null;
}

// Breadth-first over where each card of the stack sits, so the plan is the
// shortest one and can park cards on other cascades that happen to accept
// them, which the free-cell formula alone would not allow.
function searchPlan(
  state: GameState,
  from: number,
  count: number,
  to: number,
  nodeLimit: number,
): Move[] | null | 'limit' {
  const source = state.cascades[from];
  const run: Card[] = source.slice(source.length - count);
  const baseTop = new Int8Array(CASCADE_COUNT);
  for (let c = 0; c < CASCADE_COUNT; c++) {
    const cascade = state.cascades[c];
    const length = c === from ? cascade.length - count : cascade.length;
    baseTop[c] = length > 0 ? cascade[length - 1] : -1;
  }
  const cellFree: boolean[] = state.cells.map((cell) => cell === null);

  const positions = new Uint8Array((nodeLimit + 1) * count);
  const parent = new Int32Array(nodeLimit + 1);
  const moveFrom = new Uint8Array(nodeLimit + 1);
  const moveTo = new Uint8Array(nodeLimit + 1);
  const seen = new Set<string>();
  const keyOf = (offset: number): string => {
    let key = '';
    for (let i = 0; i < count; i++) {
      const loc = positions[offset + i];
      key += String.fromCharCode(97 + (loc >= CELL0 ? CELL0 : loc));
    }
    return key;
  };

  positions.fill(from, 0, count);
  parent[0] = -1;
  seen.add(keyOf(0));
  let nodeCount = 1;

  const topAt = new Int8Array(CASCADE_COUNT);
  const cellTaken = new Uint8Array(CELL_COUNT);

  for (let head = 0; head < nodeCount; head++) {
    const offset = head * count;
    topAt.fill(-1);
    cellTaken.fill(0);
    for (let i = 0; i < count; i++) {
      const loc = positions[offset + i];
      if (loc < CELL0) topAt[loc] = i;
      else cellTaken[loc - CELL0] = 1;
    }
    let freeCell = -1;
    for (let c = 0; c < CELL_COUNT; c++) {
      if (cellFree[c] && !cellTaken[c]) {
        freeCell = CELL0 + c;
        break;
      }
    }
    let firstEmpty = -1;
    for (let c = 0; c < CASCADE_COUNT; c++) {
      if (c !== to && topAt[c] < 0 && baseTop[c] < 0) {
        firstEmpty = c;
        break;
      }
    }

    for (let i = 0; i < count; i++) {
      const at = positions[offset + i];
      const inCascade = at < CELL0;
      if (inCascade && topAt[at] !== i) continue;
      const aloneOnEmpty = inCascade && baseTop[at] < 0 && (i === 0 || positions[offset + i - 1] !== at);

      const destinations: number[] = [];
      const fits = (c: number): boolean => {
        if (c === at) return false;
        if (topAt[c] >= 0) return topAt[c] === i - 1;
        return baseTop[c] < 0 ? c === to : canStack(run[i], baseTop[c]);
      };
      if (fits(to)) destinations.push(to);
      if (inCascade && freeCell >= 0) destinations.push(freeCell);
      for (let c = 0; c < CASCADE_COUNT; c++) if (c !== to && fits(c)) destinations.push(c);
      if (firstEmpty >= 0 && !aloneOnEmpty) destinations.push(firstEmpty);

      for (const dest of destinations) {
        if (nodeCount > nodeLimit) return 'limit';
        const next = nodeCount * count;
        positions.copyWithin(next, offset, offset + count);
        positions[next + i] = dest;
        const key = keyOf(next);
        if (seen.has(key)) continue;
        seen.add(key);
        parent[nodeCount] = head;
        moveFrom[nodeCount] = at;
        moveTo[nodeCount] = dest;
        let done = true;
        for (let k = 0; k < count; k++) {
          if (positions[next + k] !== to) {
            done = false;
            break;
          }
        }
        if (done) {
          const moves: Move[] = [];
          for (let n = nodeCount; parent[n] >= 0; n = parent[n]) moves.push({ from: moveFrom[n], to: moveTo[n] });
          return moves.reverse();
        }
        nodeCount++;
      }
    }
  }
  return null;
}

function classicPlan(state: GameState, from: number, count: number, to: number): Move[] {
  const moves: Move[] = [];
  const cells: number[] = [];
  state.cells.forEach((cell, i) => cell === null && cells.push(CELL0 + i));
  const empties: number[] = [];
  state.cascades.forEach((cascade, c) => cascade.length === 0 && c !== to && empties.push(c));

  const direct = (n: number, src: number, dst: number): void => {
    for (let i = 0; i < n - 1; i++) moves.push({ from: src, to: cells[i] });
    moves.push({ from: src, to: dst });
    for (let i = n - 2; i >= 0; i--) moves.push({ from: cells[i], to: dst });
  };
  const carry = (n: number, src: number, dst: number, spare: number[]): void => {
    if (n <= cells.length + 1) return direct(n, src, dst);
    const rest = spare.slice(1);
    const restCapacity = stackCapacity(cells.length, rest.length);
    if (n <= restCapacity) return carry(n, src, dst, rest);
    const parked = Math.min(restCapacity, n - 1);
    carry(parked, src, spare[0], rest);
    carry(n - parked, src, dst, rest);
    carry(parked, spare[0], dst, rest);
  };
  carry(count, from, to, empties);
  return moves;
}
