import * as THREE from 'three';
import { WOOD_PALETTE, pixelSurface, pixelWood } from './surfaces';

const TABLE_HALF_WIDTH = 10;
/** The table runs from just behind the monk's side to well in front of your dice. */
const TABLE_BACK = -3.6;
const TABLE_FRONT = 6.4;
const TABLE_DEPTH = TABLE_FRONT - TABLE_BACK;
const TABLE_CENTER_Z = (TABLE_FRONT + TABLE_BACK) / 2;

const TABLE_TOP = 0;

const BODY_DEPTH = 4;

export interface Table {
  readonly group: THREE.Group;
  readonly flamePosition: THREE.Vector3;
  /** Moves the flame and returns how bright the candle is just now, around 1, for the light it casts. */
  update(time: number): number;
}

export function buildTable(): Table {
  const group = new THREE.Group();

  const wood = pixelWood(7);
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_HALF_WIDTH * 2, 0.5, TABLE_DEPTH),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 1 }),
  );
  top.position.set(0, TABLE_TOP - 0.25, TABLE_CENTER_Z);
  top.receiveShadow = true;
  top.castShadow = true;
  group.add(top);

  // A solid body, so nothing behind the table shows through beneath the top.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_HALF_WIDTH * 2 - 1, BODY_DEPTH, TABLE_DEPTH - 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1a120d, roughness: 1 }),
  );
  body.position.set(0, TABLE_TOP - 0.5 - BODY_DEPTH / 2, TABLE_CENTER_Z);
  group.add(body);

  const surface = (palette: readonly string[], seed: number, streak = 1) =>
    new THREE.MeshStandardMaterial({ map: pixelSurface(palette, seed, { streak, base: 0.55, contrast: 0.7 }), roughness: 1 });
  const brass = surface(['#0c0903', '#2a1f08', '#54400f', '#8a6c1c', '#c29a2c', '#efd166'], 21);
  const wax = surface(['#1a160c', '#4a422a', '#8a7e58', '#c2b686', '#e6dcac'], 22, 4);
  const candle = new THREE.Group();
  candle.position.set(-6.4, TABLE_TOP, -2.5);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 20), brass);
  dish.position.y = 0.06;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 12), brass);
  stem.position.y = 0.37;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.14, 14), brass);
  cup.position.y = 0.68;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 1.0, 12), wax);
  stick.position.y = 1.2;
  // The flame is two teardrops, a pale core inside an orange skin, pivoting from their bases so they can lean and lick.
  const flameGeometry = new THREE.ConeGeometry(0.11, 0.36, 10);
  flameGeometry.translate(0, 0.18, 0);
  const flame = new THREE.Group();
  flame.position.y = 1.7;
  const outer = new THREE.Mesh(flameGeometry, new THREE.MeshBasicMaterial({ color: 0xff9a2a, fog: false }));
  const core = new THREE.Mesh(flameGeometry, new THREE.MeshBasicMaterial({ color: 0xfff0b0, fog: false }));
  core.scale.set(0.5, 0.62, 0.5);
  flame.add(outer, core);
  for (const part of [dish, stem, cup, stick]) {
    part.castShadow = true;
  }
  candle.add(dish, stem, cup, stick, flame);
  group.add(candle);
  const flamePosition = new THREE.Vector3(-6.4, 2.0, -2.5);

  const staves = surface(WOOD_PALETTE, 23, 5);
  const iron = surface(['#050505', '#141414', '#2b2b28', '#4a4a42'], 24);
  const tankard = new THREE.Group();
  tankard.position.set(-4.7, TABLE_TOP, -2.5);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 1.05, 18, 1, true), staves);
  staves.side = THREE.DoubleSide;
  mug.position.y = 0.525;
  mug.castShadow = true;
  tankard.add(mug);
  // The ale, a little below the rim, with a pale head of foam that sways slightly.
  const aleMaterial = new THREE.MeshStandardMaterial({
    map: pixelSurface(['#1a0a03', '#3d1d07', '#6e3a0c', '#a35f14', '#d1902a'], 27, { size: 32, streak: 1, base: 0.55, contrast: 0.6 }),
    emissive: 0xb86a14,
    emissiveIntensity: 0.25,
    roughness: 0.4,
  });
  const ale = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), aleMaterial);
  ale.rotation.x = -Math.PI / 2;
  ale.position.y = 0.86;
  const foam = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 1, emissive: 0x6a5a30, emissiveIntensity: 0.3 }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.875;
  foam.scale.set(0.82, 0.82, 1);
  tankard.add(ale, foam);
  for (const y of [0.2, 0.85]) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 18), iron);
    hoop.position.y = y;
    tankard.add(hoop);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 8, 16, Math.PI), iron);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.5, 0.55, 0);
  tankard.add(handle);
  group.add(tankard);

  const leather = surface(['#060302', '#1a0e08', '#33200f', '#573719'], 25, 2);
  const purse = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), leather);
  purse.scale.set(1, 0.8, 1);
  purse.position.set(6.4, 0.5, 2.3);
  purse.castShadow = true;
  group.add(purse);
  const gold = surface(['#0c0903', '#2a1f08', '#54400f', '#8a6c1c', '#c29a2c', '#efd166'], 26);
  [
    [5.4, 2.6, 4],
    [5.05, 2.05, 2],
    [5.7, 1.9, 1],
  ].forEach(([x, z, count]) => {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07 * count, 16), gold);
    stack.position.set(x, TABLE_TOP + (0.07 * count) / 2, z);
    stack.castShadow = true;
    stack.receiveShadow = true;
    group.add(stack);
  });

  // Two rates of flicker that never line up, plus the odd gutter, so it reads as a real flame in a draught.
  const noise = (t: number, k: number) => Math.sin(t * 7.3 + k) * 0.5 + Math.sin(t * 12.9 + k * 2.1) * 0.3 + Math.sin(t * 23.1 + k * 0.7) * 0.2;
  const update = (time: number) => {
    const gutter = Math.max(0, Math.sin(time * 0.9 + Math.sin(time * 0.37) * 3) - 0.85) * 4;
    const tall = 1 + noise(time, 0) * 0.22 - gutter * 0.25;
    outer.scale.set(1 - noise(time, 3) * 0.12, tall, 1 - noise(time, 5) * 0.12);
    core.scale.set(0.5, 0.62 * tall, 0.5);
    flame.rotation.z = noise(time, 1) * 0.28;
    flame.rotation.x = noise(time, 2) * 0.22;
    foam.position.x = Math.sin(time * 1.3) * 0.01;
    const brightness = 1 + noise(time, 4) * 0.16 - gutter * 0.12;
    aleMaterial.emissiveIntensity = 0.2 * brightness;
    return brightness;
  };

  return { group, flamePosition, update };
}
