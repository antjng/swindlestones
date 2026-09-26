<script lang="ts">
  interface Props {
    count: number;
    total: number;
    color: 'blue' | 'red';
    side: 'left' | 'right';
    label: string;
    /** Which end of the row the lost dice drop off. */
    losesFrom?: 'left' | 'right';
  }

  let { count, total, color, side, label, losesFrom = 'right' }: Props = $props();
</script>

<div class="counter {side} {color}" role="img" aria-label="{label}: {count} {count === 1 ? 'die' : 'dice'}">
  {#each { length: total } as _, i (i)}
    <svg viewBox="0 0 32 32" class="gem" class:lost={losesFrom === 'left' ? i < total - count : i >= count}>
      <polygon points="16,2 29,16 16,30 3,16" />
      <polyline points="3,16 29,16 M16,2 16,30" />
    </svg>
  {/each}
</div>

<style>
  .counter {
    position: absolute;
    top: 0;
    display: flex;
    gap: 0.35rem;
    padding: 0.55rem 1rem 0.75rem;
    background: linear-gradient(#3a3a3e, #1c1c20);
    border: 2px solid #0c0c0e;
    box-shadow: inset 0 0 0 2px #56565c, 0 4px 10px rgba(0, 0, 0, 0.5);
  }
  .left {
    left: 0;
    border-left: 0;
    border-radius: 0 0 1.1rem 0;
  }
  .right {
    right: 0;
    border-right: 0;
    border-radius: 0 0 0 1.1rem;
  }
  .gem {
    width: 1.9rem;
    height: 1.9rem;
  }
  .gem polygon {
    stroke: #0a0a0c;
    stroke-width: 1.6;
    stroke-linejoin: round;
  }
  .gem polyline {
    fill: none;
    stroke: rgba(255, 255, 255, 0.35);
    stroke-width: 1;
  }
  .blue polygon {
    fill: #4a86d8;
  }
  .red polygon {
    fill: #d24545;
  }
  .lost {
    opacity: 0.22;
  }
</style>
