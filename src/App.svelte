<script lang="ts">
  import { onMount } from 'svelte';
  import { Game } from './game/game.svelte.ts';
  import Board from './ui/Board.svelte';
  import Drawer from './ui/Drawer.svelte';
  import Toolbar from './ui/Toolbar.svelte';
  import { WorkerAnalyst } from './worker/client.ts';

  const params = new URLSearchParams(location.search);
  const stuckDelay = Number(params.get('stuckDelay'));
  const game = new Game({
    analyst: new WorkerAnalyst(),
    storage: localStorage,
    stuckDelayMs: params.has('stuckDelay') && stuckDelay >= 0 ? stuckDelay * 1000 : undefined,
  });
  (window as unknown as { freecell: Game }).freecell = game;

  let drawerHeight = $state(0);

  onMount(() => {
    const deal = Number(params.get('deal'));
    void game.start(params.has('deal') && Number.isInteger(deal) ? deal : undefined);
    return () => game.dispose();
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) game.redo();
      else game.undo();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (key === 'u') game.undo();
    else if (key === 'r') game.redo();
    else if (key === 'h') game.hint();
    else if (key === 'n') void game.newGame();
    else if (key === 'escape') game.closePanel();
  }
</script>

<svelte:window {onkeydown} />

<main>
  <Toolbar {game} />
  <Board {game} reserve={drawerHeight} />
  <Drawer {game} bind:height={drawerHeight} />
</main>

<style>
  main {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 1040px;
    margin: 0 auto;
    padding: 0 16px 12px;
  }
  @media (max-width: 520px) {
    main {
      padding: 0 6px 8px;
    }
  }
</style>
