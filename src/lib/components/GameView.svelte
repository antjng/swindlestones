<script lang="ts">
  import { DEFAULT_AI_CONFIG, decideAiAction } from '../game/ai';
  import { mulberry32, randomSeed } from '../game/rng';
  import { GameStore } from '../state/gameStore.svelte';
  import type { Bid } from '../game/types';
  import BidControls from './BidControls.svelte';
  import CallButton from './CallButton.svelte';
  import DiceCanvas from './DiceCanvas.svelte';
  import GameOverModal from './GameOverModal.svelte';
  import Scoreboard from './Scoreboard.svelte';

  const OPPONENT_THINK_MS = 600;

  const store = new GameStore();
  // Separate from the match RNG so AI bluffing doesn't perturb dice rolls.
  const aiRng = mulberry32(randomSeed());
  let diceCanvas: DiceCanvas;
  let busy = $state(false);

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function revealHands(): void {
    diceCanvas.reveal({ player: store.playerHand, ai: store.state.hands.ai });
  }

  async function runOpponentTurnIfDue(): Promise<void> {
    if (store.phase !== 'bidding' || store.turn !== 'ai') return;
    busy = true;
    await delay(OPPONENT_THINK_MS);
    const decision = decideAiAction(
      store.currentBid,
      store.state.hands.ai,
      store.diceCounts.player,
      DEFAULT_AI_CONFIG,
      aiRng,
    );
    if (decision.type === 'call') {
      store.call('ai');
      revealHands();
    } else {
      store.submitBid('ai', decision.bid);
    }
    busy = false;
  }

  async function startRound(): Promise<void> {
    busy = true;
    store.startRound();
    await diceCanvas.roll({ player: store.playerHand, ai: store.state.hands.ai }, { hideAi: true });
    busy = false;
    await runOpponentTurnIfDue();
  }

  function submitPlayerBid(bid: Bid): void {
    if (!store.isPlayerTurn) return;
    store.submitBid('player', bid);
    void runOpponentTurnIfDue();
  }

  function submitPlayerCall(): void {
    if (!store.isPlayerTurn || store.currentBid === null) return;
    store.call('player');
    revealHands();
  }

  function playAgain(): void {
    store.reset();
    diceCanvas.reveal({ player: [], ai: [] });
  }
</script>

<div class="game">
  <div class="scene">
    <DiceCanvas bind:this={diceCanvas} player={[]} ai={[]} />
  </div>

  <Scoreboard
    diceCounts={store.diceCounts}
    turn={store.turn}
    phase={store.phase}
    winner={store.winner}
    currentBid={store.currentBid}
    lastCallResult={store.lastCallResult}
  />

  <div class="controls">
    {#if store.phase === 'awaitingRoll'}
      <button onclick={startRound} disabled={busy}>Roll to start</button>
    {:else if store.phase === 'bidding'}
      <BidControls legalBids={store.legalNextBids} disabled={busy || !store.isPlayerTurn} onBid={submitPlayerBid} />
      <CallButton disabled={busy || !store.isPlayerTurn || store.currentBid === null} onCall={submitPlayerCall} />
    {:else if store.phase === 'roundOver'}
      <button onclick={startRound} disabled={busy}>Next round</button>
    {/if}
  </div>
</div>

{#if store.phase === 'matchOver' && store.winner}
  <GameOverModal winner={store.winner} onPlayAgain={playAgain} />
{/if}

<style>
  .game {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .scene {
    width: 100%;
    height: 60vh;
    min-height: 20rem;
    border-radius: 0.5rem;
    overflow: hidden;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
</style>
