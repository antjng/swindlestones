interface Tween {
  elapsed: number;
  readonly duration: number;
  readonly onUpdate: (t: number) => void;
  readonly resolve: () => void;
}

export class Tweens {
  private readonly active = new Set<Tween>();

  /** Calls onUpdate with 0..1 progress each frame; the final call is always exactly 1. */
  run(durationMs: number, onUpdate: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      this.active.add({ elapsed: 0, duration: durationMs, onUpdate, resolve });
    });
  }

  update(deltaMs: number): void {
    for (const tween of [...this.active]) {
      tween.elapsed += deltaMs;
      const t = Math.min(tween.elapsed / tween.duration, 1);
      tween.onUpdate(t);
      if (t >= 1) {
        this.active.delete(tween);
        tween.resolve();
      }
    }
  }

  /** Finishes every pending tween immediately. */
  finishAll(): void {
    for (const tween of [...this.active]) {
      tween.onUpdate(1);
      tween.resolve();
    }
    this.active.clear();
  }
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
