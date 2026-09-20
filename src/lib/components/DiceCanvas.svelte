<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { SceneManager } from '../scene/SceneManager';
  import type { OpponentMood } from '../scene/SceneManager';
  import type { Face } from '../game/types';

  let canvas: HTMLCanvasElement;
  let sceneManager: SceneManager | undefined;

  onMount(() => {
    sceneManager = new SceneManager(canvas);
    sceneManager.start();
  });

  onDestroy(() => {
    sceneManager?.dispose();
  });

  export function roll(hands: { player: readonly Face[]; ai: readonly Face[] }): Promise<void> {
    return sceneManager?.rollDice(hands) ?? Promise.resolve();
  }

  /** Lifts the opponent's hand to show his dice. */
  export function reveal(): Promise<void> {
    return sceneManager?.revealHands() ?? Promise.resolve();
  }

  export function speak(seconds: number): void {
    sceneManager?.speak(seconds);
  }

  export function peek(): void {
    void sceneManager?.peekAtDice();
  }

  export function clear(): void {
    sceneManager?.clearDice();
  }

  export function setMood(mood: OpponentMood): void {
    sceneManager?.setOpponentMood(mood);
  }
</script>

<canvas bind:this={canvas}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
</style>
