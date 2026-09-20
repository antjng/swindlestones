<script lang="ts">
  import type { Face } from '../game/types';

  interface Props {
    face: Face;
    size?: number;
  }

  let { face, size = 44 }: Props = $props();

  const PIPS: Record<Face, readonly (readonly [number, number])[]> = {
    1: [[32, 35]],
    2: [[24, 41], [40, 29]],
    3: [[32, 24], [22, 43], [42, 43]],
    4: [[32, 22], [20, 43], [44, 43], [32, 36]],
  };
</script>

<svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
  <polygon points="32,3 58,18 58,46 32,61 6,46 6,18" class="body" />
  <polyline points="32,3 6,46 58,46 32,3" class="edge" />
  <polyline points="6,18 32,32 58,18 M32,32 32,61" class="edge" />
  {#each PIPS[face] as [x, y]}
    <circle cx={x} cy={y} r="4.6" class="pip" />
  {/each}
</svg>

<style>
  .body {
    fill: currentColor;
    stroke: #1c1a26;
    stroke-width: 2.5;
    stroke-linejoin: round;
  }
  .edge {
    fill: none;
    stroke: rgba(255, 255, 255, 0.22);
    stroke-width: 1.4;
  }
  .pip {
    fill: #f4efe4;
  }
</style>
