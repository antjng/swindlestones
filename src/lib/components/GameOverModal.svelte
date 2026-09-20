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
    <h2>{winner === 'player' ? 'Victory is yours' : 'You are undone'}</h2>
    <p>{winner === 'player' ? "The opponent's dice are all lost." : 'Your last die is gone.'}</p>
    <button onclick={onPlayAgain}>Play again</button>
  </div>
</div>

<style>
  .modal {
    text-align: center;
  }
  p {
    margin: 0 0 1.25rem;
    font-style: italic;
  }
</style>
