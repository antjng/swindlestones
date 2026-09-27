<script lang="ts">
  import DebugPanel from './lib/components/DebugPanel.svelte';
  import GameView from './lib/components/GameView.svelte';
  import Lobby from './lib/components/Lobby.svelte';
  import type { OnlineSession } from './lib/net/session';

  // The rules-engine debug harness lives at /#debug
  const debug = location.hash === '#debug';

  type Screen = 'lobby' | 'monk' | 'online';
  let screen = $state<Screen>('lobby');
  let session = $state<OnlineSession | null>(null);

  function playOnline(next: OnlineSession): void {
    session = next;
    screen = 'online';
  }

  function backToStart(): void {
    session = null;
    screen = 'lobby';
    // An invite link should not pull us straight back into the room we just left.
    if (location.hash.includes('room=')) history.replaceState(null, '', location.pathname);
  }
</script>

{#if debug}
  <DebugPanel />
{:else if screen === 'lobby'}
  <Lobby onPlayMonk={() => (screen = 'monk')} onOnline={playOnline} />
{:else if screen === 'monk'}
  <GameView onLeave={backToStart} />
{:else}
  {#key session}
    <GameView {session} onLeave={backToStart} />
  {/key}
{/if}
