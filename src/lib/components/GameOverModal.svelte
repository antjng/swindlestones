<script lang="ts">
  import type { PlayerId } from '../game/types';

  interface Props {
    winner: PlayerId;
    onPlayAgain: () => void;
  }

  let { winner, onPlayAgain }: Props = $props();
</script>

<div class="overlay">
  <div class="modal">
    <h2>{winner === 'player' ? 'You win!' : 'Opponent wins.'}</h2>
    <button onclick={onPlayAgain}>Play again</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }
  .modal {
    background: #fff;
    color: #111;
    padding: 2rem 2.5rem;
    border-radius: 0.75rem;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
  }
  h2 {
    margin: 0 0 1.25rem;
  }
</style>
