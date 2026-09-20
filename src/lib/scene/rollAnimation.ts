import * as THREE from 'three';

const DEFAULT_DURATION_MS = 700;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function randomQuaternion(): THREE.Quaternion {
  return new THREE.Quaternion(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
  ).normalize();
}

function quadraticBezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number): THREE.Vector3 {
  const inv = 1 - t;
  return new THREE.Vector3(
    inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
    inv * inv * p0.z + 2 * inv * t * p1.z + t * t * p2.z,
  );
}

export interface RollAnimationOptions {
  readonly durationMs?: number;
  /** Land numeral-side down. */
  readonly hidden?: boolean;
}

/**
 * Tosses a stone in an arc to `targetPosition`, tumbling before it settles
 * flat. Purely visual: the rolled value is already baked into the mesh.
 */
export function playRollAnimation(
  mesh: THREE.Object3D,
  targetPosition: THREE.Vector3,
  { durationMs = DEFAULT_DURATION_MS, hidden = false }: RollAnimationOptions = {},
): Promise<void> {
  const startPosition = mesh.position.clone();
  const liftHeight = Math.max(startPosition.y, targetPosition.y) + 1.8 + Math.random() * 0.4;
  const controlPosition = startPosition.clone().lerp(targetPosition, 0.5);
  controlPosition.y = liftHeight;

  const startQuat = mesh.quaternion.clone();
  const midQuatA = randomQuaternion();
  const midQuatB = randomQuaternion();
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
  const finalQuat = hidden
    ? yaw.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI))
    : yaw;

  return new Promise((resolve) => {
    let startTime: number | null = null;

    function tick(now: number) {
      if (startTime === null) startTime = now;
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = easeOutCubic(t);

      mesh.position.copy(quadraticBezier(startPosition, controlPosition, targetPosition, eased));

      if (t < 0.55) {
        mesh.quaternion.copy(startQuat).slerp(midQuatA, t / 0.55);
      } else if (t < 0.85) {
        mesh.quaternion.copy(midQuatA).slerp(midQuatB, (t - 0.55) / 0.3);
      } else {
        mesh.quaternion.copy(midQuatB).slerp(finalQuat, (t - 0.85) / 0.15);
      }

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        mesh.position.copy(targetPosition);
        mesh.quaternion.copy(finalQuat);
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}
