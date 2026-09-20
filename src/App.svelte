<script lang="ts">
  // Debug harness: plays a full match with the AI on both sides to exercise
  // the rules engine independently of the UI.
  import { DEFAULT_AI_CONFIG, decideAiAction } from './lib/game/ai';
  import { createInitialMatchState, reduce } from './lib/game/match';
  import type { MatchAction, MatchState } from './lib/game/match';
  import { mulberry32, randomSeed } from './lib/game/rng';
  import type { PlayerId } from './lib/game/types';
  import GameView from './lib/components/GameView.svelte';

  let seed = $state(randomSeed());
  let log = $state<{ action: MatchAction | { type: 'initial' }; state: MatchState }[]>([]);

  function playFullMatch() {
    const rng = mulberry32(seed);
    let state = createInitialMatchState(rng);
    const entries: typeof log = [{ action: { type: 'initial' }, state }];

    while (state.phase !== 'matchOver') {
      if (state.phase === 'awaitingRoll' || state.phase === 'roundOver') {
        const action: MatchAction = { type: 'startRound' };
        state = reduce(state, action, rng);
        entries.push({ action, state });
        continue;
      }

      // phase === 'bidding': ask the AI heuristic to act for whichever side's turn it is.
      const actor: PlayerId = state.turn;
      const ownHand = state.hands[actor];
      const opponentDiceCount = state.diceCounts[actor === 'player' ? 'ai' : 'player'];
      const decision = decideAiAction(state.currentBid, ownHand, opponentDiceCount, DEFAULT_AI_CONFIG, rng);

      const action: MatchAction =
        decision.type === 'call'
          ? { type: 'call', by: actor }
          : { type: 'bid', by: actor, bid: decision.bid };
      state = reduce(state, action, rng);
      entries.push({ action, state });
    }

    log = entries;
  }

  function reroll() {
    seed = randomSeed();
    log = [];
  }
</script>

<main>
  <h1>Swindlestones</h1>

  <GameView />

  <details class="debug">
    <summary>Debug: rules engine demo</summary>
    <p>Seed: <code>{seed}</code></p>
    <button onclick={playFullMatch}>Play full match</button>
    <button onclick={reroll}>New seed</button>

    {#if log.length > 0}
      <p>{log.length} actions. Match winner: <strong>{log.at(-1)?.state.winner}</strong></p>
      <pre>{JSON.stringify(log, null, 2)}</pre>
    {/if}
  </details>
</main>

<style>
  main {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1.5rem;
    font-family: system-ui, sans-serif;
  }
  .debug {
    margin-top: 2rem;
    border-top: 1px solid #ccc;
    padding-top: 1rem;
  }
  pre {
    max-height: 60vh;
    overflow: auto;
    background: #111;
    color: #ddd;
    padding: 1rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
  }
</style>
