<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createRoom, joinRoom, normaliseCode } from '../net/peerTransport';
  import type { Room } from '../net/peerTransport';
  import { OnlineSession } from '../net/session';
  import DiceCanvas from './DiceCanvas.svelte';
  import DieIcon from './DieIcon.svelte';

  interface Props {
    onPlayMonk: () => void;
    onOnline: (session: OnlineSession) => void;
  }

  const { onPlayMonk, onOnline }: Props = $props();

  type Step = 'choose' | 'friend' | 'creating' | 'waiting' | 'joining';
  let step = $state<Step>('choose');
  let code = $state('');
  let typed = $state('');
  let error = $state('');
  let copied = $state(false);
  let room: Room | null = null;
  // The monk waiting at his table, idling behind the card: the same scene the game itself uses, so the title screen is never still.
  let diceCanvas: DiceCanvas;

  const invite = $derived(`${location.origin}${location.pathname}#room=${code}`);

  async function host(): Promise<void> {
    error = '';
    step = 'creating';
    try {
      room = await createRoom();
      code = room.code;
      step = 'waiting';
      const line = await room.friend;
      room = null;
      onOnline(new OnlineSession('host', line));
    } catch (failure) {
      error = failure instanceof Error ? failure.message : "Couldn't open a room. Try again.";
      step = 'friend';
    }
  }

  async function join(rawCode: string): Promise<void> {
    error = '';
    step = 'joining';
    try {
      const line = await joinRoom(rawCode);
      onOnline(new OnlineSession('guest', line));
    } catch (failure) {
      error = failure instanceof Error ? failure.message : "Couldn't connect. Try again.";
      step = 'friend';
    }
  }

  function cancel(): void {
    room?.cancel();
    room = null;
    step = 'friend';
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(invite);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      // clipboard unavailable: the link is on screen to copy by hand
    }
  }

  onMount(() => {
    // Someone followed an invite link: go straight to that room.
    const match = location.hash.match(/room=([A-Za-z0-9]+)/);
    if (match) {
      typed = normaliseCode(match[1]);
      void join(typed);
    }
  });

  // He doesn't just sit there: every so often, unprompted, he turns something over in his head.
  const moodTimer = setInterval(() => diceCanvas?.setMood(Math.random() < 0.6 ? 'thinking' : 'idle'), 7000);
  onDestroy(() => clearInterval(moodTimer));
</script>

<div class="lobby">
  <div class="backdrop" aria-hidden="true">
    <DiceCanvas bind:this={diceCanvas} />
  </div>
  <div class="vignette" aria-hidden="true"></div>
  <div class="grain" aria-hidden="true"></div>

  <div class="card">
    <header class="masthead">
      <div class="dice-flank left" aria-hidden="true">
        <span class="die blue" style="--tilt: -14deg"><DieIcon face={3} size={30} /></span>
        <span class="die red" style="--tilt: 8deg"><DieIcon face={1} size={22} /></span>
      </div>

      <div class="title-block">
        <h1>Swindlestones</h1>
        <div class="flourish" aria-hidden="true">
          <span class="rule"></span>
          <svg viewBox="0 0 24 24" width="13" height="13" class="mark"><polygon points="12,1 19,5.5 23,12 19,18.5 12,23 5,18.5 1,12 5,5.5" /></svg>
          <span class="rule"></span>
        </div>
        <p class="tag">A game of dice, nerve, and lies.</p>
      </div>

      <div class="dice-flank right" aria-hidden="true">
        <span class="die red" style="--tilt: -8deg"><DieIcon face={4} size={22} /></span>
        <span class="die blue" style="--tilt: 15deg"><DieIcon face={2} size={30} /></span>
      </div>
    </header>

    {#if step === 'choose'}
      <div class="choices">
        <div class="option">
          <button class="big" onclick={onPlayMonk}>Play the Monk</button>
          <p class="hint">Try your nerve against a cunning, watchful opponent.</p>
        </div>
        <div class="option">
          <button class="big" onclick={() => (step = 'friend')}>Play a Friend</button>
          <p class="hint">Open a table online and swindle someone you know.</p>
        </div>
      </div>
    {:else if step === 'friend'}
      <div class="friend">
        <button class="big" onclick={host}>Open a room</button>
        <p class="or">or join one</p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            if (normaliseCode(typed).length > 0) void join(typed);
          }}
        >
          <input
            bind:value={typed}
            placeholder="Room code"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="12"
            aria-label="Room code"
          />
          <button type="submit" disabled={normaliseCode(typed).length === 0}>Join</button>
        </form>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <button class="back" onclick={() => (step = 'choose')}>Back</button>
      </div>
    {:else if step === 'creating'}
      <p class="status">Opening a room…</p>
    {:else if step === 'waiting'}
      <div class="waiting">
        <p class="status">Share this code with your friend:</p>
        <p class="code" aria-label="Room code">{code}</p>
        <button onclick={copy}>{copied ? 'Copied!' : 'Copy invite link'}</button>
        <p class="status soft">Waiting for them to join…</p>
        <button class="back" onclick={cancel}>Cancel</button>
      </div>
    {:else}
      <p class="status">Joining the table…</p>
    {/if}
  </div>
</div>

<style>
  .lobby {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    overflow: hidden;
    /* A plain fallback behind the live scene, for the instant before it has painted a first frame. */
    background: #070403;
  }
  /* The monk, waiting at his own table: the same animated scene the game plays on, idling behind the card
     so the title screen breathes, flickers and mills about on its own, rather than sitting still. */
  .backdrop {
    position: absolute;
    inset: 0;
  }
  .backdrop :global(canvas) {
    filter: saturate(0.85) brightness(0.9);
  }
  /* Darkens the edges so the eye settles on the card, and dims the scene a touch behind it. */
  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 60% 55% at 50% 48%, rgba(5, 3, 2, 0.35) 0%, rgba(5, 3, 2, 0.6) 55%, rgba(5, 3, 2, 0.88) 100%);
    pointer-events: none;
  }
  /* A faint dither of dots, echoing the ordered-dither look of the table scene. */
  .grain {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px);
    background-size: 3px 3px;
    opacity: 0.05;
    mix-blend-mode: overlay;
    pointer-events: none;
  }

  .card {
    position: relative;
    width: min(30rem, 100%);
    padding: 2.1rem clamp(1.2rem, 6vw, 2.4rem) 2.6rem;
    text-align: center;
    background: var(--paper-light);
    background-image: radial-gradient(ellipse at 20% 15%, rgba(0, 0, 0, 0.05), transparent 55%), radial-gradient(ellipse at 85% 90%, rgba(0, 0, 0, 0.05), transparent 55%);
    border: 3px double var(--ink);
    /* The torn bottom edge needs a drop-shadow, not a box-shadow: a box-shadow would be clipped square by it. */
    filter: drop-shadow(0 14px 34px rgba(0, 0, 0, 0.65)) drop-shadow(0 0 40px rgba(255, 154, 68, 0.08));
    clip-path: polygon(
      0 0, 100% 0, 100% calc(100% - 2px), 96% calc(100% - 6px), 91% calc(100% - 1px), 84% calc(100% - 7px),
      76% calc(100% - 2px), 68% calc(100% - 8px), 60% calc(100% - 1px), 52% calc(100% - 6px), 44% calc(100% - 1px),
      36% calc(100% - 8px), 29% calc(100% - 2px), 22% calc(100% - 7px), 15% calc(100% - 1px), 9% calc(100% - 8px),
      4% calc(100% - 2px), 0 calc(100% - 9px)
    );
  }

  .masthead {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-bottom: 1.5rem;
  }
  .title-block {
    flex: 1;
    min-width: 0;
  }
  .dice-flank {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-shrink: 0;
  }
  .dice-flank.right {
    flex-direction: row-reverse;
  }
  .die {
    display: inline-flex;
    transform: rotate(var(--tilt));
    filter: drop-shadow(1px 2px 1px rgba(0, 0, 0, 0.35));
  }
  .die.blue {
    color: #2b508c;
  }
  .die.red {
    color: #7e1c1c;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.7rem, 6vw + 0.6rem, 2.6rem);
    letter-spacing: 0.1em;
    color: var(--ink);
    text-shadow: 0 0 22px rgba(255, 154, 68, 0.3), 0 1px 0 rgba(255, 255, 255, 0.25);
    /* "Swindlestones" is one long word: on the narrowest screens it may still need to break rather than overflow. */
    overflow-wrap: break-word;
  }
  .flourish {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 78%;
    margin: 0.35rem auto 0.3rem;
  }
  .flourish .rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--ink-soft), transparent);
  }
  .flourish .mark polygon {
    fill: var(--blood);
  }
  .tag {
    margin: 0.3rem 0 0;
    font-style: italic;
    color: var(--ink-soft);
  }

  .choices,
  .friend,
  .waiting {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.9rem;
  }
  .option {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .big {
    padding: 0.75rem 1rem;
    font-size: 1.35rem;
  }
  .hint {
    margin: 0;
    font-size: 0.92rem;
    font-style: italic;
    color: var(--ink-soft);
  }
  .or {
    margin: 0.2rem 0 0;
    font-style: italic;
    color: var(--ink-soft);
  }
  form {
    display: flex;
    gap: 0.6rem;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 0.4rem 0.7rem;
    font: inherit;
    font-size: 1.2rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    text-align: center;
    color: var(--ink);
    background: #fffaf0;
    border: 2px solid var(--ink);
    border-radius: 2px;
  }
  .back {
    align-self: center;
    margin-top: 0.4rem;
    box-shadow: none;
    border-color: transparent;
    background: transparent;
    text-decoration: underline;
  }
  .status {
    margin: 0;
  }
  .soft {
    font-style: italic;
    color: var(--ink-soft);
  }
  .code {
    margin: 0;
    font-family: var(--font-caps);
    font-size: 3rem;
    letter-spacing: 0.3em;
    padding-left: 0.3em;
    color: var(--blood);
  }
  .error {
    margin: 0;
    color: var(--blood);
  }

  @media (max-width: 30rem) {
    .dice-flank {
      display: none;
    }
  }
</style>
