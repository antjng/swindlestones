<script lang="ts">
  import type { Phase } from '../game/match';
  import type { CallResult } from '../game/rules';
  import type { Bid, PlayerId } from '../game/types';

  interface Props {
    diceCounts: Record<PlayerId, number>;
    turn: PlayerId;
    phase: Phase;
    winner: PlayerId | null;
    currentBid: Bid | null;
    lastCallResult: CallResult | null;
  }

  let { diceCounts, turn, phase, winner, currentBid, lastCallResult }: Props = $props();
</script>

<div class="scoreboard">
  <p class="counts">
    <span>You: {diceCounts.player} {diceCounts.player === 1 ? 'stone' : 'stones'}</span>
    <span>Opponent: {diceCounts.ai} {diceCounts.ai === 1 ? 'stone' : 'stones'}</span>
  </p>

  {#if phase === 'bidding'}
    <p>Current bid: {currentBid ? `${currentBid.quantity} × ${currentBid.face}s` : 'none yet'}</p>
    <p class="turn">{turn === 'player' ? 'Your turn' : "Opponent's turn…"}</p>
  {:else if phase === 'roundOver' && lastCallResult && currentBid}
    <p>
      Actual count of {currentBid.face}s: <strong>{lastCallResult.actualCount}</strong>
      (bid was {currentBid.quantity}). {lastCallResult.loser === 'player' ? 'You' : 'Opponent'} lost a stone.
    </p>
  {:else if phase === 'matchOver' && winner}
    <p class="winner">{winner === 'player' ? 'You win the match!' : 'Opponent wins the match.'}</p>
  {/if}
</div>

<style>
  .scoreboard {
    font-family: system-ui, sans-serif;
  }
  .counts {
    display: flex;
    gap: 1.5rem;
    font-weight: 600;
  }
  .turn {
    color: #555;
  }
  .winner {
    font-size: 1.25rem;
    font-weight: 700;
  }
</style>
