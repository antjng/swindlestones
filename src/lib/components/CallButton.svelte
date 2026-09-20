<script lang="ts">
  interface Props {
    disabled: boolean;
    onCall: () => void;
  }

  let { disabled, onCall }: Props = $props();
</script>

<button class="call" onclick={onCall} {disabled}>Call!</button>

<style>
  .call {
    font-weight: 700;
  }
</style>
