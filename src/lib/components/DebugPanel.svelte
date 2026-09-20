<script lang="ts">
  // Debug harness: plays a full match with the AI on both sides to exercise
  // the rules engine independently of the UI.
  import { DEFAULT_AI_CONFIG, decideAiAction } from '../game/ai';
  import { createInitialMatchState, reduce } from '../game/match';
  import type { MatchAction, MatchState } from '../game/match';
  import { mulberry32, randomSeed } from '../game/rng';
  import type { PlayerId } from '../game/types';

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

<div class="debug">
  <h2>Debug: rules engine demo</h2>
  <p>Seed: <code>{seed}</code></p>
  <button onclick={playFullMatch}>Play full match</button>
  <button onclick={reroll}>New seed</button>

  {#if log.length > 0}
    <p>{log.length} actions. Match winner: <strong>{log.at(-1)?.state.winner}</strong></p>
    <pre>{JSON.stringify(log, null, 2)}</pre>
  {/if}
</div>

<style>
  .debug {
    position: fixed;
    inset: 0;
    z-index: 20;
    overflow: auto;
    padding: 1.5rem;
    background: var(--paper);
  }
  pre {
    max-height: 60vh;
    overflow: auto;
    background: var(--ink);
    color: var(--paper);
    padding: 1rem;
    font-size: 0.75rem;
  }
</style>
