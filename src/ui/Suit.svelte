<script lang="ts">
  let { suit }: { suit: number } = $props();
</script>

<svg viewBox="0 0 100 100" aria-hidden="true">
  {#if suit === 0}
    <circle cx="50" cy="29" r="21" />
    <circle cx="27" cy="59" r="21" />
    <circle cx="73" cy="59" r="21" />
    <circle cx="50" cy="50" r="12" />
    <path d="M45 52 C46 74 42 86 32 96 L68 96 C58 86 54 74 55 52 Z" />
  {:else if suit === 1}
    <path d="M50 3 C60 20 74 36 89 50 C74 64 60 80 50 97 C40 80 26 64 11 50 C26 36 40 20 50 3 Z" />
  {:else if suit === 2}
    <path
      d="M50 91 C22 66 5 49 5 29 C5 15 16 6 28 6 C38 6 46 12 50 22 C54 12 62 6 72 6 C84 6 95 15 95 29 C95 49 78 66 50 91 Z"
    />
  {:else}
    <path
      d="M50 4 C62 25 94 41 94 63 C94 77 83 85 72 85 C64 85 58 81 55 75 C56 85 60 91 68 96 L32 96 C40 91 44 85 45 75 C42 81 36 85 28 85 C17 85 6 77 6 63 C6 41 38 25 50 4 Z"
    />
  {/if}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: currentColor;
  }
</style>
