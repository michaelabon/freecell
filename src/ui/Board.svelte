<script lang="ts">
  import { type Card, parseCard, rankOf, suitOf } from '../engine/cards.ts';
  import {
    CELL0,
    CELL_COUNT,
    CASCADE_COUNT,
    FOUNDATION,
    idleCards,
    locate,
    runLength,
    sourceCard,
  } from '../engine/state.ts';
  import type { Game } from '../game/game.svelte.ts';
  import CardView from './Card.svelte';
  import Suit from './Suit.svelte';
  import {
    FOUNDATION_SUITS,
    TOP_SCALE,
    boardWidth,
    cellX,
    columnX,
    foundationSlotX,
    computeMetrics,
    landingSpot,
    pileAt,
    placeCards,
  } from './layout.ts';

  let { game, reserve = 0 }: { game: Game; reserve?: number } = $props();

  const DRAG_THRESHOLD = 6;

  interface Drag {
    card: Card;
    cards: Card[];
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    movable: boolean;
    active: boolean;
  }

  let frame: HTMLElement;
  let width = $state(0);
  let height = $state(0);
  let drag = $state.raw<Drag | null>(null);

  const m = $derived(computeMetrics(width, height, reserve));
  const placed = $derived(placeCards(game.view, m));
  const visible = $derived(placed.filter((p) => p !== undefined));
  const dragged = $derived(new Set(drag?.active ? drag.cards : []));
  const idle = $derived(new Set(idleCards(game.view)));

  const wiggling = $derived.by(() => {
    const wiggle = game.wiggle;
    if (!wiggle) return new Set<Card>();
    const { loc, index } = locate(game.view, wiggle.card);
    return new Set(loc < CELL0 ? game.view.cascades[loc].slice(index) : [wiggle.card]);
  });

  const glowing = $derived.by(() => {
    const move = game.hintMove;
    if (!move) return new Set<Card>();
    if (move.from >= CELL0) return new Set([sourceCard(game.state, move.from)!]);
    const cascade = game.state.cascades[move.from];
    return new Set(cascade.slice(cascade.length - move.count));
  });

  const landing = $derived.by(() => {
    const move = game.hintMove;
    if (!move) return null;
    const head = [...glowing][0];
    return landingSpot(game.state, m, move.to, suitOf(head));
  });

  // The corner rank and suit fill the strip a covered card shows, so they
  // stay as large as the fan allows instead of shrinking with the card.
  function indexSize(strip: number | null): number {
    return Math.min((strip || m.fan) * 0.8, m.cardW * 0.43);
  }

  function stackFrom(card: Card): { cards: Card[]; movable: boolean } | null {
    const state = game.state;
    const { loc, index } = locate(state, card);
    if (loc === FOUNDATION) {
      const onTop = state.foundations[suitOf(card)] === rankOf(card) + 1;
      return onTop ? { cards: [card], movable: true } : null;
    }
    if (loc >= CELL0) return { cards: [card], movable: true };
    const cascade = state.cascades[loc];
    return { cards: cascade.slice(index), movable: cascade.length - index <= runLength(cascade) };
  }

  function onpointerdown(event: PointerEvent) {
    if (event.button !== 0 || drag) return;
    const element = (event.target as Element).closest<HTMLElement>('[data-card]');
    if (!element) return;
    const card = parseCard(element.dataset.card!);
    game.flush();
    const stack = stackFrom(card);
    if (!stack) return;
    frame.setPointerCapture(event.pointerId);
    drag = { card, ...stack, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, active: false };
  }

  function onpointermove(event: PointerEvent) {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const active = drag.active || (drag.movable && Math.hypot(dx, dy) > DRAG_THRESHOLD);
    drag = { ...drag, dx, dy, active };
  }

  function onpointerup() {
    if (!drag) return;
    const finished = drag;
    drag = null;
    if (!finished.active) {
      game.clickCard(finished.card);
      return;
    }
    const origin = placed[finished.card];
    if (!origin) return;
    const half = origin.scale / 2;
    const target = pileAt(m, origin.x + finished.dx + m.cardW * half, origin.y + finished.dy + m.cardH * half);
    if (target !== null) game.dropCard(finished.card, target);
  }

  function onpointercancel() {
    drag = null;
  }
</script>

<div class="frame" bind:this={frame} bind:clientWidth={width} bind:clientHeight={height}
  {onpointerdown} {onpointermove} {onpointerup} {onpointercancel} role="application" aria-label="FreeCell board">
  {#if width > 0 && height > 0}
    <div
      class="board"
      style:width="{boardWidth(m)}px"
      style:--card-w="{m.cardW}px"
      style:--card-h="{m.cardH}px"
    >
      {#each Array(CELL_COUNT) as _, i (i)}
        <div class="slot cell" style:transform="translate({cellX(m, i)}px, 0) scale({TOP_SCALE})"></div>
      {/each}
      {#each FOUNDATION_SUITS as suit, i (suit)}
        <div class="slot home" style:transform="translate({foundationSlotX(m, i)}px, 0) scale({TOP_SCALE})">
          <span><Suit {suit} /></span>
        </div>
      {/each}
      {#each Array(CASCADE_COUNT) as _, i (i)}
        <div class="slot column" style:transform="translate({columnX(m, i)}px, {m.cascadeY}px)"></div>
      {/each}

      {#if landing}
        <div class="landing" style:transform="translate({landing.x}px, {landing.y}px) scale({landing.scale})"></div>
      {/if}

      {#each visible as p (p.card)}
        <CardView
          card={p.card}
          x={dragged.has(p.card) ? p.x + drag!.dx : p.x}
          y={dragged.has(p.card) ? p.y + drag!.dy : p.y}
          z={p.z}
          scale={dragged.has(p.card) ? 1 : p.scale}
          strip={p.strip}
          index={indexSize(p.strip)}
          dragging={dragged.has(p.card)}
          dim={idle.has(p.card) && game.hintTarget !== p.card}
          wiggle={wiggling.has(p.card) ? game.wiggle!.nonce : 0}
          sparkle={game.hintTarget === p.card || (game.won && rankOf(p.card) === 12)}
          glow={glowing.has(p.card)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .frame {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
    touch-action: none;
  }
  .board {
    position: relative;
    height: 100%;
    margin: 0 auto;
  }
  .slot {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    width: var(--card-w);
    height: var(--card-h);
    border-radius: calc(var(--card-w) * 0.09);
    box-shadow: inset 0 0 0 2px var(--slot-edge);
    background: var(--slot-fill);
  }
  .slot.column {
    background: none;
    box-shadow: inset 0 0 0 2px var(--slot-faint);
  }
  .slot.home span {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 42%;
    height: 42%;
    color: #fff;
    opacity: 0.2;
  }
  .landing {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    z-index: 900;
    width: var(--card-w);
    height: var(--card-h);
    border-radius: calc(var(--card-w) * 0.09);
    border: 3px dashed var(--accent);
    background: var(--accent-faint);
    pointer-events: none;
    animation: pulse 1.1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 1;
    }
  }
</style>
