<script lang="ts">
  import type { Game } from '../game/game.svelte.ts';

  let { game }: { game: Game } = $props();

  let editing = $state(false);
  let draft = $state('');

  function edit() {
    draft = String(game.dealNumber);
    editing = true;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    editing = false;
    const number = Number(draft.trim());
    if (draft.trim() !== '' && number !== game.dealNumber) void game.newGame(number);
  }

  function focus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<header>
  <div class="title">
    <h1>FreeCell</h1>
    {#if editing}
      <form onsubmit={submit}>
        <label for="deal-number">Deal #</label>
        <input
          id="deal-number"
          inputmode="numeric"
          bind:value={draft}
          use:focus
          onblur={() => (editing = false)}
          onkeydown={(event) => event.key === 'Escape' && (editing = false)}
        />
      </form>
    {:else if game.ready}
      <button class="deal" onclick={edit} title="Play a specific deal">Deal #{game.dealNumber}</button>
    {/if}
  </div>
  <nav>
    <button onclick={() => game.undo()} disabled={!game.canUndo} title="Undo (U)">Undo</button>
    <button onclick={() => game.redo()} disabled={!game.canRedo} title="Redo (R)">Redo</button>
    <button onclick={() => game.restart()} disabled={!game.canUndo}>Restart</button>
    <button onclick={() => game.newGame()} disabled={game.dealing} title="New game (N)">New game</button>
    <button class="hint" onclick={() => game.hint()} disabled={!game.ready || game.won} title="Hint (H)">Hint</button>
  </nav>
</header>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    padding: 10px 0 14px;
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: 0.01em;
  }
  .deal,
  form {
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .deal {
    padding: 2px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    cursor: pointer;
  }
  .deal:hover {
    background: rgb(255 255 255 / 0.08);
    color: var(--ink);
  }
  input {
    width: 9ch;
    padding: 2px 6px;
    border: 1px solid var(--slot-edge);
    border-radius: 6px;
    background: rgb(0 0 0 / 0.25);
    color: var(--ink);
    font: inherit;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  nav button {
    padding: 7px 13px;
    border: 0;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    color: var(--ink);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 120ms ease,
      transform 120ms ease;
  }
  nav button:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.18);
  }
  nav button:active:not(:disabled) {
    transform: scale(0.96);
  }
  nav button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  nav .hint {
    background: var(--accent);
    color: #2b2108;
  }
  nav .hint:hover:not(:disabled) {
    background: var(--accent-bright);
  }
</style>
