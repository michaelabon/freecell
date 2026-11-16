# FreeCell

A FreeCell game that runs locally in the browser, with as many deals as you want and a hint engine for when you get stuck.

## Running it

```sh
pnpm install
pnpm dev        # http://127.0.0.1:5199
```

`pnpm build` writes a static site to `dist/`, and `pnpm preview` serves it.

## Playing

- **Click or tap a card** to send it to the best legal spot. Clicking a card inside a run moves it together with the cards on top of it, one card at a time, using free cells, empty columns and any other column that will take a card.
- **Drag** a card or a run to choose the destination yourself.
- A move that can't be made **wiggles**. Try the same card again and the drawer explains why, for example how many free cells a stack of that size needs.
- Cards that are safe to send to the foundation go up by themselves.
- Buried cards that are no use yet are dimmed. The next card each foundation is waiting for stays bright wherever it is.

| Key | Action |
| --- | --- |
| `H` | Hint (press again for step-by-step) |
| `U` or `Cmd/Ctrl+Z` | Undo |
| `R` or `Shift+Cmd/Ctrl+Z` | Redo |
| `N` | New game |
| `Esc` | Close the drawer |

### Hints

The first press picks out the next card to get to the foundation and puts a sparkle on it. The second press lists the moves that get it there, highlights the card to move and outlines where it goes, and advances as you make each move. Go your own way and the plan is redrawn from wherever you end up.

### Stuck detection

Every position is analysed in the background. If the game can no longer be won, you are told 90 seconds after the move that lost it, with an offer to roll back to the last winnable position. Asking for a hint in a lost position tells you straight away, as does running out of moves entirely.

### Deals

New games are always winnable: each deal is solved before it is dealt. Deal numbers use the classic Microsoft FreeCell shuffle, so deal #1 here is the deal #1 you may remember. Click the deal number to play a specific one, or open `/?deal=617`.

The game in progress is saved in `localStorage` and resumes on reload.

## Testing

```sh
pnpm test       # unit and property tests (Vitest, fast-check)
pnpm e2e        # drives the game in Chrome (Playwright)
pnpm check      # type-check
pnpm bench 1 32000   # solve a range of deals and report
```

The solver agrees with the published result for the 32,000 original deals: every one is winnable except #11982, which it proves lost.

Two URL parameters help when testing by hand: `?deal=N` picks the deal and `?stuckDelay=5` shortens the stuck warning to five seconds.

## Layout

| Path | What lives there |
| --- | --- |
| `src/engine/` | Rules, deals, stack-move planning, the solver and hint plans. No DOM. |
| `src/worker/` | Runs the solver off the main thread. |
| `src/game/` | The controller: history, animation queue, hint and stuck state, saving. |
| `src/ui/` | Svelte components and the board layout maths. |
| `e2e/` | Browser tests. |
