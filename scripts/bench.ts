import { deal } from '../src/engine/deal.ts';
import { DEFAULT_OPTIONS, applySolverMove, legalMoves, solve } from '../src/engine/solver.ts';
import { cloneState, isWon } from '../src/engine/state.ts';

const [first = '1', last = '200'] = process.argv.slice(2);
const widths = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : DEFAULT_OPTIONS.beamWidths;

let solved = 0;
let totalMoves = 0;
let totalMs = 0;
let worstMs = 0;
const failures: string[] = [];
for (let n = Number(first); n <= Number(last); n++) {
  const start = deal(n);
  const began = performance.now();
  const result = solve(start, { beamWidths: widths });
  const ms = performance.now() - began;
  totalMs += ms;
  worstMs = Math.max(worstMs, ms);
  if (result.status !== 'winnable') {
    failures.push(`#${n}: ${result.status} after ${result.explored} positions, ${ms.toFixed(0)} ms`);
    continue;
  }
  const state = cloneState(start);
  for (const move of result.moves) {
    const legal = legalMoves(state).some((m) => m.from === move.from && m.to === move.to && m.count === move.count);
    if (!legal) throw new Error(`Deal ${n}: solver returned an illegal move`);
    applySolverMove(state, move);
  }
  if (!isWon(state)) throw new Error(`Deal ${n}: solution does not win`);
  solved++;
  totalMoves += result.moves.length;
}
const count = Number(last) - Number(first) + 1;
console.log(`solved ${solved}/${count}  avg ${(totalMoves / Math.max(solved, 1)).toFixed(1)} moves`);
console.log(`avg ${(totalMs / count).toFixed(1)} ms  worst ${worstMs.toFixed(0)} ms`);
for (const failure of failures) console.log(failure);
