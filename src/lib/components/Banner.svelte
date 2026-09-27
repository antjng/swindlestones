<script lang="ts">
  export interface LogEntry {
    text: string;
    kind: 'round' | 'you' | 'monk' | 'result';
  }

  interface Props {
    text: string;
    /** Everything that has happened this game, oldest first; shown on hover. */
    history?: readonly LogEntry[];
  }

  let { text, history = [] }: Props = $props();

  let panel: HTMLDivElement | undefined = $state();

  // Keep the latest lines in view.
  $effect(() => {
    void history.length;
    if (panel) panel.scrollTop = panel.scrollHeight;
  });
</script>

<!-- One strip of paper: hovered or focused, it grows upward to show the transcript above the line of text, torn edge and all. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="wrap" tabindex="0" role="log" aria-label="Game transcript">
  <div class="banner">
    {#if history.length > 0}
      <div class="panel" bind:this={panel}>
        {#each history as entry, i (i)}
          <p class={entry.kind}>{entry.text}</p>
        {/each}
      </div>
    {/if}
    <div class="line" aria-live="polite">
      <span>{text}</span>
    </div>
  </div>
</div>

<style>
  .wrap {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: min(94%, 44rem);
    outline: none;
  }
  .banner {
    background: #f1ecdf;
    color: #4a4d6c;
    /* A torn top edge, in fixed-size teeth so it looks the same however tall the paper grows. */
    clip-path: polygon(
      0 8px, 4% 2px, 9% 7px, 15% 1px, 22% 6px, 29% 2px, 36% 7px, 44% 1px, 52% 5px, 60% 1px, 68% 7px, 76% 2px,
      84% 6px, 91% 1px, 96% 5px, 100% 2px, 100% 100%, 0 100%
    );
    filter: drop-shadow(0 -2px 6px rgba(0, 0, 0, 0.4));
  }
  .line {
    padding: 0.95rem 1.5rem 0.75rem;
    text-align: center;
    font-style: italic;
    font-size: clamp(1.1rem, 2.4vw, 1.45rem);
  }
  .panel {
    --line: 1.6rem;
    max-height: 0;
    padding: 0 1.5rem;
    overflow: hidden;
    font-size: clamp(0.95rem, 2vw, 1.15rem);
    transition: max-height 0.28s ease, padding 0.28s ease;
    /* Ruled paper: every line of text is exactly one rule high, so the writing sits on the lines and the rules scroll with it. */
    background-image: repeating-linear-gradient(transparent 0, transparent calc(var(--line) - 1px), rgba(74, 77, 108, 0.22) calc(var(--line) - 1px), rgba(74, 77, 108, 0.22) var(--line));
    background-origin: content-box;
    background-attachment: local;
  }
  .wrap:hover .panel,
  .wrap:focus-within .panel,
  .wrap:focus .panel {
    max-height: 46vh;
    padding: 0.9rem 1.5rem 0.4rem;
    overflow-y: auto;
  }
  p {
    margin: 0;
    padding: 0;
    line-height: var(--line);
    font-style: italic;
  }
  .round {
    font-style: normal;
    font-weight: 700;
    font-variant: small-caps;
    letter-spacing: 0.08em;
    color: #2d2f45;
  }
  .you {
    color: #3f5d99;
  }
  .monk {
    color: #8a2f2f;
  }
  .result {
    color: #2d2f45;
    font-style: normal;
  }
</style>
