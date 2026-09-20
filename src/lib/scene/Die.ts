import * as THREE from 'three';
import type { Face, PlayerId } from '../game/types';

const EDGE = 0.95;
const CIRCUMRADIUS = EDGE / Math.SQRT2;

export const DIE_REST_HEIGHT = CIRCUMRADIUS / Math.sqrt(3);

const TEXTURE_SIZE = 256;

type Sign = 1 | -1;

// An eight-sided die: each face points along one of the (+-1, +-1, +-1)
// diagonals, and every value from 1 to 4 appears on exactly two faces.
const FACE_DEFINITIONS: readonly { readonly signs: readonly [Sign, Sign, Sign]; readonly value: Face }[] = [
  { signs: [1, 1, 1], value: 1 },
  { signs: [-1, 1, -1], value: 1 },
  { signs: [1, 1, -1], value: 2 },
  { signs: [1, -1, -1], value: 2 },
  { signs: [-1, -1, 1], value: 3 },
  { signs: [-1, 1, 1], value: 3 },
  { signs: [-1, -1, -1], value: 4 },
  { signs: [1, -1, 1], value: 4 },
];

const UV_CORNERS: readonly (readonly [number, number])[] = [
  [0.5, 0.92],
  [0.06, 0.15],
  [0.94, 0.15],
];

const DIE_COLORS: Record<PlayerId, { base: string; fleck: string }> = {
  player: { base: '#2b508c', fleck: '#6f9ad0' },
  ai: { base: '#9a2a2a', fleck: '#d0685c' },
};

function faceNormal(signs: readonly [Sign, Sign, Sign]): THREE.Vector3 {
  return new THREE.Vector3(...signs).normalize();
}

function createFaceTexture(value: Face, owner: PlayerId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d')!;
  const { base, fleck } = DIE_COLORS[owner];

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = i % 3 === 0 ? fleck : 'rgba(0,0,0,0.35)';
    ctx.globalAlpha = 0.15 + Math.random() * 0.3;
    ctx.fillRect(Math.random() * TEXTURE_SIZE, Math.random() * TEXTURE_SIZE, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  ctx.globalAlpha = 1;

  const corners = UV_CORNERS.map(([u, v]) => ({ x: u * TEXTURE_SIZE, y: (1 - v) * TEXTURE_SIZE }));
  const center = {
    x: corners.reduce((sum, p) => sum + p.x, 0) / 3,
    y: corners.reduce((sum, p) => sum + p.y, 0) / 3,
  };

  const toward = (corner: { x: number; y: number }, amount: number) => ({
    x: center.x + (corner.x - center.x) * amount,
    y: center.y + (corner.y - center.y) * amount,
  });
  const pips =
    value === 1
      ? [center]
      : value === 2
        ? [toward(corners[0], 0.46), toward(corners[0], -0.46)]
        : value === 3
          ? corners.map((c) => toward(c, 0.5))
          : [center, ...corners.map((c) => toward(c, 0.62))];

  const radius = value === 1 ? 30 : 23;
  for (const pip of pips) {
    ctx.beginPath();
    ctx.arc(pip.x, pip.y, radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pip.x, pip.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff7e2';
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

let sharedGeometry: THREE.BufferGeometry | null = null;
const materialsByOwner = new Map<PlayerId, THREE.Material[]>();

function getGeometry(): THREE.BufferGeometry {
  if (sharedGeometry) return sharedGeometry;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();

  FACE_DEFINITIONS.forEach(({ signs, value }, faceIndex) => {
    const [sx, sy, sz] = signs;
    const corners = [
      new THREE.Vector3(sx * CIRCUMRADIUS, 0, 0),
      new THREE.Vector3(0, sy * CIRCUMRADIUS, 0),
      new THREE.Vector3(0, 0, sz * CIRCUMRADIUS),
    ];
    const normal = faceNormal(signs);
    const winding = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0]));
    if (winding.dot(normal) < 0) corners.reverse();

    corners.forEach((corner, i) => {
      positions.push(corner.x, corner.y, corner.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(...UV_CORNERS[i]);
    });
    geometry.addGroup(faceIndex * 3, 3, value - 1);
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  sharedGeometry = geometry;
  return geometry;
}

function getMaterials(owner: PlayerId): THREE.Material[] {
  let materials = materialsByOwner.get(owner);
  if (!materials) {
    materials = ([1, 2, 3, 4] as const).map(
      (value) => new THREE.MeshStandardMaterial({ map: createFaceTexture(value, owner), roughness: 0.4, metalness: 0.05 }),
    );
    materialsByOwner.set(owner, materials);
  }
  return materials;
}

export function createDieMesh(owner: PlayerId): THREE.Mesh {
  const mesh = new THREE.Mesh(getGeometry(), getMaterials(owner));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Orientation that rests the die flat with a face showing `value` on top, turned by `yaw`. */
export function restingQuaternion(value: Face, yaw: number): THREE.Quaternion {
  const candidates = FACE_DEFINITIONS.filter((face) => face.value === value);
  const face = candidates[Math.floor(Math.random() * candidates.length)];
  const upright = new THREE.Quaternion().setFromUnitVectors(faceNormal(face.signs), UP);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(upright);
}
