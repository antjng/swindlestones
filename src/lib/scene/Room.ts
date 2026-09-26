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
  return repeating(canvas, 6, 10);
}

function stoneBlocks(repeatX: number, repeatY: number): THREE.CanvasTexture {
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
  return repeating(canvas, repeatX, repeatY);
}

const wood = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });

/**
 * Everything in the hall is sized against the main table, which stands 4 units
 * off the floor: a person is about 8.5 units tall, so furniture and people
 * scale up from the basic shapes below by roughly this much.
 */
const HALL_SCALE = 2.5;

function barrel(x: number, z: number, height = 2.6): THREE.Group {
  const k = 1.9;
  height *= k;
  const group = new THREE.Group();
  group.position.set(x, FLOOR_Y + height / 2, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15 * k, 1.0 * k, height, 18), wood(0x4a3320));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1e1b19, roughness: 0.6, metalness: 0.4 });
  for (const y of [-height * 0.32, height * 0.32]) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(1.17 * k, 1.17 * k, 0.1 * k, 18), iron);
    hoop.position.y = y;
    group.add(hoop);
  }
  return group;
}

/** Where the hanging lantern sits, shared with SceneManager so it can place the real, shadow-casting light there. */
export const LANTERN_POSITION = new THREE.Vector3(-1.5, 11, 1.5);
export const LANTERN_TARGET = new THREE.Vector3(0, 0, 0);

type Update = (time: number) => void;
type Activity = 'drink' | 'gamble' | 'chat' | 'wipe';

export interface Room {
  readonly group: THREE.Group;
  /** Advances everyone in the hall: drinking, gambling, walking, flickering candles. */
  update(timeSeconds: number): void;
}

const CLOAK_COLORS = ['#5a4030', '#3d5560', '#6a3a4c', '#4a5a38', '#66542f', '#3f4252'];
const SKIN_TONES = ['#b89670', '#a37f5c', '#c4a382', '#8f6d4d'];

/** 0 to 1 and back over the [start, end] slice of a repeating 0-1 cycle, else 0. */
function pulse(phase: number, start: number, end: number): number {
  if (phase < start || phase > end) return 0;
  return Math.sin(((phase - start) / (end - start)) * Math.PI);
}

/** A limb hanging down from a pivot at its top, so rotating the pivot swings it. */
function limb(length: number, radius: number, material: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.8, length, 8), material);
  mesh.position.y = -length / 2;
  pivot.add(mesh);
  return pivot;
}

interface PersonOptions {
  seated: boolean;
  seed: number;
  activity: Activity;
  x: number;
  z: number;
  /** Which way they face, as a rotation about the vertical (0 faces +z, toward the camera). */
  facing: number;
}

interface Person {
  readonly group: THREE.Group;
  update(time: number, moving?: boolean): void;
}

/**
 * A crude figure with a swinging pair of arms (one holding a mug), a nodding
 * head and, standing, legs that walk. It is only ever seen blurred and dim, so
 * it is all cylinders and spheres; the animation carries the life.
 */
function person({ seated, seed, activity, x, z, facing }: PersonOptions): Person {
  const group = new THREE.Group();
  group.position.set(x, FLOOR_Y, z);
  group.rotation.y = facing;

  const cloakColor = CLOAK_COLORS[Math.floor(seed * 97) % CLOAK_COLORS.length];
  const cloak = new THREE.MeshStandardMaterial({ color: cloakColor, emissive: cloakColor, emissiveIntensity: 0.09, roughness: 1 });
  const skinColor = SKIN_TONES[Math.floor(seed * 53) % SKIN_TONES.length];
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, emissive: skinColor, emissiveIntensity: 0.1, roughness: 1 });

  const hipY = seated ? 0.85 : 1.35;
  const body = new THREE.Group();
  body.position.y = hipY;
  group.add(body);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 1.5, 10), cloak);
  torso.position.y = 0.75;
  torso.scale.z = 0.8;
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 1.6, 0.04);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skin);
  skull.position.y = 0.26;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), cloak);
  hood.position.set(0, 0.3, -0.03);
  head.add(skull, hood);
  body.add(head);

  const leftArm = limb(0.95, 0.11, cloak);
  const rightArm = limb(0.95, 0.11, cloak);
  leftArm.position.set(-0.47, 1.4, 0);
  rightArm.position.set(0.47, 1.4, 0);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.26, 8), new THREE.MeshStandardMaterial({ color: '#8b6b3a', emissive: '#3a2810', roughness: 0.8 }));
  mug.position.set(0, -1.0, 0.08);
  rightArm.add(mug);
  body.add(leftArm, rightArm);

  const legs: THREE.Group[] = [];
  if (seated) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 10), wood(0x4a3320));
    stool.position.y = 0.75;
    group.add(stool);
    for (const a of [0.6, 2.6, 4.6]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), wood(0x3d2a1a));
      leg.position.set(Math.cos(a) * 0.26, 0.38, Math.sin(a) * 0.26);
      group.add(leg);
    }
  } else {
    for (const side of [-1, 1]) {
      const leg = limb(hipY, 0.13, cloak);
      leg.position.set(side * 0.2, hipY, 0);
      group.add(leg);
      legs.push(leg);
    }
  }

  const offset = seed * 100;
  return {
    group,
    update(time, moving = false) {
      const t = time + offset;
      const phase = (t * 0.11) % 1;
      body.position.y = hipY + Math.sin(t * 1.7) * 0.015 + (moving ? Math.abs(Math.sin(t * 7)) * 0.06 : 0);
      body.rotation.z = Math.sin(t * 1.1) * 0.025;
      head.rotation.set(0, 0, 0);
      leftArm.rotation.set(-0.2, 0, 0.08);
      rightArm.rotation.set(-0.2, 0, -0.08);

      if (moving) {
        const swing = Math.sin(t * 7);
        legs[0].rotation.x = swing * 0.55;
        legs[1].rotation.x = -swing * 0.55;
        leftArm.rotation.x = -swing * 0.4;
        rightArm.rotation.x = -0.9;
        return;
      }
      for (const leg of legs) leg.rotation.x = 0;

      const cheer = pulse((t * 0.07) % 1, 0.55, 0.62);
      switch (activity) {
        case 'drink': {
          const raise = pulse(phase, 0.1, 0.38);
          rightArm.rotation.x = -0.5 - raise * 1.55;
          head.rotation.x = -raise * 0.3;
          leftArm.rotation.x = -0.7;
          break;
        }
        case 'gamble': {
          // Rattle the dice, then let them go with a bounce of the whole body.
          const shake = pulse(phase, 0.08, 0.34);
          rightArm.rotation.x = -0.95 + Math.sin(t * 17) * 0.28 * shake - shake * 0.5;
          leftArm.rotation.x = -0.8;
          head.rotation.x = 0.28;
          if (cheer > 0) {
            leftArm.rotation.x = -2.7 * cheer - 0.7 * (1 - cheer);
            rightArm.rotation.x = -2.7 * cheer - 0.9 * (1 - cheer);
            body.position.y += cheer * 0.1;
            head.rotation.x = -0.2 * cheer;
          }
          break;
        }
        case 'chat': {
          head.rotation.y = Math.sin(t * 0.6) * 0.5;
          const talk = 0.5 + 0.5 * Math.sin(t * 0.45);
          rightArm.rotation.x = -0.75 + Math.sin(t * 2.5) * 0.5 * talk;
          rightArm.rotation.z = -0.15 - talk * 0.2;
          leftArm.rotation.x = -0.35;
          const sip = pulse(phase, 0.7, 0.85);
          rightArm.rotation.x -= sip * 1.2;
          break;
        }
        case 'wipe': {
          rightArm.rotation.x = -1.15;
          rightArm.rotation.z = Math.sin(t * 3.2) * 0.45 - 0.1;
          leftArm.rotation.x = -0.95;
          head.rotation.x = 0.2 + Math.sin(t * 0.7) * 0.1;
          head.rotation.y = Math.sin(t * 0.3) * 0.4;
          break;
        }
      }
    },
  };
}

/** Someone who paces between two points, stopping at each end for a moment of conversation. */
function walker(seed: number, z: number, x0: number, x1: number, speed: number, pause: number): { person: Person; update: Update } {
  const walking = person({ seated: false, seed, activity: 'chat', x: x0, z, facing: 0 });
  walking.group.scale.setScalar(HALL_SCALE);
  const length = Math.abs(x1 - x0);
  const duration = length / speed;
  const cycle = 2 * (duration + pause);
  const offset = seed * cycle;
  const direction = Math.sign(x1 - x0);

  return {
    person: walking,
    update(time) {
      const u = (time + offset) % cycle;
      let x: number;
      let heading: number;
      let moving = true;
      if (u < duration) {
        x = x0 + (x1 - x0) * (u / duration);
        heading = direction;
      } else if (u < duration + pause) {
        x = x1;
        heading = direction;
        moving = false;
      } else if (u < 2 * duration + pause) {
        x = x1 + (x0 - x1) * ((u - duration - pause) / duration);
        heading = -direction;
      } else {
        x = x0;
        heading = -direction;
        moving = false;
      }
      walking.group.position.x = x;
      const target = moving ? heading * (Math.PI / 2) : heading * (Math.PI / 5);
      walking.group.rotation.y += (target - walking.group.rotation.y) * 0.08;
      walking.update(time, moving);
    },
  };
}

/** A small round table lost in the back of the room, with a few patrons at their own business and a flickering candle. */
function diningTable(x: number, z: number, seed: number, activities: readonly Activity[]): { group: THREE.Group; update: Update } {
  const group = new THREE.Group();
  group.position.set(x, FLOOR_Y * (1 - HALL_SCALE), z);
  group.scale.setScalar(HALL_SCALE);

  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.12, 16), wood(0x3d2a1a));
  top.position.y = FLOOR_Y + 1.5;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.5, 10), wood(0x2c1f14));
  post.position.y = FLOOR_Y + 0.75;
  group.add(top, post);

  // A few dice and a tankard on the table, so it reads as a game in progress.
  const dieMaterial = new THREE.MeshStandardMaterial({ color: '#e8dfc4', emissive: '#4a4030', roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const die = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), dieMaterial);
    die.position.set(0.25 + i * 0.22, FLOOR_Y + 1.64, 0.1 - i * 0.12);
    die.rotation.y = i * 0.9;
    group.add(die);
  }

  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), new THREE.MeshBasicMaterial({ color: 0xffb060, fog: false }));
  flame.position.set(-0.4, FLOOR_Y + 1.74, -0.2);
  group.add(flame);
  const glow = new THREE.PointLight(0xff9a4a, 60, 26, 1.8);
  glow.position.set(-0.4, FLOOR_Y + 1.8, -0.2);
  group.add(glow);

  const people: Person[] = activities.map((activity, i) => {
    const angle = (i / activities.length) * Math.PI * 2 + seed * 3;
    const seatX = Math.cos(angle) * 1.75;
    const seatZ = Math.sin(angle) * 1.75;
    const seat = person({ seated: true, seed: (seed + i * 0.37) % 1, activity, x: seatX, z: seatZ, facing: Math.atan2(-seatX, -seatZ) });
    group.add(seat.group);
    return seat;
  });

  return {
    group,
    update(time) {
      glow.intensity = 60 * (1 + Math.sin(time * 11 + seed * 20) * 0.07 + Math.sin(time * 27 + seed) * 0.05);
      flame.scale.y = 1 + Math.sin(time * 13 + seed * 20) * 0.18;
      for (const seat of people) seat.update(time);
    },
  };
}

/** The bar along the back wall: a long counter, a shelf of bottles, a keeper wiping down, and customers leaning on it. */
function barCounter(): { group: THREE.Group; update: Update } {
  const group = new THREE.Group();
  group.position.set(2.5, FLOOR_Y * (1 - HALL_SCALE), -46.5);
  group.scale.setScalar(HALL_SCALE);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(9, 1.4, 1), wood(0x3d2a1a));
  counter.position.y = FLOOR_Y + 0.7;
  const top = new THREE.Mesh(new THREE.BoxGeometry(9.3, 0.12, 1.2), wood(0x5a3e26));
  top.position.y = FLOOR_Y + 1.42;
  group.add(counter, top);

  const shelf = wood(0x2c1f14);
  const bottleMaterial = new THREE.MeshStandardMaterial({ color: '#2f4a34', emissive: '#12200f', roughness: 0.3, metalness: 0.1 });
  for (let s = 0; s < 2; s++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 0.35), shelf);
    board.position.set(0, FLOOR_Y + 2.4 + s * 0.9, -0.35);
    group.add(board);
    for (let i = 0; i < 10; i++) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 8), bottleMaterial);
      bottle.position.set(-3.8 + i * 0.85 + (s % 2) * 0.3, FLOOR_Y + 2.65 + s * 0.9, -0.35);
      group.add(bottle);
    }
  }

  const keeper = person({ seated: false, seed: 0.5, activity: 'wipe', x: -1, z: -0.9, facing: 0 });
  group.add(keeper.group);

  // Customers leaning on the front of the counter, facing it.
  const customers = [
    person({ seated: false, seed: 0.21, activity: 'drink', x: -2.6, z: 1.3, facing: Math.PI }),
    person({ seated: false, seed: 0.63, activity: 'chat', x: 0.4, z: 1.3, facing: Math.PI * 0.9 }),
    person({ seated: false, seed: 0.87, activity: 'drink', x: 3.1, z: 1.3, facing: Math.PI * 1.1 }),
  ];
  for (const customer of customers) group.add(customer.group);

  const lamp = new THREE.PointLight(0xffa860, 75, 28, 1.8);
  lamp.position.set(0, FLOOR_Y + 6.6, 0.6);
  group.add(lamp);

  return {
    group,
    update(time) {
      lamp.intensity = 75 * (1 + Math.sin(time * 9) * 0.05 + Math.sin(time * 21) * 0.04);
      keeper.update(time);
      for (const customer of customers) customer.update(time);
    },
  };
}

/** A roof beam disappearing into the dark, to give the ceiling some depth. */
function rafter(x: number): THREE.Group {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 60), wood(0x241a12));
  beam.position.set(x, FLOOR_Y + 17, -22);
  group.add(beam);
  return group;
}

/** The hall behind the table: floor, walls, and a crowd going about its evening. Lit only by its own dim fixtures. */
export function buildRoom(): Room {
  const group = new THREE.Group();
  const updaters: Update[] = [];

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 80), new THREE.MeshStandardMaterial({ map: floorBoards(), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, -20);
  floor.receiveShadow = true;
  group.add(floor);

  // Stone blocks about half a metre across (2.7 units), like the ones in a real hall.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(110, 26), new THREE.MeshStandardMaterial({ map: stoneBlocks(110 / 10.8, 26 / 10.8), roughness: 1 }));
  wall.position.set(0, FLOOR_Y + 13, -50);
  group.add(wall);
  const sideWallMaterial = new THREE.MeshStandardMaterial({ map: stoneBlocks(80 / 10.8, 26 / 10.8), roughness: 1 });
  for (const side of [-1, 1]) {
    const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(80, 26), sideWallMaterial);
    sideWall.rotation.y = -side * Math.PI / 2;
    sideWall.position.set(side * 34, FLOOR_Y + 13, -20);
    group.add(sideWall);
  }

  group.add(barrel(-16, -12), barrel(-19.5, -10.5, 2.2), barrel(17, -13, 3));
  group.add(rafter(-14), rafter(14));

  const tables = [
    diningTable(-13, -26, 0.05, ['gamble', 'gamble', 'drink', 'chat']),
    diningTable(13, -28, 0.7, ['drink', 'chat', 'gamble']),
    diningTable(-1, -34, 0.3, ['chat', 'drink', 'gamble']),
    diningTable(-27, -35, 0.55, ['gamble', 'gamble', 'drink']),
    diningTable(27, -37, 0.8, ['drink', 'chat']),
  ];
  const bar = barCounter();
  for (const item of [...tables, bar]) {
    group.add(item.group);
    updaters.push(item.update);
  }

  // People moving between the tables, the bar and the door, mugs in hand.
  const walkers = [
    walker(0.12, -20, -6, 6, 2.2, 3),
    walker(0.44, -24, -5, 5, 2.0, 4),
    walker(0.71, -40, 7, 22, 2.4, 2.5),
    walker(0.9, -20, -30, -21, 2.1, 3.5),
  ];
  for (const w of walkers) {
    group.add(w.person.group);
    updaters.push(w.update);
  }

  // A dim, shadowless echo of the lantern (the bright, shadow-casting one lives
  // in the foreground scene) so the floor and walls near the table aren't lit
  // by fixtures alone.
  const lanternFill = new THREE.PointLight(0xffb070, 40, 40, 1.6);
  lanternFill.position.copy(LANTERN_POSITION);
  group.add(lanternFill);
  updaters.push((time) => {
    lanternFill.intensity = 40 * (1 + Math.sin(time * 5) * 0.03 + Math.sin(time * 13) * 0.02);
  });

  return {
    group,
    update(time) {
      for (const update of updaters) update(time);
    },
  };
}
