import * as THREE from 'three';
import type { Face } from '../game/types';

const RADIUS = 0.45;
const HEIGHT = 0.22;
const RADIAL_SEGMENTS = 48;

const STONE_COLOR = 0xd8d0c0;
const NUMERAL_COLOR = '#2b2620';

const topMaterialCache = new Map<Face, THREE.MeshStandardMaterial>();
let sideMaterial: THREE.MeshStandardMaterial | null = null;
let bottomMaterial: THREE.MeshStandardMaterial | null = null;
let sharedGeometry: THREE.CylinderGeometry | null = null;

function createNumeralTexture(face: Face): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = `#${STONE_COLOR.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = NUMERAL_COLOR;
  ctx.font = `bold ${size * 0.6}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Top-cap UVs are rotated 180 degrees relative to the canvas.
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI);
  ctx.fillText(String(face), 0, size * 0.03);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getTopMaterial(face: Face): THREE.MeshStandardMaterial {
  let material = topMaterialCache.get(face);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      map: createNumeralTexture(face),
      roughness: 0.6,
      metalness: 0.05,
    });
    topMaterialCache.set(face, material);
  }
  return material;
}

function getSideMaterial(): THREE.MeshStandardMaterial {
  if (!sideMaterial) {
    sideMaterial = new THREE.MeshStandardMaterial({ color: STONE_COLOR, roughness: 0.8 });
  }
  return sideMaterial;
}

function getBottomMaterial(): THREE.MeshStandardMaterial {
  if (!bottomMaterial) {
    bottomMaterial = new THREE.MeshStandardMaterial({ color: STONE_COLOR, roughness: 0.8 });
  }
  return bottomMaterial;
}

function getGeometry(): THREE.CylinderGeometry {
  if (!sharedGeometry) {
    sharedGeometry = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, RADIAL_SEGMENTS);
  }
  return sharedGeometry;
}

/** A disc-shaped stone showing `face` on its top cap. */
export function createStoneMesh(face: Face): THREE.Mesh {
  // Geometry groups are ordered [side, top cap, bottom cap].
  const materials = [getSideMaterial(), getTopMaterial(face), getBottomMaterial()];
  const mesh = new THREE.Mesh(getGeometry(), materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.face = face;
  return mesh;
}

export const STONE_HEIGHT = HEIGHT;
