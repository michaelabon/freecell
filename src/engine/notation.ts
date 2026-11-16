import { cardCode, parseCard } from './cards.ts';
import { CELL0, type GameState, emptyState } from './state.ts';

export interface Layout {
  /** One string per cascade, bottom card first: "KS QH JC". */
  cascades?: string[];
  cells?: string[];
  /** Top card home per suit, such as ["3C", "AD"]. */
  home?: string[];
}

export function stateFromLayout(layout: Layout): GameState {
  const state = emptyState();
  (layout.cascades ?? []).forEach((text, i) => {
    state.cascades[i] = text.split(/\s+/).filter(Boolean).map(parseCard);
  });
  (layout.cells ?? []).forEach((code, i) => {
    state.cells[i] = code ? parseCard(code) : null;
  });
  for (const code of layout.home ?? []) {
    const card = parseCard(code);
    state.foundations[card & 3] = (card >> 2) + 1;
  }
  return state;
}

/** Parses the row-by-row picture of a deal, where each line is one row across the cascades. */
export function stateFromRows(rows: string): GameState {
  const state = emptyState();
  for (const line of rows.trim().split('\n')) {
    line.trim().split(/\s+/).forEach((code, column) => state.cascades[column].push(parseCard(code)));
  }
  return state;
}

export function formatState(state: GameState): string {
  const cells = state.cells.map((card) => (card === null ? '--' : cardCode(card))).join(' ');
  const home = state.foundations.map((count, suit) => (count ? cardCode((count - 1) * 4 + suit) : '--')).join(' ');
  const cascades = state.cascades.map((cascade, i) => `${i}: ${cascade.map(cardCode).join(' ')}`);
  return [`cells: ${cells}   home: ${home}`, ...cascades].join('\n');
}

export function locationName(loc: number): string {
  if (loc < CELL0) return `column ${loc + 1}`;
  return loc === CELL0 + 4 ? 'foundation' : 'free cell';
}
