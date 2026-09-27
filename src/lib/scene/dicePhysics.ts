import * as THREE from 'three';

/** A solid thing standing on the table that a die can knock into: a round footprint and a height. */
export interface Obstacle {
  object: THREE.Object3D;
  x: number;
  z: number;
  r: number;
  h: number;
}

export interface BodyFrame {
  position: THREE.Vector3;
  orientation: THREE.Quaternion;
  scale: number;
}

export interface SimEvent {
  frame: number;
  kind: 'prop' | 'monk' | 'die';
  object: THREE.Object3D;
}

export interface Simulation {
  bodies: { object: THREE.Object3D; frames: BodyFrame[] }[];
  frameCount: number;
  events: SimEvent[];
}

interface Body {
  object: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  restY: number;
  base: THREE.Quaternion;
  flicked: boolean;
  active: boolean;
  angle: number;
  travel: number;
  heading: THREE.Vector3;
  /** How the die is turned now: it accumulates, so a die that has rolled stays rolled. */
  turn: THREE.Quaternion;
  /** Once it has stopped, it eases onto the nearest face it can rest on; these are the frames left of that, and where it started and ends. */
  settleLeft: number;
  settleFrom: THREE.Quaternion;
  settleTo: THREE.Quaternion;
  settling: boolean;
  frames: BodyFrame[];
}

const DT = 1 / 60;
const GRAVITY = 24;
const RADIUS = 0.5;
const FRICTION = 4.2;
const TABLE = { minX: -10, maxX: 10, minZ: -3.6, maxZ: 6.4 };

/**
 * A little rigid-body world for a flicked die and everything it can knock
 * into. The flicked die is thrown up and along `launch` in a high arc, lands,
 * bounces and skids; when it strikes another die the two swap momentum, and
 * the die that was hit slides off, hitting others in turn, so a chain of
 * collisions carries on until everything has stopped. Dice bounce off the props
 * on the table and off the monk himself, and the flicked die, if it leaves the
 * table, falls away.
 */
export function simulateFlick(
  flicked: THREE.Object3D,
  others: readonly THREE.Object3D[],
  props: readonly Obstacle[],
  launch: THREE.Vector3,
  monk: { object: THREE.Object3D; x: number; z: number },
): Simulation {
  const make = (object: THREE.Object3D, isFlicked: boolean): Body => ({
    object,
    position: object.position.clone(),
    velocity: new THREE.Vector3(),
    restY: object.position.y,
    base: object.quaternion.clone(),
    flicked: isFlicked,
    active: isFlicked,
    angle: 0,
    travel: 0,
    heading: new THREE.Vector3(1, 0, 0),
    turn: object.quaternion.clone(),
    settleLeft: 0,
    settleFrom: new THREE.Quaternion(),
    settleTo: new THREE.Quaternion(),
    settling: false,
    frames: [],
  });
  const main = make(flicked, true);
  const bodies = [main, ...others.filter((other) => other !== flicked).map((other) => make(other, false))];
  const events: SimEvent[] = [];

  // Throw the flicked die: up, and along the launch line at a speed that covers the table in a bounce or two.
  const throwUp = 7.2 + Math.random() * 2.6;
  const toEdgeZ = launch.z > 0.01 ? (TABLE.maxZ - main.position.z) / launch.z : launch.z < -0.01 ? (TABLE.minZ - main.position.z) / launch.z : Infinity;
  const toEdgeX = launch.x > 0.01 ? (TABLE.maxX - main.position.x) / launch.x : launch.x < -0.01 ? (TABLE.minX - main.position.x) / launch.x : Infinity;
  const path = Math.min(toEdgeZ, toEdgeX);
  const airtime = (2 * throwUp) / GRAVITY;
  const speed = path / (airtime * (0.45 + Math.random() * 0.3));
  main.velocity.set(launch.x * speed, throwUp, launch.z * speed);
  const restitution = 0.34 + Math.random() * 0.18;
  const spinX = 0.5 + Math.random() * 0.9;
  const spinY = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 3);
  let stillFor = 0;
  let vanish = 0;

  const roll = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const rock = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();

  const overTable = (p: THREE.Vector3) => p.x > TABLE.minX && p.x < TABLE.maxX && p.z > TABLE.minZ && p.z < TABLE.maxZ;

  let frame = 0;
  for (; frame < 480; frame++) {
    for (const body of bodies) {
      if (!body.active) continue;
      const { position, velocity } = body;
      if (position.y < -8) continue;

      velocity.y -= GRAVITY * DT;
      position.addScaledVector(velocity, DT);
      if (body.flicked) body.angle += (velocity.z / 0.55) * DT * spinX;

      const onTable = overTable(position);
      if (onTable && position.y <= body.restY) {
        position.y = body.restY;
        if (velocity.y < 0) {
          velocity.y = -velocity.y * (body.flicked ? restitution : 0.2);
          // Small bounces die away into a skid.
          if (velocity.y < 1.4) velocity.y = 0;
          velocity.x *= 0.86;
          velocity.z *= 0.86;
        }
        if (velocity.y === 0) {
          // Skidding on the felt: friction slows it until it stops.
          const skid = Math.hypot(velocity.x, velocity.z);
          if (skid > 0) {
            const slowed = Math.max(0, skid - FRICTION * DT);
            velocity.x *= slowed / skid;
            velocity.z *= slowed / skid;
          }
        }
      }
      // Dice that were only knocked stay on the table: they bounce off its edges rather than falling.
      if (!body.flicked) {
        if (position.x < TABLE.minX + 0.6 || position.x > TABLE.maxX - 0.6) velocity.x *= -0.5;
        if (position.z < TABLE.minZ + 0.6 || position.z > TABLE.maxZ - 0.6) velocity.z *= -0.5;
        position.x = THREE.MathUtils.clamp(position.x, TABLE.minX + 0.6, TABLE.maxX - 0.6);
        position.z = THREE.MathUtils.clamp(position.z, TABLE.minZ + 0.6, TABLE.maxZ - 0.6);
      }

      if (onTable || !body.flicked) {
        for (const prop of props) {
          const dx = position.x - prop.x;
          const dz = position.z - prop.z;
          const gap = Math.hypot(dx, dz);
          const reach = prop.r + RADIUS;
          if (gap < reach && position.y < prop.h + RADIUS * 0.8) {
            const nx = dx / (gap || 1);
            const nz = dz / (gap || 1);
            position.x = prop.x + nx * reach;
            position.z = prop.z + nz * reach;
            const along = velocity.x * nx + velocity.z * nz;
            if (along < 0) {
              velocity.x -= 1.55 * along * nx;
              velocity.z -= 1.55 * along * nz;
              if (body.flicked) velocity.y = Math.max(velocity.y, 1.5 + Math.abs(along) * 0.35);
              events.push({ frame, kind: 'prop', object: prop.object });
            }
          }
        }
      }

      // The monk himself is a wall across the far side of the table.
      const bodyZ = monk.z + 0.5;
      if (velocity.z < 0 && position.z < bodyZ && position.z > monk.z - 1.2 && position.x > monk.x - 2.3 && position.x < monk.x + 2.4 && position.y < 5.5) {
        position.z = bodyZ;
        velocity.z = -velocity.z * 0.55;
        velocity.x = velocity.x * 0.7 + (Math.random() - 0.5) * 1.5;
        if (body.flicked) velocity.y = Math.max(velocity.y, 2.8);
        events.push({ frame, kind: 'monk', object: monk.object });
      }
    }

    // Dice knock into each other: equal weights swap their speed along the line between them, and the one that was hit starts to slide.
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (!a.active && !b.active) continue;
        if (Math.abs(a.position.y - b.position.y) > 0.85) continue;
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const gap = Math.hypot(dx, dz);
        const reach = RADIUS * 2.1;
        if (gap >= reach) continue;
        const nx = dx / (gap || 1);
        const nz = dz / (gap || 1);
        const approach = (a.velocity.x - b.velocity.x) * nx + (a.velocity.z - b.velocity.z) * nz;
        // Push them apart, even if they were already touching.
        const overlap = (reach - gap) / 2;
        if (a.active && b.active) {
          a.position.x += nx * overlap;
          a.position.z += nz * overlap;
          b.position.x -= nx * overlap;
          b.position.z -= nz * overlap;
        } else if (a.active) {
          a.position.x += nx * overlap * 2;
          a.position.z += nz * overlap * 2;
        } else {
          b.position.x -= nx * overlap * 2;
          b.position.z -= nz * overlap * 2;
        }
        if (approach < 0) {
          const impulse = (-(1 + 0.55) * approach) / 2;
          a.velocity.x += nx * impulse;
          a.velocity.z += nz * impulse;
          b.velocity.x -= nx * impulse;
          b.velocity.z -= nz * impulse;
          const struck = a.active && !b.active ? b : b.active && !a.active ? a : null;
          if (struck) struck.active = true;
          a.active = true;
          b.active = true;
          events.push({ frame, kind: 'die', object: struck ? struck.object : b.object });
        }
      }
    }

    // Record where each die is, and how it is turned.
    for (const body of bodies) {
      const { position, velocity } = body;
      let orientation: THREE.Quaternion;
      let scale = 1;
      if (body.flicked) {
        roll.setFromAxisAngle(xAxis, body.angle);
        yaw.setFromAxisAngle(yAxis, frame * DT * spinY);
        orientation = body.base.clone().premultiply(yaw).premultiply(roll);
        // Once it has come to rest on the table it is left there a moment, then shrinks away.
        if (overTable(position) && position.y <= body.restY && Math.hypot(velocity.x, velocity.z) < 0.12) stillFor++;
        else stillFor = 0;
        if (stillFor > 36) vanish += 1 / 10;
        scale = Math.max(0, 1 - vanish);
      } else {
        // A knocked die rolls, without slipping, about the axis across its path: it turns as far as it travels, and stays turned
        // however it ends up, then eases down onto the nearest face so it isn't left standing on an edge.
        const slide = Math.hypot(velocity.x, velocity.z);
        if (body.active && slide > 0.05) {
          body.heading.set(velocity.x / slide, 0, velocity.z / slide);
          axis.set(body.heading.z, 0, -body.heading.x);
          rock.setFromAxisAngle(axis, (slide * DT) / 0.5);
          body.turn.premultiply(rock);
          body.settling = false;
          body.settleLeft = 0;
        } else if (body.active && position.y <= body.restY + 0.001 && !body.settling && body.frames.length > 0) {
          // Stopped: work out the face it comes to rest on.
          let lowest = Infinity;
          const down = new THREE.Vector3(0, -1, 0);
          let best = new THREE.Vector3();
          for (const sx of [1, -1]) {
            for (const sy of [1, -1]) {
              for (const sz of [1, -1]) {
                const n = new THREE.Vector3(sx, sy, sz).normalize().applyQuaternion(body.turn);
                if (n.y < lowest) {
                  lowest = n.y;
                  best = n;
                }
              }
            }
          }
          body.settleFrom.copy(body.turn);
          body.settleTo.copy(rock.setFromUnitVectors(best, down).multiply(body.turn));
          body.settleLeft = 14;
          body.settling = true;
        }
        if (body.settleLeft > 0) {
          const k = 1 - body.settleLeft / 14;
          body.turn.slerpQuaternions(body.settleFrom, body.settleTo, k * k * (3 - 2 * k));
          body.settleLeft--;
        }
        orientation = body.turn.clone();
      }
      body.frames.push({ position: position.clone(), orientation, scale });
    }

    // It is over once the flicked die is gone and everything that was knocked has stopped.
    const gone = main.position.y < -8 || vanish >= 1;
    const moving = bodies.some((body) => !body.flicked && body.active && (Math.hypot(body.velocity.x, body.velocity.z) > 0.05 || body.settleLeft > 0 || !body.settling));
    if (gone && !moving) {
      frame++;
      break;
    }
  }
  return { bodies: bodies.map((body) => ({ object: body.object, frames: body.frames })), frameCount: frame, events };
}
