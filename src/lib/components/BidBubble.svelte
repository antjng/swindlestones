<script lang="ts">
  import { untrack } from 'svelte';
  import { FACES } from '../game/types';
  import type { Bid, Face } from '../game/types';
  import { describeBid, describeCount } from './bidText';
  import DieIcon from './DieIcon.svelte';

  interface Props {
    legalBids: readonly Bid[];
    currentBid: Bid | null;
    onBid: (bid: Bid) => void;
    onCall: () => void;
  }

  let { legalBids, currentBid, onBid, onCall }: Props = $props();

  const quantitiesByFace = $derived.by(() => {
    const byFace = new Map<Face, number[]>(FACES.map((face) => [face, []]));
    for (const bid of legalBids) byFace.get(bid.face)!.push(bid.quantity);
    return byFace;
  });

  // Start from the smallest legal bid.
  let face = $state<Face>(untrack(() => legalBids[0]?.face ?? 1));
  let quantity = $state(untrack(() => legalBids[0]?.quantity ?? 1));

  const quantities = $derived(quantitiesByFace.get(face) ?? []);
  const index = $derived(quantities.indexOf(quantity));

  $effect(() => {
    if (quantities.length === 0) {
      const first = legalBids[0];
      if (first) {
        face = first.face;
        quantity = first.quantity;
      }
    } else if (!quantities.includes(quantity)) {
      quantity = quantities.find((q) => q >= quantity) ?? quantities[quantities.length - 1];
    }
  });

  function step(direction: -1 | 1): void {
    const next = quantities[index + direction];
    if (next !== undefined) quantity = next;
  }

  function submit(): void {
    if (quantities.includes(quantity)) onBid({ quantity, face });
  }
</script>

<div class="bubble">
  <p class="line">
    {currentBid ? `“${describeBid(currentBid)},” they say.` : 'The bidding is yours to open.'}
  </p>

  <div class="faces" role="group" aria-label="Number of pips to bid on">
    {#each FACES as f (f)}
      <button
        class="face"
        class:selected={f === face}
        disabled={(quantitiesByFace.get(f) ?? []).length === 0}
        aria-pressed={f === face}
        aria-label="{f} {f === 1 ? 'pip' : 'pips'}"
        onclick={() => (face = f)}
      >
        <DieIcon face={f} size={46} />
      </button>
    {/each}
  </div>

  <div class="quantity">
    <button class="arrow" aria-label="Fewer" disabled={index <= 0} onclick={() => step(-1)}>◀</button>
    <span class="count" aria-live="polite">{quantity}×</span>
    <button class="arrow" aria-label="More" disabled={index >= quantities.length - 1} onclick={() => step(1)}>▶</button>
  </div>

  <div class="actions">
    <button class="call" disabled={currentBid === null} onclick={onCall}>CALL!</button>
    <button class="bid" disabled={!quantities.includes(quantity)} onclick={submit}>
      Bid {describeCount(quantity, face)}
    </button>
  </div>
</div>

<style>
  .bubble {
    position: absolute;
    left: clamp(0.75rem, 4vw, 3rem);
    top: 30%;
    width: min(23rem, 88vw);
    padding: 1.2rem 1.4rem 1.3rem;
    background: rgba(252, 250, 244, 0.98);
    color: #2d2f45;
    border-radius: 1.6rem;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
    text-align: center;
  }
  /* The bubble's tail, pointing down toward the player's hand. */
  .bubble::after {
    content: '';
    position: absolute;
    left: 14%;
    bottom: -1.3rem;
    border: 1.3rem solid transparent;
    border-top-color: rgba(252, 250, 244, 0.98);
    border-bottom: 0;
    border-left-width: 0.4rem;
  }
  .line {
    margin: 0 0 0.8rem;
    font-size: 1.3rem;
    line-height: 1.3;
  }
  .faces {
    display: flex;
    justify-content: center;
    gap: 0.4rem;
  }
  .face {
    padding: 0.2rem;
    line-height: 0;
    color: #8b8fa8;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 0.7rem;
    box-shadow: none;
  }
  .face.selected {
    color: #3f5d99;
    border-color: #3f5d99;
    background: rgba(63, 93, 153, 0.1);
  }
  .face:hover:not(:disabled) {
    background: rgba(63, 93, 153, 0.16);
    color: #3f5d99;
  }
  .quantity {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin: 0.5rem 0 0.9rem;
  }
  .count {
    min-width: 3.4rem;
    font-size: 2rem;
    font-weight: bold;
  }
  .arrow {
    padding: 0.2rem 0.6rem;
    font-size: 1.1rem;
    color: #2d2f45;
    background: transparent;
    border: 0;
    box-shadow: none;
  }
  .arrow:hover:not(:disabled) {
    background: transparent;
    color: #3f5d99;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    justify-content: center;
  }
  .call,
  .bid {
    flex: 1;
    padding: 0.5rem 0.4rem;
    font-size: 1.05rem;
    border-radius: 0.8rem;
    border-width: 2px;
    box-shadow: none;
  }
  .call {
    color: #9b2f2f;
    border-color: #9b2f2f;
    background: transparent;
  }
  .call:hover:not(:disabled) {
    background: #9b2f2f;
    color: #fcfaf4;
  }
  .bid {
    color: #fcfaf4;
    background: #3f5d99;
    border-color: #3f5d99;
  }
  .bid:hover:not(:disabled) {
    background: #2d456f;
    color: #fcfaf4;
  }
</style>
