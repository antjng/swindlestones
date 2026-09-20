<script lang="ts">
  import DebugPanel from './lib/components/DebugPanel.svelte';
  import GameView from './lib/components/GameView.svelte';

  // The rules-engine debug harness lives at /#debug.
  const debug = location.hash === '#debug';
</script>

{#if debug}
  <DebugPanel />
{:else}
  <GameView />
{/if}
