<script lang="ts">
  import { backOut, cubicIn } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { type Card, cardLabel, isRed } from '../engine/cards.ts';
  import { reasonParts, stepParts } from '../engine/hint.ts';
  import type { Game } from '../game/game.svelte.ts';

  let { game, height = $bindable(0) }: { game: Game; height?: number } = $props();

  const panel = $derived(game.panel);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  $effect(() => {
    if (!panel) height = 0;
  });
</script>

{#snippet name(card: Card)}<b class="card-name" class:red={isRed(card)}>{cardLabel(card)}</b>{/snippet}

{#snippet prose(parts: (string | Card)[])}
  {#each parts as part, i (i)}{#if typeof part === 'string'}{part}{:else}{@render name(part)}{/if}{/each}
{/snippet}

{#if panel}
  <aside
    class="drawer"
    class:celebrate={panel.kind === 'won' || panel.kind === 'achieved'}
    data-panel={panel.kind}
    bind:clientHeight={height}
    in:fly={{ y: 80, duration: 320, easing: backOut }}
    out:fly={{ y: 80, duration: 160, easing: cubicIn }}
    aria-live="polite"
  >
    {#if panel.kind !== 'won'}
      <button class="close" onclick={() => game.closePanel()} aria-label="Close" title="Close (Esc)">×</button>
    {/if}

    {#if panel.kind === 'won'}
      <h2>You won!</h2>
      <p>{game.dealNumber > 0 ? `Deal #${game.dealNumber}, finished` : 'Finished'} in {plural(panel.moves, 'move')}.</p>
      <div class="actions">
        <button class="primary" onclick={() => game.newGame()}>New game</button>
      </div>
    {:else if panel.kind === 'message'}
      <p class="lead">{panel.text}</p>
    {:else if panel.kind === 'stuck'}
      <h2>{panel.cause === 'no-moves' ? 'No moves left' : "This one can't be won from here"}</h2>
      <p>
        {#if panel.rollbackMoves > 0}
          The last position that could still be won was {plural(panel.rollbackMoves, 'move')} ago.
        {:else}
          Undo to try a different line.
        {/if}
      </p>
      <div class="actions">
        {#if panel.rollbackMoves > 0}
          <button class="primary" onclick={() => game.rollback()}>
            Roll back {plural(panel.rollbackMoves, 'move')}
          </button>
        {/if}
        <button onclick={() => game.closePanel()}>Keep playing</button>
      </div>
    {:else if panel.kind === 'achieved'}
      <p class="lead">Nice. The {@render name(panel.card)} is home.</p>
    {:else if panel.kind === 'thinking'}
      <p class="lead thinking">Looking for a way through…</p>
    {:else if panel.kind === 'unsure'}
      <h2>I can't find a way through from here</h2>
      <p>I also can't prove there isn't one. Undo a few moves and ask again.</p>
      <div class="actions">
        {#if panel.rollbackMoves > 0}
          <button class="primary" onclick={() => game.rollback()}>
            Roll back {plural(panel.rollbackMoves, 'move')} to a winnable position
          </button>
        {/if}
        <button onclick={() => game.undo()}>Undo one move</button>
      </div>
    {:else if panel.kind === 'goal'}
      <p class="lead">Try to get the {@render name(panel.target)} up to the foundation.</p>
      {#if panel.takeBacks > 0}
        <p class="why">
          Getting there means bringing {plural(panel.takeBacks, 'card')} back down from the foundations first.
        </p>
      {/if}
      <div class="actions">
        <button class="primary" onclick={() => game.hint()}>
          Show me how ({plural(panel.stepCount, 'move')})
        </button>
      </div>
    {:else if panel.kind === 'steps'}
      <p class="eyebrow">
        Getting the {@render name(panel.target)} home · step {panel.done + 1} of {panel.total}
      </p>
      <p class="lead step">{@render prose(stepParts(panel.steps[0]))}</p>
      {#if panel.reasons[0]}
        <p class="why">This {@render prose(reasonParts(panel.reasons[0]))}.</p>
      {/if}
      {#if panel.steps.length > 1}
        <ol class="upcoming" start={panel.done + 2}>
          {#each panel.steps.slice(1) as step, i (i)}
            {@const reason = panel.reasons[i + 1]}
            <li>
              {@render prose(stepParts(step))}
              {#if reason}<span class="because">({@render prose(reasonParts(reason))})</span>{/if}
            </li>
          {/each}
        </ol>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  .drawer {
    position: absolute;
    left: 50%;
    bottom: 0;
    z-index: 3000;
    width: min(100% - 24px, 640px);
    translate: -50% 0;
    padding: 14px 44px max(16px, env(safe-area-inset-bottom)) 18px;
    border-radius: 18px 18px 0 0;
    background: var(--panel);
    color: var(--panel-ink);
    color-scheme: light;
    box-shadow:
      0 -8px 30px rgb(0 0 0 / 0.35),
      0 0 0 1px rgb(0 0 0 / 0.1);
  }
  .drawer.celebrate {
    box-shadow:
      0 -8px 30px rgb(0 0 0 / 0.35),
      0 0 0 3px var(--accent);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.05rem;
    font-weight: 800;
  }
  p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.45;
  }
  .lead {
    font-size: 1.02rem;
    font-weight: 600;
  }
  .why {
    margin-top: 2px;
    font-size: 0.9rem;
    opacity: 0.78;
  }
  .because {
    opacity: 0.8;
  }
  .eyebrow {
    margin-bottom: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    opacity: 0.7;
  }
  .thinking {
    animation: breathe 1.2s ease-in-out infinite;
  }
  @keyframes breathe {
    50% {
      opacity: 0.45;
    }
  }
  .card-name {
    display: inline-block;
    padding: 0 0.35em;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.14);
    color: var(--suit-black);
    font-weight: 800;
    white-space: nowrap;
  }
  .card-name.red {
    color: var(--suit-red);
  }
  .upcoming {
    max-height: 5.6em;
    margin: 8px 0 0;
    padding-left: 2.2em;
    overflow-y: auto;
    font-size: 0.86rem;
    line-height: 1.75;
    opacity: 0.72;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .actions button {
    padding: 8px 14px;
    border: 0;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.09);
    color: inherit;
    font-size: 0.92rem;
    font-weight: 700;
    cursor: pointer;
  }
  .actions button:hover {
    background: rgb(0 0 0 / 0.15);
  }
  .actions .primary {
    background: var(--accent);
    color: #2b2108;
  }
  .actions .primary:hover {
    background: var(--accent-bright);
  }
  .close {
    position: absolute;
    top: 8px;
    right: 10px;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: inherit;
    font-size: 1.3rem;
    line-height: 1;
    opacity: 0.55;
    cursor: pointer;
  }
  .close:hover {
    background: rgb(0 0 0 / 0.08);
    opacity: 1;
  }
</style>
