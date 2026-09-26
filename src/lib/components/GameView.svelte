<script lang="ts">
  import { AiMemory, DEFAULT_AI_CONFIG, decideAiAction } from '../game/ai';
  import { mulberry32, randomSeed } from '../game/rng';
  import { GameStore } from '../state/gameStore.svelte';
  import type { Bid, PlayerId } from '../game/types';
  import { STARTING_DICE } from '../game/match';
  import Banner from './Banner.svelte';
  import BidBubble from './BidBubble.svelte';
  import DiceCanvas from './DiceCanvas.svelte';
  import DiceCounter from './DiceCounter.svelte';
  import GameOverModal from './GameOverModal.svelte';
  import RulesModal from './RulesModal.svelte';
  import { describeBid, describeCount } from './bidText';

  const OPPONENT_THINK_MS = 1500;
  const OPPONENT_CALL_MS = 900;
  const IMPATIENT_AFTER_MS = 7000;
  const FUMING_AFTER_MS = 16000;

  const store = new GameStore();
  // Separate from the match RNG so AI bluffing doesn't perturb dice rolls.
  const aiRng = mulberry32(randomSeed());
  // What the opponent has learned about how you play; it carries across matches.
  const memory = new AiMemory();
  let diceCanvas: DiceCanvas;
  let busy = $state(false);

  const RULES_SEEN_KEY = 'swindlestones:rules-seen';

  function hasSeenRules(): boolean {
    try {
      return localStorage.getItem(RULES_SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  let showRules = $state(!hasSeenRules());

  function closeRules(): void {
    showRules = false;
    try {
      localStorage.setItem(RULES_SEEN_KEY, '1');
    } catch {
      // storage unavailable; the rules just show again next visit
    }
  }

  const showBidding = $derived(store.phase === 'bidding' && store.isPlayerTurn && !busy);

  const bannerText = $derived.by(() => {
    switch (store.phase) {
      case 'awaitingRoll':
        return 'Roll the dice to begin';
      case 'bidding': {
        if (store.currentBid === null) return store.turn === 'player' ? 'You open the bidding' : 'Opponent opens the bidding';
        const bidder = store.turn === 'player' ? 'Opponent bids' : 'You bid';
        // The turn has already passed to the other side by the time a bid is showing.
        return `${bidder} ${describeBid(store.currentBid)}`;
      }
      default: {
        const result = store.lastCallResult;
        const bid = store.currentBid;
        if (!result || !bid) return '';
        const loser = result.loser === 'player' ? 'You lose' : 'Opponent loses';
        return `There ${result.actualCount === 1 ? 'was' : 'were'} ${describeCount(result.actualCount, bid.face)}. ${loser} a die.`;
      }
    }
  });

  // If you take your time, the monk grows restless, and then angry.
  let waitTimers: ReturnType<typeof setTimeout>[] = [];

  function stopWaiting(): void {
    for (const timer of waitTimers) clearTimeout(timer);
    waitTimers = [];
  }

  function startWaiting(): void {
    stopWaiting();
    waitTimers = [setTimeout(() => diceCanvas.setMood('impatient'), IMPATIENT_AFTER_MS), setTimeout(() => diceCanvas.setMood('fuming'), FUMING_AFTER_MS)];
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Reveals the hands, then records the call, so the result only shows once the dice are visible. */
  async function resolveCall(by: PlayerId): Promise<void> {
    await diceCanvas.reveal();
    store.call(by);
    if (by === 'ai' && store.lastCallResult) memory.recordPlayerBidTested(store.lastCallResult.bidWasTrue);
    const opponentLost = store.lastCallResult?.loser === 'ai';
    diceCanvas.setMood(opponentLost ? 'enraged' : 'gloating');
    diceCanvas.speak(opponentLost ? 1 : 1.6);
  }

  async function runOpponentTurnIfDue(): Promise<void> {
    if (store.phase !== 'bidding' || store.turn !== 'ai') return;
    busy = true;
    diceCanvas.setMood('thinking');
    setTimeout(() => diceCanvas.peek(), 350);
    await delay(OPPONENT_THINK_MS);
    const decision = decideAiAction(
      store.currentBid,
      store.state.hands.ai,
      store.diceCounts.player,
      DEFAULT_AI_CONFIG,
      aiRng,
      memory,
    );
    if (decision.type === 'call') {
      diceCanvas.setMood('calling');
      diceCanvas.speak(0.9);
      await delay(OPPONENT_CALL_MS);
      await resolveCall('ai');
    } else {
      store.submitBid('ai', decision.bid);
      diceCanvas.speak(0.9 + decision.bid.quantity * 0.12);
      diceCanvas.setMood('idle');
      startWaiting();
    }
    busy = false;
  }

  async function startRound(): Promise<void> {
    stopWaiting();
    busy = true;
    diceCanvas.setMood('idle');
    memory.startRound();
    store.startRound();
    await diceCanvas.roll({ player: store.playerHand, ai: store.state.hands.ai });
    busy = false;
    if (store.isPlayerTurn) startWaiting();
    await runOpponentTurnIfDue();
  }

  function submitPlayerBid(bid: Bid): void {
    if (!store.isPlayerTurn) return;
    stopWaiting();
    if (store.currentBid !== null) memory.recordPlayerResponse(false);
    memory.recordPlayerBid(bid);
    store.submitBid('player', bid);
    void runOpponentTurnIfDue();
  }

  async function submitPlayerCall(): Promise<void> {
    if (!store.isPlayerTurn || store.currentBid === null) return;
    stopWaiting();
    memory.recordPlayerResponse(true);
    busy = true;
    diceCanvas.setMood('tense');
    await resolveCall('player');
    busy = false;
  }

  function playAgain(): void {
    stopWaiting();
    store.reset();
    diceCanvas.clear();
    diceCanvas.setMood('idle');
  }
</script>

<div class="screen">
  <div class="scene">
    <DiceCanvas bind:this={diceCanvas} />
  </div>

  <div class="hud">
    <DiceCounter side="left" color="blue" losesFrom="left" label="Your dice" count={store.diceCounts.player} total={STARTING_DICE} />
    <DiceCounter side="right" color="red" label="Opponent's dice" count={store.diceCounts.ai} total={STARTING_DICE} />
    <button class="help" aria-label="How to play" onclick={() => (showRules = true)}>?</button>

    {#if showBidding}
      <BidBubble legalBids={store.legalNextBids} currentBid={store.currentBid} onBid={submitPlayerBid} onCall={submitPlayerCall} />
    {/if}

    {#if store.phase === 'awaitingRoll' || store.phase === 'roundOver'}
      <button class="cta" disabled={busy} onclick={startRound}>
        {store.phase === 'awaitingRoll' ? 'Roll the dice' : 'Next round'}
      </button>
    {/if}

    <Banner text={bannerText} />
  </div>

  {#if store.phase === 'matchOver' && store.winner}
    <GameOverModal winner={store.winner} onPlayAgain={playAgain} />
  {/if}

  {#if showRules}
    <RulesModal onClose={closeRules} />
  {/if}
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #050302;
  }
  .scene {
    position: absolute;
    inset: 0;
  }
  .hud {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .hud > :global(*) {
    pointer-events: auto;
  }
  .help {
    position: absolute;
    top: 4.4rem;
    right: 1rem;
    width: 2.6rem;
    height: 2.6rem;
    padding: 0;
    font-size: 1.4rem;
    font-family: var(--font-body);
    letter-spacing: 0;
    color: #f4efe4;
    background: rgba(28, 28, 32, 0.82);
    border: 2px solid #56565c;
    border-radius: 50%;
    box-shadow: none;
  }
  .help:hover:not(:disabled) {
    background: #f4efe4;
    color: #1c1c20;
  }
  .cta {
    position: absolute;
    left: clamp(0.75rem, 4vw, 3rem);
    top: 10%;
    padding: 0.7rem 2.2rem;
    font-size: 1.4rem;
    background: rgba(252, 250, 244, 0.97);
    color: #2d2f45;
    border: 0;
    border-radius: 1.4rem;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5);
  }
  .cta:hover:not(:disabled) {
    background: #3f5d99;
    color: #fcfaf4;
  }
  .cta:active:not(:disabled) {
    transform: translateY(2px);
  }
</style>
