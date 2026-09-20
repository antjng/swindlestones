<script lang="ts">
  interface Props {
    text: string;
  }

  let { text }: Props = $props();
</script>

<div class="banner" aria-live="polite">
  <span>{text}</span>
</div>

<style>
  .banner {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: min(94%, 44rem);
    padding: 0.95rem 1.5rem 0.75rem;
    text-align: center;
    background: #f1ecdf;
    color: #4a4d6c;
    font-style: italic;
    font-size: clamp(1.1rem, 2.4vw, 1.45rem);
    /* A torn top edge. */
    clip-path: polygon(
      0 14%, 4% 4%, 9% 12%, 15% 2%, 22% 10%, 29% 3%, 36% 11%, 44% 1%, 52% 9%, 60% 2%, 68% 11%, 76% 3%,
      84% 10%, 91% 2%, 96% 9%, 100% 3%, 100% 100%, 0 100%
    );
    filter: drop-shadow(0 -2px 6px rgba(0, 0, 0, 0.4));
  }
</style>
