import * as THREE from 'three';

const FLOOR_Y = -4;

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')!];
}

function repeating(canvas: HTMLCanvasElement, x: number, y: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y);
  return texture;
}

function floorBoards(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#332820';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8; i++) {
    const y = (i * 512) / 8;
    ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.2})`;
    ctx.fillRect(0, y, 512, 64);
    ctx.fillStyle = '#0b0705';
    ctx.fillRect(0, y, 512, 4);
    for (let g = 0; g < 10; g++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      const gy = y + 6 + Math.random() * 52;
      ctx.moveTo(0, gy);
      ctx.lineTo(512, gy + (Math.random() - 0.5) * 6);
      ctx.stroke();
    }
    const joint = Math.random() * 512;
    ctx.fillRect(joint, y, 3, 64);
  }
  return repeating(canvas, 6, 6);
}

function stoneBlocks(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#12100e';
  ctx.fillRect(0, 0, 512, 512);
  const tones = ['#4a453e', '#3e3a34', '#544e46', '#453f38'];
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : 60;
    for (let x = -offset; x < 512; x += 128) {
      ctx.fillStyle = tones[Math.floor(Math.random() * tones.length)];
      ctx.fillRect(x + 3, row * 64 + 3, 122, 58);
    }
  }
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  return repeating(canvas, 5, 2);
}

const wood = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });

function barrel(x: number, z: number, height = 2.6): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, FLOOR_Y + height / 2, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.0, height, 18), wood(0x4a3320));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1e1b19, roughness: 0.6, metalness: 0.4 });
  for (const y of [-height * 0.32, height * 0.32]) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.1, 18), iron);
    hoop.position.y = y;
    group.add(hoop);
  }
  return group;
}

export function buildRoom(flamePosition: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: floorBoards(), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, -8);
  floor.receiveShadow = true;
  group.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), new THREE.MeshStandardMaterial({ map: stoneBlocks(), roughness: 1 }));
  wall.position.set(0, FLOOR_Y + 9, -15);
  group.add(wall);

  group.add(barrel(-9.5, -9), barrel(-11.6, -6.5, 2.2), barrel(10.5, -10, 3));

  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 14), wood(0x5a3e26));
  seat.position.set(-4.2, FLOOR_Y + 2.1, -8);
  seat.castShadow = true;
  group.add(seat);
  for (const [dx, dz] of [[-0.5, -0.4], [0.5, -0.4], [0, 0.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.1, 8), wood(0x3d2a1a));
    leg.position.set(-4.2 + dx, FLOOR_Y + 1.05, -8 + dz);
    group.add(leg);
  }

  const lantern = new THREE.SpotLight(0xfff0dc, 420, 0, 0.8, 0.7, 2);
  lantern.position.set(-1.5, 11, 1.5);
  lantern.target.position.set(0, 0, 0);
  lantern.castShadow = true;
  lantern.shadow.mapSize.set(2048, 2048);
  lantern.shadow.camera.near = 4;
  lantern.shadow.camera.far = 26;
  lantern.shadow.bias = -0.0004;
  group.add(lantern, lantern.target);

  const candle = new THREE.PointLight(0xffa860, 22, 13, 1.6);
  candle.position.copy(flamePosition);
  group.add(candle);

  return group;
}
