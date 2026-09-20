<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { SceneManager } from '../scene/SceneManager';
  import type { Face } from '../game/types';

  interface Props {
    player: readonly Face[];
    ai: readonly Face[];
  }

  let { player, ai }: Props = $props();

  let canvas: HTMLCanvasElement;
  let sceneManager: SceneManager | undefined;

  onMount(() => {
    sceneManager = new SceneManager(canvas);
    sceneManager.setStones({ player, ai });
    sceneManager.start();
  });

  onDestroy(() => {
    sceneManager?.dispose();
  });

  $effect(() => {
    sceneManager?.setStones({ player, ai });
  });

  export function roll(
    hands: { player: readonly Face[]; ai: readonly Face[] },
    options: { hideAi?: boolean } = {},
  ): Promise<void> {
    return sceneManager?.rollStones(hands, options) ?? Promise.resolve();
  }

  /** Shows both hands face-up immediately. */
  export function reveal(hands: { player: readonly Face[]; ai: readonly Face[] }): void {
    sceneManager?.setStones(hands);
  }
</script>

<canvas bind:this={canvas}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
