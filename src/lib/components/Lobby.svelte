<script lang="ts">
  import { onMount } from 'svelte';
  import { createRoom, joinRoom, normaliseCode } from '../net/peerTransport';
  import type { Room } from '../net/peerTransport';
  import { OnlineSession } from '../net/session';

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
</script>

<div class="lobby">
  <div class="card">
    <h1>Swindlestones</h1>
    <p class="tag">A game of dice, nerve, and lies.</p>

    {#if step === 'choose'}
      <div class="choices">
        <button class="big" onclick={onPlayMonk}>Play the monk</button>
        <button class="big" onclick={() => (step = 'friend')}>Play a friend</button>
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
    background: radial-gradient(ellipse at 50% 40%, #2a180a 0%, #0a0503 70%);
  }
  .card {
    width: min(26rem, 100%);
    padding: 2rem 2.2rem 2.2rem;
    text-align: center;
    background: var(--paper-light);
    border: 3px double var(--ink);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  }
  h1 {
    margin: 0;
    font-size: 2.4rem;
  }
  .tag {
    margin: 0.2rem 0 1.6rem;
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
  .big {
    padding: 0.7rem 1rem;
    font-size: 1.3rem;
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
</style>
