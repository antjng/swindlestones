import * as THREE from 'three';
import { FINGER_X, KNUCKLE_Y, PALM_PX, PALM_WRIST, SEGMENT_ANCHOR, SEGMENT_LENGTHS, SEGMENT_WIDTH, drawPalm, drawSegment } from './handArt';
import { Spring } from './spring';

export const HAND_UNIT = 0.0165;

export interface HandPose {
  /** How far each finger (index to little) is curled, 0 straight to 1 fist. */
  readonly flex: readonly [number, number, number, number];
  readonly spread: number;
  /** 0 thumb out to the side, 1 tucked across the palm. */
  readonly thumb: number;
}

export const HAND_POSES = {
  flat: { flex: [0.04, 0.04, 0.04, 0.05], spread: 0.35, thumb: 0.2 },
  relaxed: { flex: [0.3, 0.36, 0.42, 0.5], spread: 0.55, thumb: 0.45 },
  cover: { flex: [0.1, 0.06, 0.08, 0.14], spread: 0.1, thumb: 0.15 },
  press: { flex: [0, 0, 0, 0], spread: 0.9, thumb: 0 },
  fist: { flex: [0.95, 0.98, 1, 1], spread: 0, thumb: 0.9 },
  point: { flex: [0, 0.98, 1, 1], spread: 0, thumb: 0.85 },
  claw: { flex: [0.5, 0.55, 0.55, 0.6], spread: 0.9, thumb: 0.1 },
} as const satisfies Record<string, HandPose>;

export type HandPoseName = keyof typeof HAND_POSES;

const FINGER_LENGTH = [0.95, 1, 0.92, 0.74] as const;
const FINGER_WIDTH = [1.02, 1.06, 1.0, 0.86] as const;
const CURL = [1.3, 1.55, 1.15] as const;

let textures: { palm: THREE.CanvasTexture; segments: THREE.CanvasTexture[] } | null = null;

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function getTextures() {
  textures ??= { palm: makeTexture(drawPalm()), segments: ([0, 1, 2] as const).map((k) => makeTexture(drawSegment(k))) };
  return textures;
}

/** A plane whose (anchorX, anchorY) point, in drawing units from the top left, sits at the origin. */
function anchoredPlane(width: number, height: number, anchorX: number, anchorY: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width * HAND_UNIT, height * HAND_UNIT);
  geometry.translate((width / 2 - anchorX) * HAND_UNIT, (anchorY - height / 2) * HAND_UNIT, 0);
  return geometry;
}

function material(texture: THREE.Texture, tint: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, color: tint, side: THREE.DoubleSide });
}

interface Finger {
  readonly group: THREE.Group;
  readonly bones: THREE.Mesh[];
  readonly flex: Spring;
}

/** Articulated cut-out hand hanging from the wrist at the origin, fingers pointing down. Curling is faked by foreshortening each bone. */
export class HandRig {
  readonly group = new THREE.Group();

  private readonly fingers: Finger[] = [];
  private readonly thumb: { group: THREE.Group; bones: THREE.Mesh[] };
  private readonly spread = new Spring(0.3);
  private readonly thumbTuck = new Spring(0.2);
  private pose: HandPose = HAND_POSES.relaxed;
  private drum = { speed: 0, amount: 0 };
  private readonly tint: number;

  constructor(mirrored = false, tint = 0xf0e6d2) {
    this.tint = tint;
    const { palm, segments } = getTextures();
    this.group.scale.x = mirrored ? -1 : 1;

    const palmMesh = new THREE.Mesh(anchoredPlane(PALM_PX.width, PALM_PX.height, PALM_WRIST.x, PALM_WRIST.y), material(palm, tint));
    this.group.add(palmMesh);

    const segmentGeometries = ([0, 1, 2] as const).map((k) =>
      anchoredPlane(SEGMENT_WIDTH, SEGMENT_LENGTHS[k] + 20, SEGMENT_ANCHOR.x, SEGMENT_ANCHOR.y),
    );

    FINGER_X.forEach((x, i) => {
      const group = new THREE.Group();
      group.position.set((x - PALM_WRIST.x) * HAND_UNIT, -(KNUCKLE_Y - PALM_WRIST.y) * HAND_UNIT, 0.004 + i * 0.0004);
      const bones = ([0, 1, 2] as const).map((k) => {
        const bone = new THREE.Mesh(segmentGeometries[k], material(segments[k], tint));
        bone.position.z = -k * 0.0008;
        group.add(bone);
        return bone;
      });
      this.group.add(group);
      this.fingers.push({ group, bones, flex: new Spring(0.2, 150, 13) });
    });

    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(-58 * HAND_UNIT, -84 * HAND_UNIT, 0.007);
    const thumbBones = ([1, 2] as const).map((k) => {
      const bone = new THREE.Mesh(segmentGeometries[k], material(segments[k], tint));
      thumbGroup.add(bone);
      return bone;
    });
    this.group.add(thumbGroup);
    this.thumb = { group: thumbGroup, bones: thumbBones };

    this.setPose(HAND_POSES.relaxed, true);
  }

  setPose(pose: HandPose | HandPoseName, immediately = false): void {
    this.pose = typeof pose === 'string' ? HAND_POSES[pose] : pose;
    if (immediately) {
      this.fingers.forEach((finger, i) => finger.flex.snapTo(this.pose.flex[i]));
      this.spread.snapTo(this.pose.spread);
      this.thumbTuck.snapTo(this.pose.thumb);
      this.applyPose(0);
    }
  }

  setDrumming(speed: number, amount = 0.5): void {
    this.drum = { speed, amount: speed > 0 ? amount : 0 };
  }

  update(deltaSeconds: number, timeSeconds: number): void {
    this.applyPose(deltaSeconds, timeSeconds);
  }

  private applyPose(dt: number, time = 0): void {
    const spread = dt === 0 ? this.spread.value : this.spread.update(dt, this.pose.spread);
    const tuck = dt === 0 ? this.thumbTuck.value : this.thumbTuck.update(dt, this.pose.thumb);

    this.fingers.forEach((finger, i) => {
      const tap = this.drum.speed > 0 ? Math.max(0, Math.sin(time * this.drum.speed + i * 1.3)) ** 2 * this.drum.amount : 0;
      const flex = dt === 0 ? finger.flex.value : finger.flex.update(dt, this.pose.flex[i] + tap);
      const lift = THREE.MathUtils.clamp(flex, -0.15, 1.05);

      finger.group.rotation.z = (i - 1.5) * spread * 0.16;

      // each bone is foreshortened by how far the finger has curled by that joint
      let curl = 0;
      let y = 0;
      finger.bones.forEach((bone, k) => {
        curl += lift * CURL[k];
        const shorten = THREE.MathUtils.clamp(Math.cos(curl), 0.2, 1);
        bone.position.y = y;
        bone.scale.set(FINGER_WIDTH[i] * (1 + (1 - shorten) * 0.25), shorten * FINGER_LENGTH[i], 1);
        (bone.material as THREE.MeshBasicMaterial).color.setHex(this.tint).multiplyScalar(1 - (1 - shorten) * 0.32);
        y -= SEGMENT_LENGTHS[k] * FINGER_LENGTH[i] * shorten * HAND_UNIT;
      });
    });

    this.thumb.group.rotation.z = -1.05 + tuck * 0.85;
    const shorten = 1 - tuck * 0.3;
    let y = 0;
    this.thumb.bones.forEach((bone, k) => {
      bone.position.y = y;
      bone.scale.set(1.2, shorten * (k === 0 ? 0.9 : 0.85), 1);
      y -= SEGMENT_LENGTHS[k + 1] * bone.scale.y * HAND_UNIT;
    });
  }
}

export const HAND_SIZE = {
  palmWidth: PALM_PX.width * HAND_UNIT,
  palmLength: (KNUCKLE_Y - PALM_WRIST.y) * HAND_UNIT,
  fingerLength: (SEGMENT_LENGTHS[0] + SEGMENT_LENGTHS[1] + SEGMENT_LENGTHS[2]) * HAND_UNIT,
};

