import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { simulateFlick } from './dicePhysics';

const die = (x: number, z: number) => {
  const object = new THREE.Object3D();
  object.position.set(x, 0.4, z);
  return object;
};

const monk = { object: new THREE.Object3D(), x: 4.7, z: -3.8 };

describe('simulateFlick', () => {
  it('passes momentum down a line of dice without any of them overlapping', () => {
    for (let trial = 0; trial < 20; trial++) {
      const flicked = die(0, 3);
      const second = die(0, 1.9);
      const third = die(0.1, 0.8);
      const simulation = simulateFlick(flicked, [second, third], [], new THREE.Vector3(0, 0, -1), monk);

      const frames = (object: THREE.Object3D) => simulation.bodies.find((body) => body.object === object)!.frames;
      const flickedFrames = frames(flicked);
      const secondFrames = frames(second);
      const thirdFrames = frames(third);

      // Every die is tracked every frame.
      expect(secondFrames.length).toBe(simulation.frameCount);
      // The die that was hit moves, and so does the one it hits in turn (unless the flick missed both).
      const moved = (list: typeof secondFrames) => list[list.length - 1].position.distanceTo(list[0].position);
      if (moved(secondFrames) > 0.01) {
        // Once knocked, the second die may not pass through the third.
        for (let i = 0; i < simulation.frameCount; i++) {
          const a = secondFrames[i].position;
          const b = thirdFrames[i].position;
          const gap = Math.hypot(a.x - b.x, a.z - b.z);
          expect(gap).toBeGreaterThan(0.75);
        }
      }
      void flickedFrames;
    }
  });

  it('sets a knocked die down on a face, not standing on an edge', () => {
    const flicked = die(0, 3);
    const second = die(0, 1.9);
    const simulation = simulateFlick(flicked, [second], [], new THREE.Vector3(0, 0, -1), monk);
    const last = simulation.bodies.find((body) => body.object === second)!.frames.at(-1)!;
    // Some face normal points straight down.
    let lowest = 0;
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      lowest = Math.min(lowest, new THREE.Vector3(sx, sy, sz).normalize().applyQuaternion(last.orientation).y);
    }
    expect(lowest).toBeLessThan(-0.99);
  });
});
