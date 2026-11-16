<script lang="ts">
  import { untrack } from 'svelte';
  import { type Card, RANK_LABELS, RANK_NAMES, SUIT_NAMES, cardCode, isRed, rankOf, suitOf } from '../engine/cards.ts';
  import Suit from './Suit.svelte';

  interface Props {
    card: Card;
    x: number;
    y: number;
    z: number;
    strip: number | null;
    /** Font size of the corner rank and suit, in pixels. */
    index: number;
    dragging?: boolean;
    dim?: boolean;
    wiggle?: number;
    sparkle?: boolean;
    glow?: boolean;
  }
  let { card, x, y, z, strip, index, dragging = false, dim = false, wiggle = 0, sparkle = false, glow = false }: Props = $props();

  const LIFT_MS = 380;
  let face: HTMLElement;
  let lifted = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    void x;
    void y;
    untrack(() => {
      lifted = true;
      clearTimeout(timer);
      timer = setTimeout(() => (lifted = false), LIFT_MS);
    });
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (wiggle === 0) return;
    face.animate(
      [
        { transform: 'translateX(0) rotate(0)' },
        { transform: 'translateX(-5%) rotate(-2.5deg)' },
        { transform: 'translateX(5%) rotate(2.5deg)' },
        { transform: 'translateX(-3%) rotate(-1.5deg)' },
        { transform: 'translateX(2%) rotate(1deg)' },
        { transform: 'translateX(0) rotate(0)' },
      ],
      { duration: 320, easing: 'ease-out' },
    );
  });
</script>

<div
  class="card"
  class:red={isRed(card)}
  class:dragging
  class:dim
  class:glow
  data-card={cardCode(card)}
  role="button"
  tabindex="-1"
  aria-label="{RANK_NAMES[rankOf(card)]} of {SUIT_NAMES[suitOf(card)]}"
  style:transform="translate3d({x}px, {y}px, 0)"
  style:z-index={dragging ? 2000 + z : lifted ? 1000 + z : z}
>
  <div class="face" bind:this={face}>
    <div class="index" style:font-size="{index}px">
      <span class="pip"><Suit suit={suitOf(card)} /></span>
      <span class="rank">{RANK_LABELS[rankOf(card)]}</span>
    </div>
    <div class="big">{RANK_LABELS[rankOf(card)]}</div>
    {#if sparkle}
      <div
        class="sparkle"
        class:covered={strip !== null && !dragging}
        style:height={strip !== null && !dragging ? `${strip + 3}px` : null}
        aria-hidden="true">
        {#each Array(10) as _, i (i)}
          <i style:--i={i}></i>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .card {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--card-w);
    height: var(--card-h);
    transition: transform var(--move-ms) var(--move-ease);
    will-change: transform;
    touch-action: none;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }
  .card.dragging {
    transition: none;
    cursor: grabbing;
  }
  .face {
    position: absolute;
    inset: 0;
    border-radius: calc(var(--card-w) * 0.09);
    background: var(--card-face);
    color: var(--suit-black);
    box-shadow:
      0 0 0 1px var(--card-edge),
      0 1px 2px rgb(0 0 0 / 0.25);
    transition:
      box-shadow 160ms ease,
      filter 220ms ease;
  }
  .card.dim .face {
    filter: brightness(0.72) saturate(0.82);
  }
  .card.dragging .face {
    box-shadow:
      0 0 0 1px var(--card-edge),
      0 10px 22px rgb(0 0 0 / 0.38);
  }
  .card.red .face {
    color: var(--suit-red);
  }
  .card.glow .face {
    box-shadow:
      0 0 0 3px var(--accent),
      0 0 18px 2px var(--accent-soft);
  }
  .index {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 1.22em;
    padding: 0 5%;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.07em;
  }
  .pip {
    width: 0.82em;
    height: 0.82em;
  }
  /* Sits below the widest fan so it only shows on a card nothing covers. */
  .big {
    position: absolute;
    left: 0;
    right: 0;
    top: 46%;
    bottom: 0;
    display: grid;
    place-items: center;
    font-size: calc(var(--card-h) * 0.5);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.07em;
  }

  .sparkle {
    position: absolute;
    inset: -3px;
    border-radius: calc(var(--card-w) * 0.09 + 3px);
    pointer-events: none;
    box-shadow:
      0 0 0 3px var(--accent),
      0 0 16px 3px var(--accent-soft);
    animation: shimmer 1.4s ease-in-out infinite;
  }
  .sparkle.covered {
    bottom: auto;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .sparkle i {
    --t: calc(var(--i) / 10);
    position: absolute;
    width: calc(var(--card-w) * 0.2);
    aspect-ratio: 1;
    background: var(--accent-bright);
    clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%);
    offset-path: inset(0 round calc(var(--card-w) * 0.09 + 3px));
    offset-distance: calc(var(--t) * 100%);
    offset-rotate: 0deg;
    animation:
      orbit 5s linear infinite,
      twinkle 1.1s ease-in-out infinite;
    animation-delay:
      calc(var(--t) * -5s),
      calc(var(--i) * -0.37s);
  }
  @keyframes orbit {
    to {
      offset-distance: calc(var(--t) * 100% + 100%);
    }
  }
  @keyframes twinkle {
    0%,
    100% {
      scale: 0.2;
      opacity: 0;
    }
    50% {
      scale: 1;
      opacity: 1;
    }
  }
  @keyframes shimmer {
    0%,
    100% {
      opacity: 0.65;
    }
    50% {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      transition-duration: 1ms;
    }
    .sparkle i {
      animation: twinkle 2.2s ease-in-out infinite;
      animation-delay: calc(var(--i) * -0.37s);
    }
  }
</style>
