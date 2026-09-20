import * as THREE from 'three';

const TABLE_HALF_WIDTH = 9;
const TABLE_HALF_DEPTH = 3.6;

const TABLE_TOP = 0;

const BODY_DEPTH = 4;

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')!];
}

function weatheredWood(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(2048, 512);
  ctx.fillStyle = '#5a5046';
  ctx.fillRect(0, 0, 2048, 512);

  const planks = 5;
  const plankHeight = 512 / planks;
  for (let p = 0; p < planks; p++) {
    const top = p * plankHeight;
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '150,130,105'},${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(0, top, 2048, plankHeight);

    for (let g = 0; g < 90; g++) {
      const y = top + Math.random() * plankHeight;
      ctx.strokeStyle = Math.random() < 0.6 ? 'rgba(20,14,8,0.4)' : 'rgba(170,150,125,0.22)';
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 2048; x += 64) {
        ctx.lineTo(x, y + Math.sin(x * 0.008 + g * 1.7) * 4 + (Math.random() - 0.5) * 2);
      }
      ctx.stroke();
    }
    for (let k = 0; k < 2; k++) {
      const x = Math.random() * 2048;
      const y = top + plankHeight * (0.25 + Math.random() * 0.5);
      ctx.strokeStyle = 'rgba(15,10,6,0.55)';
      for (let r = 4; r < 20; r += 4) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#0d0905';
    ctx.fillRect(0, top, 2048, 5);
  }

  for (let i = 0; i < 24; i++) {
    const x = Math.random() * 2048;
    const y = Math.random() * 512;
    const radius = 40 + Math.random() * 140;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, 'rgba(15,10,6,0.4)');
    stain.addColorStop(0.8, 'rgba(15,10,6,0.12)');
    stain.addColorStop(1, 'rgba(15,10,6,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.strokeStyle = '#0a0705';
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * 2048;
    let y = Math.random() * 512;
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const heading = Math.random() * Math.PI * 2;
    for (let s = 0; s < 16; s++) {
      x += Math.cos(heading + (Math.random() - 0.5) * 1.2) * (16 + Math.random() * 34);
      y += Math.sin(heading + (Math.random() - 0.5) * 1.2) * (16 + Math.random() * 34);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 120; i++) {
    ctx.strokeStyle = `rgba(200,180,150,${Math.random() * 0.25})`;
    ctx.lineWidth = 1;
    const x = Math.random() * 2048;
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 140, y + (Math.random() - 0.5) * 40);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export interface Table {
  readonly group: THREE.Group;
  readonly flamePosition: THREE.Vector3;
}

export function buildTable(): Table {
  const group = new THREE.Group();

  const wood = weatheredWood();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_HALF_WIDTH * 2, 0.5, TABLE_HALF_DEPTH * 2),
    new THREE.MeshStandardMaterial({ map: wood, bumpMap: wood, bumpScale: 2, roughness: 0.92 }),
  );
  top.position.y = TABLE_TOP - 0.25;
  top.receiveShadow = true;
  top.castShadow = true;
  group.add(top);

  // A solid body, so nothing behind the table shows through beneath the top.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_HALF_WIDTH * 2 - 1, BODY_DEPTH, TABLE_HALF_DEPTH * 2 - 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1a120d, roughness: 1 }),
  );
  body.position.y = TABLE_TOP - 0.5 - BODY_DEPTH / 2;
  group.add(body);

  const brass = new THREE.MeshStandardMaterial({ color: 0x9a7b3a, roughness: 0.45, metalness: 0.5 });
  const wax = new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 0.8 });
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
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 10), new THREE.MeshBasicMaterial({ color: 0xffd36a, fog: false }));
  flame.position.y = 1.87;
  for (const part of [dish, stem, cup, stick]) part.castShadow = true;
  candle.add(dish, stem, cup, stick, flame);
  group.add(candle);
  const flamePosition = new THREE.Vector3(-6.4, 2.0, -2.5);

  const staves = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.6, metalness: 0.4 });
  const tankard = new THREE.Group();
  tankard.position.set(-4.7, TABLE_TOP, -2.5);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 1.05, 18), staves);
  mug.position.y = 0.525;
  mug.castShadow = true;
  tankard.add(mug);
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

  const leather = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.95 });
  const purse = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), leather);
  purse.scale.set(1, 0.8, 1);
  purse.position.set(6.4, 0.5, 2.3);
  purse.castShadow = true;
  group.add(purse);
  const gold = new THREE.MeshStandardMaterial({ color: 0xb08d3a, roughness: 0.4, metalness: 0.5 });
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

  return { group, flamePosition };
}
