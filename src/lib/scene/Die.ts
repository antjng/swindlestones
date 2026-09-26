import * as THREE from 'three';
import type { Face, PlayerId } from '../game/types';
import { noise2, shadeLayer } from './pixel';
import { pixelTexture } from './surfaces';

const EDGE = 0.96;
const CIRCUMRADIUS = EDGE / Math.SQRT2;

/**
 * How far a resting die is cocked toward the player, in radians. Zero is dead flat; a little tilt gives the top face a less grazing view.
 */
export const TOP_TILT = 0;

const TEXTURE_SIZE = 64;

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

/** Yours is blue and his is red, as ever, dithered through a few tones with pale pips. */
const DIE_STYLE: Record<PlayerId, { palette: readonly string[]; pip: string; pipRim: string }> = {
  player: { palette: ['#0f1c34', '#1b3260', '#2b508c', '#3f6db0', '#6f9ad0'], pip: '#fff7e2', pipRim: '#050a14' },
  ai: { palette: ['#2a0808', '#561111', '#7e1c1c', '#a52c2c', '#d0685c'], pip: '#fff7e2', pipRim: '#140404' },
};

function faceNormal(signs: readonly [Sign, Sign, Sign]): THREE.Vector3 {
  return new THREE.Vector3(...signs).normalize();
}

function createFaceTexture(value: Face, owner: PlayerId): THREE.CanvasTexture {
  const { palette, pip: pipColor, pipRim } = DIE_STYLE[owner];
  const layer = shadeLayer(TEXTURE_SIZE * 4, TEXTURE_SIZE * 4, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  }, {
    palette,
    shade: (x, y) => 0.55 + (noise2(x, y, 14, value * 7 + owner.length) - 0.5) * 0.4 + (noise2(x, y, 5, value * 3) - 0.5) * 0.18,
  });
  const ctx = layer.getContext('2d')!;

  const corners = UV_CORNERS.map(([u, v]) => ({ x: u * TEXTURE_SIZE, y: (1 - v) * TEXTURE_SIZE }));
  const center = {
    x: corners.reduce((sum, p) => sum + p.x, 0) / 3,
    y: corners.reduce((sum, p) => sum + p.y, 0) / 3,
  };

  const toward = (corner: { x: number; y: number }, amount: number) => ({
    x: center.x + (corner.x - center.x) * amount,
    y: center.y + (corner.y - center.y) * amount,
  });
  // Each layout keeps a pip (and its rim) clear of the triangle's edges.
  const pips =
    value === 1
      ? [center]
      : value === 2
        ? [{ x: center.x - 9, y: center.y }, { x: center.x + 9, y: center.y }]
        : value === 3
          ? corners.map((c) => toward(c, 0.5))
          : [center, ...corners.map((c) => toward(c, 0.58))];

  // Big, blocky, high-contrast pips: pixel discs with a dark rim, readable from across the table.
  const radius = { 1: 9, 2: 6.5, 3: 6.5, 4: 5.5 }[value];
  const disc = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) ctx.fillRect(x, y, 1, 1);
      }
    }
  };
  for (const pip of pips) {
    disc(pip.x, pip.y, radius + 1.2, pipRim);
    disc(pip.x, pip.y, radius, pipColor);
  }

  // A dark edge round the face, so the die's shape holds in the gloom.
  ctx.strokeStyle = '#060302';
  ctx.lineWidth = 2;
  ctx.beginPath();
  corners.forEach((c, i) => {
    const x = center.x + (c.x - center.x) * 0.97;
    const y = center.y + (c.y - center.y) * 0.97;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  return pixelTexture(layer);
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
      (value) => {
        const map = createFaceTexture(value, owner);
        // A little self-glow, so the dice stay legible in the gloom.
        const material = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.9, metalness: 0 });
        // Only the face on top counts: the others lose their pips and go a plain dark tone, so there is nothing else to misread.
        const side = new THREE.Color(DIE_STYLE[owner].palette[2]).multiplyScalar(0.55);
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            vec3 topInView = normalize((viewMatrix * vec4(0.0, ${Math.cos(TOP_TILT).toFixed(4)}, ${Math.sin(TOP_TILT).toFixed(4)}, 0.0)).xyz);
            float facing = smoothstep(0.85, 0.97, dot(normalize(normal), topInView));
            vec3 sideColor = vec3(${side.r.toFixed(4)}, ${side.g.toFixed(4)}, ${side.b.toFixed(4)});
            // The other faces keep their pips, but dim and muddy, so the top one still stands out.
            float sideLight = mix(0.3, 1.05, facing);
            diffuseColor.rgb = mix(mix(sideColor, diffuseColor.rgb, 0.4), diffuseColor.rgb * 1.05, facing) * mix(0.7, 1.0, facing);
            totalEmissiveRadiance = totalEmissiveRadiance * sideLight;`,
          );
        };
        material.customProgramCacheKey = () => 'die-top-' + owner;
        return material;
      },
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

/** The direction, within a face, that its texture calls up: from the middle of the face toward its top corner. */
function textureUp(face: (typeof FACE_DEFINITIONS)[number]): THREE.Vector3 {
  const [sx, sy, sz] = face.signs;
  const corners = [new THREE.Vector3(sx * CIRCUMRADIUS, 0, 0), new THREE.Vector3(0, sy * CIRCUMRADIUS, 0), new THREE.Vector3(0, 0, sz * CIRCUMRADIUS)];
  const normal = faceNormal(face.signs);
  const winding = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0]));
  if (winding.dot(normal) < 0) corners.reverse();
  return corners[0].clone().sub(normal.clone().multiplyScalar(corners[0].dot(normal))).normalize();
}

/**
 * Orientation that rests the die on the face opposite `value`, so `value` is on
 * top, with its pips upright as seen from the player's side of the table.
 * `yaw` turns it a little about the vertical.
 */
export function facingQuaternion(value: Face, yaw: number): THREE.Quaternion {
  const faces = FACE_DEFINITIONS.filter((face) => face.value === value);
  const face = faces[Math.floor(Math.random() * faces.length)];
  const normal = faceNormal(face.signs);
  const up = textureUp(face);

  const source = new THREE.Matrix4().makeBasis(up, normal, new THREE.Vector3().crossVectors(up, normal));
  const towardFar = new THREE.Vector3(0, 0, -1);
  const top = new THREE.Vector3(0, 1, 0);
  const target = new THREE.Matrix4().makeBasis(towardFar, top, new THREE.Vector3().crossVectors(towardFar, top));
  const rotation = new THREE.Matrix4().multiplyMatrices(target, source.clone().transpose());
  const base = new THREE.Quaternion().setFromRotationMatrix(rotation);
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), TOP_TILT);
  return tilt.multiply(turn).multiply(base);
}

/** How high the die's middle sits when it is resting in this orientation, with its lowest corner on the table. */
export function restHeight(orientation: THREE.Quaternion): number {
  let lowest = Infinity;
  for (const axis of [0, 1, 2]) {
    for (const sign of [1, -1]) {
      const corner = new THREE.Vector3();
      corner.setComponent(axis, sign * CIRCUMRADIUS);
      lowest = Math.min(lowest, corner.applyQuaternion(orientation).y);
    }
  }
  return -lowest;
}
