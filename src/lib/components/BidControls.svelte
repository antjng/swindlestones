<script lang="ts">
  import type { Bid } from '../game/types';

  interface Props {
    legalBids: readonly Bid[];
    disabled: boolean;
    onBid: (bid: Bid) => void;
  }

  let { legalBids, disabled, onBid }: Props = $props();

  let selectedIndex = $state(0);

  $effect(() => {
    if (selectedIndex >= legalBids.length) selectedIndex = 0;
  });

  function submit() {
    const bid = legalBids[selectedIndex];
    if (bid) onBid(bid);
  }
</script>

<div class="bid-controls">
  <select bind:value={selectedIndex} disabled={disabled || legalBids.length === 0}>
    {#each legalBids as bid, i (i)}
      <option value={i}>{bid.quantity} × {bid.face}s</option>
    {/each}
  </select>
  <button onclick={submit} disabled={disabled || legalBids.length === 0}>Bid</button>
</div>

<style>
  .bid-controls {
    display: inline-flex;
    gap: 0.5rem;
  }
</style>
