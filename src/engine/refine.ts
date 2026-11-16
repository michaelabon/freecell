import { resolveClick } from './actions.ts';
import { type Card, rankOf, suitOf } from './cards.ts';
import { type Destination, type Step, buildPlan, resolveStep } from './hint.ts';
import { type SolverMove, applySolverMove, canonicalKey } from './solver.ts';
import { capacityFor } from './stackMove.ts';
import { CELL0, FOUNDATION, type GameState, cloneState, isCascade, isWon, locate, runLength } from './state.ts';

/** Finds a winning line from a position, or null when none turns up quickly. */
export type LineFinder = (state: GameState) => Step[] | null;

export interface RefinedLine {
  steps: Step[];
  /** How many leading steps form the tidied plan for the next card to go home. */
  planLength: number;
}

const MAX_EXTRA_SOLVES = 8;

const isHome = (state: GameState, card: Card): boolean => rankOf(card) < state.foundations[suitOf(card)];

function canCarry(state: GameState, move: SolverMove): boolean {
  if (!isCascade(move.from)) return true;
  if (move.count > runLength(state.cascades[move.from])) return false;
  return move.count === 1 || (isCascade(move.to) && move.count <= capacityFor(state, move.to));
}

interface Outcome {
  ok: boolean;
  state: GameState;
  used: number;
}

/** Plays steps in order, stopping as soon as `target` is home when one is given. */
function run(start: GameState, steps: Step[], target: Card | null): Outcome {
  const state = cloneState(start);
  for (let i = 0; i < steps.length; i++) {
    const move = resolveStep(state, steps[i]);
    if (!move || !canCarry(state, move)) return { ok: false, state, used: i };
    applySolverMove(state, move);
    if (target !== null && isHome(state, target)) return { ok: true, state, used: i + 1 };
  }
  return { ok: target === null, state, used: steps.length };
}

/**
 * Drops every step the target can get home without, as long as `accept`
 * agrees that the position this leaves is one worth ending up in.
 */
export function prunePlan(
  start: GameState,
  steps: Step[],
  target: Card,
  accept: (end: GameState) => boolean = () => true,
): Step[] {
  let kept = steps;
  for (let i = kept.length - 1; i >= 0; i--) {
    const without = kept.filter((_, k) => k !== i);
    const outcome = run(start, without, target);
    if (!outcome.ok || !accept(outcome.state)) continue;
    kept = without.slice(0, outcome.used);
    i = kept.length;
  }
  return kept;
}

interface Trace {
  from: number;
  emptied: boolean;
  /** The card left on top of the stack that moved. */
  top: Card;
  /** The card the move exposed, if any. */
  uncovered: Card | null;
}

function follows(state: GameState, previous: Trace, step: Step): boolean {
  const move = resolveStep(state, step);
  if (!move) return false;
  if (isCascade(previous.from) && move.from === previous.from) return true;
  if (step.dest.kind === 'onto' && (step.dest.card === previous.top || step.dest.card === previous.uncovered)) return true;
  if (previous.emptied && step.dest.kind === 'empty') return true;
  return !isCascade(previous.from) && step.dest.kind === 'cell';
}

/**
 * Reorders steps so each leads into the next: digging down one column,
 * building on the card just placed, or using the space just opened. Working
 * backwards from the last step puts every preparatory move right before the
 * move that needs it, which is where its purpose is easiest to see. The same
 * cards end in the same places, so the rest of the line still holds.
 */
export function reorderPlan(start: GameState, steps: Step[]): Step[] {
  const goal = run(start, steps, null);
  if (!goal.ok) return steps;
  const key = canonicalKey(goal.state);
  let remaining = steps.slice();
  let ordered: Step[] = [];

  while (remaining.length > 0) {
    let chosen = remaining[remaining.length - 1];
    if (ordered.length > 0) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const earlier = remaining.filter((_, k) => k !== i);
        if (leadsInto(start, earlier, remaining[i], ordered, key)) {
          chosen = remaining[i];
          break;
        }
      }
    }
    ordered = [chosen, ...ordered];
    remaining = remaining.filter((step) => step !== chosen);
  }
  return ordered;
}

/** True when `step` can come right before `later` and `later[0]` follows from it. */
function leadsInto(start: GameState, earlier: Step[], step: Step, later: Step[], key: string): boolean {
  const before = run(start, earlier, null);
  if (!before.ok) return false;
  const state = before.state;
  const move = resolveStep(state, step);
  if (!move || !canCarry(state, move)) return false;
  const source = isCascade(move.from) ? state.cascades[move.from] : null;
  const trace: Trace = {
    from: move.from,
    emptied: source !== null && source.length === move.count,
    top: source ? source[source.length - 1] : step.card,
    uncovered: source && source.length > move.count ? source[source.length - move.count - 1] : null,
  };
  applySolverMove(state, move);
  if (!follows(state, trace, later[0])) return false;
  const after = run(state, later, null);
  return after.ok && canonicalKey(after.state) === key;
}

/** Where a click on the step's card would send it, when that is somewhere else. */
function clickDestination(state: GameState, step: Step): Destination | null {
  const { loc, index } = locate(state, step.card);
  if (loc === FOUNDATION) return null;
  if (isCascade(loc) && state.cascades[loc].length - index !== step.count) return null;
  const attempt = resolveClick(state, step.card);
  if (!attempt.ok) return null;
  const to = attempt.moves[attempt.moves.length - 1].to;
  if (to === FOUNDATION) return { kind: 'home' };
  if (to >= CELL0) return { kind: 'cell' };
  const target = state.cascades[to];
  return target.length > 0 ? { kind: 'onto', card: target[target.length - 1] } : { kind: 'empty' };
}

const sameDestination = (a: Destination, b: Destination): boolean =>
  a.kind === b.kind && (a.kind !== 'onto' || a.card === (b as { card: Card }).card);

/**
 * Tidies the opening of a winning line into a plan a person can follow: only
 * the moves that get the next card home, in an order where each leads to the
 * next, and sent wherever a click would send them whenever that still wins.
 */
export function refineLine(start: GameState, line: Step[], findLine: LineFinder): RefinedLine {
  const first = buildPlan(start, line);
  const original: RefinedLine = { steps: line, planLength: first?.steps.length ?? 0 };
  if (!first) return original;
  const target = first.target;
  let plan = first.steps;
  let rest = line.slice(plan.length);
  let solves = 0;

  // A move the target does not need may still be what keeps the game
  // winnable, so each removal has to leave a position with a known way out.
  plan = prunePlan(start, plan, target, (end) => {
    if (solves >= MAX_EXTRA_SOLVES) return false;
    solves++;
    const onward = isWon(end) ? [] : findLine(end);
    if (onward) rest = onward;
    return onward !== null;
  });

  plan = reorderPlan(start, plan);

  for (let i = 0; i < plan.length; i++) {
    const before = run(start, plan.slice(0, i), null).state;
    const preferred = clickDestination(before, plan[i]);
    if (!preferred || sameDestination(preferred, plan[i].dest)) continue;
    const swapped = plan.map((step, k) => (k === i ? { ...step, dest: preferred } : step));
    const outcome = run(start, swapped, target);
    if (!outcome.ok) continue;
    if (canonicalKey(outcome.state) === canonicalKey(run(start, plan, null).state)) {
      plan = swapped;
      continue;
    }
    if (solves >= MAX_EXTRA_SOLVES) continue;
    solves++;
    const onward = isWon(outcome.state) ? [] : findLine(outcome.state);
    if (onward) {
      plan = swapped.slice(0, outcome.used);
      rest = onward;
    }
  }

  const steps = [...plan, ...rest];
  const finish = run(start, steps, null);
  if (!finish.ok || !isWon(finish.state)) return original;
  return { steps, planLength: buildPlan(start, steps)?.steps.length ?? 0 };
}
