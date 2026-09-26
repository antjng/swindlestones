import * as THREE from 'three';
import { FlatHand } from './Hands';
import type { HandPoseName } from './handPose';
import { logicalSize, pixelCanvas } from './pixel';
import { AI_DICE_CENTER, OPPONENT_X, OPPONENT_Z } from './layout';
import {
  BEARD_BOX,
  EYES_STRIP,
  HEAD_PX,
  MOUSTACHE_BOX,
  drawBeard,
  drawCowl,
  drawEyes,
  drawHead,
  drawMoustache,
  drawMouth,
  drawTorso,
} from './opponentArt';
import type { EyeState } from './opponentArt';
import { Spring } from './spring';

export type OpponentMood = 'idle' | 'thinking' | 'calling' | 'tense' | 'impatient' | 'fuming' | 'gloating' | 'enraged';

/** The cut-out leans back by this much so it faces the camera's downward view. */
const STAGE_TILT = -0.33;

/** Where the chin/jaw hinge sits, in head-canvas y. */
const HINGE_Y = 230;
/** Where the mouth sits, in head-canvas y. */
const MOUTH_Y = 234;

/** World units per drawing unit, shared by every part of the figure so its proportions hold. */
const UNIT = 0.0105;

/** Where the top of the habit, the top of the bunched cowl, and the base of the neck sit. */
const TORSO_TOP = 2.9;
const COWL_TOP = TORSO_TOP + 0.73;
const NECK_Y = TORSO_TOP - 0.35;

/** The head sprite is drawn large; this brings it to a believable size against the shoulders. */
const HEAD_SCALE = 0.68;

const SPRITE_TINT = 0xd8d0b8;

/** Sized against his head: a hand about as long as his face, not a shovel. */
const HAND_SCALE = 0.44;

interface Pose {
  lean: number;
  headPitch: number;
  headRoll: number;
  browRaise: number;
  /** Positive slopes the brows down toward the nose (stern), negative up (worried). */
  browTilt: number;
  browAsym: number;
  eyeOpen: number;
  /** 0 to 1: how red and fierce the glow of his eyes is. */
  rage: number;
  /** How far his jaw hangs open in a bared-teeth grin or snarl. */
  grin: number;
  /** Silent laughter: shaking shoulders and a working jaw. */
  laugh: number;
  /** A fine tremor through the whole head and body. */
  tremble: number;
}

type HandMode = 'rest' | 'drum' | 'chin' | 'point' | 'fist' | 'claw' | 'stroke' | 'steeple' | 'slam';

interface MoodSpec {
  pose: Pose;
  left: HandMode;
  right: HandMode;
  drumSpeed: number;
}

const BASE_POSE: Pose = { lean: 0.02, headPitch: 0.02, headRoll: 0, browRaise: 0, browTilt: 0.4, browAsym: 0, eyeOpen: 0.55, rage: 0, grin: 0, laugh: 0, tremble: 0 };
const pose = (overrides: Partial<Pose>): Pose => ({ ...BASE_POSE, ...overrides });

const MOODS: Record<OpponentMood, MoodSpec> = {
  idle: { pose: pose({}), left: 'drum', right: 'drum', drumSpeed: 2.2 },
  thinking: {
    pose: pose({ lean: 0.08, headPitch: 0.04, headRoll: 0.1, browRaise: 0.2, browTilt: 0.15, browAsym: 0.5, eyeOpen: 0.7 }),
    left: 'drum',
    right: 'chin',
    drumSpeed: 3.4,
  },
  calling: {
    pose: pose({ lean: 0.14, headPitch: 0.05, headRoll: -0.03, browRaise: -0.2, browTilt: 0.9, eyeOpen: 0.85 }),
    left: 'rest',
    right: 'point',
    drumSpeed: 0,
  },
  tense: {
    pose: pose({ lean: -0.04, headPitch: 0.02, headRoll: 0.03, browRaise: 0.7, browTilt: -0.5, eyeOpen: 1.2 }),
    left: 'drum',
    right: 'drum',
    drumSpeed: 8,
  },
  // Waiting on you, and tiring of it.
  impatient: {
    pose: pose({ lean: 0.06, headRoll: 0.09, browRaise: 0.1, browTilt: 0.55, eyeOpen: 0.62, rage: 0.08 }),
    left: 'drum',
    right: 'drum',
    drumSpeed: 4.2,
  },
  fuming: {
    // Simmering, not shaking: a heavy lean, a hard stare, one fist clenched and the other hand slowly rapping the table.
    pose: pose({ lean: 0.12, headPitch: 0.07, browTilt: 1, eyeOpen: 0.78, rage: 0.4 }),
    left: 'fist',
    right: 'drum',
    drumSpeed: 2.6,
  },
  // You lost a die: he savours it.
  gloating: {
    pose: pose({ lean: 0.15, headPitch: 0.14, headRoll: 0.06, browTilt: 0.9, eyeOpen: 0.42, rage: 0.15, grin: 0.5, laugh: 0.7 }),
    left: 'claw',
    right: 'claw',
    drumSpeed: 1.5,
  },
  // He lost a die: he slams the table.
  enraged: {
    pose: pose({ lean: 0.28, headPitch: 0.14, browTilt: 1.3, eyeOpen: 1.3, rage: 1, grin: 0.75, tremble: 0.015 }),
    left: 'slam',
    right: 'slam',
    drumSpeed: 0,
  },
};

/** Different ways he might turn a decision over: each changes his hands, his gaze, and a little of how he holds his head. */
const THINK_VARIANTS: readonly { left: HandMode; right: HandMode; drumSpeed: number; delta: Partial<Pose> }[] = [
  { left: 'drum', right: 'chin', drumSpeed: 3.4, delta: {} },
  { left: 'rest', right: 'stroke', drumSpeed: 0, delta: { headPitch: 0.1, eyeOpen: -0.2, browTilt: 0.3 } },
  { left: 'drum', right: 'drum', drumSpeed: 4.6, delta: { headRoll: 0.06, browAsym: 0.3 } },
  { left: 'steeple', right: 'steeple', drumSpeed: 0, delta: { lean: -0.05, eyeOpen: -0.15, browTilt: 0.5 } },
];

/** How each gesture holds the hand: which pose it takes and how it tilts (0 lies flat on the table, -1.25 stands on end). */
const HAND_LOOK: Record<HandMode, { pose: HandPoseName; tilt: number; yaw: number }> = {
  rest: { pose: 'flat', tilt: 0, yaw: 0 },
  drum: { pose: 'relaxed', tilt: 0, yaw: 0 },
  fist: { pose: 'fist', tilt: 0, yaw: 0 },
  claw: { pose: 'claw', tilt: 0, yaw: 0 },
  slam: { pose: 'fist', tilt: 0, yaw: 0 },
  chin: { pose: 'fist', tilt: -1.25, yaw: Math.PI },
  stroke: { pose: 'flat', tilt: -1.2, yaw: Math.PI },
  steeple: { pose: 'cover', tilt: -1.15, yaw: Math.PI },
  point: { pose: 'point', tilt: -0.28, yaw: 0 },
};

/** Smooth, never-repeating drift built from three unrelated sine waves, in [-1, 1]. Different `k` values give independent streams. */
const wander = (t: number, k: number) => Math.sin(t * 0.53 + k * 3.1) * 0.5 + Math.sin(t * 0.87 + k * 7.7) * 0.3 + Math.sin(t * 1.63 + k * 1.9) * 0.2;

interface Sprite {
  readonly group: THREE.Group;
  readonly texture: THREE.CanvasTexture;
}

/** A flat cut-out; `anchor` is the point of the picture (0-1, y up) placed at the group's origin. */
function createSprite(canvas: HTMLCanvasElement, unit: number, anchor: readonly [number, number] = [0.5, 0.5], tint = SPRITE_TINT): Sprite {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const { width: logicalWidth, height: logicalHeight } = logicalSize(canvas);
  const width = logicalWidth * unit;
  const height = logicalHeight * unit;
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate((0.5 - anchor[0]) * width, (0.5 - anchor[1]) * height, 0);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, color: tint })));
  return { group, texture };
}

/** One of his hands: a real 3D hand lying on the table (or raised), eased toward wherever the current gesture wants it. */
class MonkHand {
  readonly hand: FlatHand;
  readonly wrist = new THREE.Vector3();
  private readonly tilt = new Spring(0, 30, 9);
  private readonly yaw = new Spring(0, 30, 9);
  private initialised = false;

  constructor(mirrored: boolean, seed: number) {
    this.hand = new FlatHand(mirrored, seed);
    this.hand.setSize(HAND_SCALE);
    this.hand.setVisible(true);
  }

  moveTo(goal: THREE.Vector3, look: { pose: HandPoseName; tilt: number; yaw: number }, follow: number, dt: number, time: number): void {
    if (!this.initialised) {
      this.wrist.copy(goal);
      this.tilt.snapTo(look.tilt);
      this.yaw.snapTo(look.yaw);
      this.initialised = true;
    }
    this.wrist.lerp(goal, follow);
    this.hand.setPose(look.pose);
    this.hand.place(this.wrist, this.yaw.update(dt || 0.016, look.yaw), this.tilt.update(dt || 0.016, look.tilt));
    this.hand.update(dt, time);
  }
}

/**
 * The opponent: a layered cut-out puppet (torso, cowl, head, jaw and beard,
 * eyes, articulated hands). Springs give the beard, jaw and
 * shoulders follow-through.
 */
export class Opponent {
  readonly group = new THREE.Group();

  /** World-space hand targets that override the mood's hand poses. */
  readonly handOverride: { left: THREE.Vector3 | null; right: THREE.Vector3 | null } = { left: null, right: null };

  private readonly stage = new THREE.Group();
  private readonly torso: Sprite;
  private readonly cowl: Sprite;
  private readonly headPivot = new THREE.Group();
  private readonly face = new THREE.Group();
  private readonly jaw = new THREE.Group();
  private readonly mouth: Sprite;
  private readonly chin = new THREE.Object3D();
  private readonly eyesContext: CanvasRenderingContext2D;
  private readonly eyesTexture: THREE.CanvasTexture;
  // His right hand is on the left of the picture: its thumb points in, toward his body.
  private readonly hands = [new MonkHand(false, 101), new MonkHand(true, 102)] as const;
  private readonly eyesMaterial: THREE.MeshBasicMaterial;

  private coverActive = false;
  private clearOfDice = false;
  private mood: OpponentMood = 'idle';
  private moodStartedAt = 0;
  private time = 0;

  private nextBlinkAt = 2;
  private blinkUntil = 0;
  private nextFidgetAt = 4;
  private glance: { target: THREE.Vector3; until: number } | null = null;
  private speakUntil = 0;
  private restlessRoll = 0;
  private thinkVariant = 0;
  private saccade = { x: 0, y: 0, until: 0 };
  private pendingImpact = false;
  private slammed: [boolean, boolean] = [false, false];

  private readonly roll = new Spring(0, 34, 8);
  private readonly pitch = new Spring(0, 34, 8);
  private readonly leanSpring = new Spring(0, 22, 7);
  private readonly shrug = new Spring(0, 140, 8);
  private readonly beardSwing = new Spring(0, 70, 4.5);
  private readonly jawOpen = new Spring(0, 260, 22);
  private readonly turn = new Spring(0, 90, 12);
  private readonly gazeX = new Spring(0, 320, 26);
  private readonly gazeY = new Spring(0, 320, 26);
  private torsoSway = 0;

  private drawnEyes = '';
  private readonly pose: Pose = { ...MOODS.idle.pose };
  private readonly gaze = new THREE.Vector3(0, 3, 7);
  private readonly gazeGoal = new THREE.Vector3(0, 3, 7);

  constructor() {
    this.stage.position.set(OPPONENT_X, -0.6, OPPONENT_Z);
    this.stage.rotation.x = STAGE_TILT;
    this.stage.scale.setScalar(1.42);
    this.group.add(this.stage);

    this.torso = createSprite(drawTorso(23), UNIT, [0.5, 1]);
    this.cowl = createSprite(drawCowl(71), UNIT, [0.5, 1]);
    this.stage.add(this.torso.group, this.cowl.group);
    this.cowl.group.position.z = 0.02;


    this.headPivot.position.set(0, NECK_Y, 0.2);
    this.stage.add(this.headPivot);
    const head = createSprite(drawHead(11), UNIT, [0.5, 0]);
    this.headPivot.add(head.group, this.face);

    const headPoint = (x: number, y: number) => new THREE.Vector3((x - HEAD_PX.width / 2) * UNIT, (HEAD_PX.height - y) * UNIT, 0);

    this.mouth = createSprite(drawMouth(), UNIT);
    this.mouth.group.position.copy(headPoint(HEAD_PX.width / 2, MOUTH_Y)).setZ(0.01);
    this.mouth.group.scale.y = 0.001;
    this.face.add(this.mouth.group);

    const [eyesCanvas, eyesContext] = pixelCanvas(EYES_STRIP.width, EYES_STRIP.height);
    this.eyesContext = eyesContext;
    this.eyesTexture = new THREE.CanvasTexture(eyesCanvas);
    this.eyesTexture.colorSpace = THREE.SRGBColorSpace;
    this.eyesTexture.magFilter = THREE.NearestFilter;
    this.eyesTexture.minFilter = THREE.NearestFilter;
    this.eyesTexture.generateMipmaps = false;
    this.eyesMaterial = new THREE.MeshBasicMaterial({ map: this.eyesTexture, alphaTest: 0.5, color: 0xffffff });
    const eyes = new THREE.Mesh(new THREE.PlaneGeometry(EYES_STRIP.width * UNIT, EYES_STRIP.height * UNIT), this.eyesMaterial);
    eyes.position.copy(headPoint(HEAD_PX.width / 2, EYES_STRIP.top + EYES_STRIP.height / 2)).setZ(0.02);
    this.face.add(eyes);

    const moustache = createSprite(drawMoustache(31), UNIT);
    moustache.group.position.copy(headPoint(MOUSTACHE_BOX.x + MOUSTACHE_BOX.width / 2, MOUSTACHE_BOX.y + MOUSTACHE_BOX.height / 2)).setZ(0.03);
    this.face.add(moustache.group);

    const hinge = { x: HEAD_PX.width / 2, y: HINGE_Y };
    const beard = createSprite(drawBeard(43), UNIT, [(hinge.x - BEARD_BOX.x) / BEARD_BOX.width, 1 - (hinge.y - BEARD_BOX.y) / BEARD_BOX.height]);
    this.jaw.position.copy(headPoint(hinge.x, hinge.y)).setZ(0.035);
    this.jaw.add(beard.group);
    this.face.add(this.jaw);

    this.chin.position.copy(headPoint(HEAD_PX.width / 2, HINGE_Y + 24)).setZ(0.05);
    this.headPivot.add(this.chin);

    for (const hand of this.hands) this.group.add(hand.hand.group);

    this.stage.updateMatrixWorld(true);

    this.applyPose(0);
  }

  private toStage(world: THREE.Vector3): THREE.Vector3 {
    return this.stage.worldToLocal(world.clone());
  }

  setMood(mood: OpponentMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.moodStartedAt = this.time;
    this.slammed = [false, false];
    if (mood === 'thinking') this.thinkVariant = (this.thinkVariant + 1 + Math.floor(Math.random() * (THINK_VARIANTS.length - 1))) % THINK_VARIANTS.length;
  }

  /** True once, right after he slams the table, so the scene can shake. */
  takeImpact(): boolean {
    const hit = this.pendingImpact;
    this.pendingImpact = false;
    return hit;
  }

  /** Sends his left arm (on the right of the picture) out to guard his dice at `wrist`, hiding the puppet's own left hand, or back when null. */
  setCoverHand(wrist: THREE.Vector3 | null): void {
    this.handOverride.right = wrist;
    this.coverActive = wrist !== null;
  }

  /** Sends his right hand sliding out from behind his dice (true), or back to where it rests (false). */
  setClearOfDice(clear: boolean): void {
    this.clearOfDice = clear;
  }

  /** Where one of his puppet hands is now, so a hand that takes over from it can start exactly there. */
  handWrist(side: 0 | 1): THREE.Vector3 {
    return this.hands[side].wrist.clone();
  }

  /** Where that hand lies when it has nothing to do. */
  restPosition(side: 0 | 1): THREE.Vector3 {
    return this.handGoal(side, 'rest');
  }

  /** Gives the guarding hand back to the puppet, which takes it up from wherever the guard ended, so nothing jumps. */
  releaseCoverHand(at: THREE.Vector3): void {
    this.hands[1].wrist.copy(at);
    this.setCoverHand(null);
  }

  speak(seconds: number): void {
    this.speakUntil = Math.max(this.speakUntil, this.time + seconds);
  }

  glanceAt(target: THREE.Vector3, seconds: number): void {
    this.glance = { target: target.clone(), until: this.time + seconds };
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const blend = 1 - Math.exp(-deltaSeconds * 2.2);
    const target = { ...MOODS[this.mood].pose };
    if (this.mood === 'thinking') {
      for (const [key, delta] of Object.entries(THINK_VARIANTS[this.thinkVariant].delta)) target[key as keyof Pose] += delta;
    }
    for (const key of Object.keys(target) as (keyof Pose)[]) {
      this.pose[key] += (target[key] - this.pose[key]) * blend;
    }
    this.direct();
    this.updateGaze(deltaSeconds);
    this.applyPose(deltaSeconds);
  }

  private direct(): void {
    if (this.time < this.nextFidgetAt) return;
    const restless = this.mood === 'impatient' || this.mood === 'fuming';
    // Usually he is still; restless, he keeps looking at you, at your dice, and away again.
    this.nextFidgetAt = this.time + (restless ? 1.4 + Math.random() * 2 : 5 + Math.random() * 6);
    const pick = Math.random();
    if (restless && pick < 0.6) {
      const looks = [new THREE.Vector3(0, 3.4, 7), new THREE.Vector3(-3, 0.4, 1.8), new THREE.Vector3(-6, 2, 3), new THREE.Vector3(0, 3.4, 7)];
      this.glanceAt(looks[Math.floor(Math.random() * looks.length)], 0.6 + Math.random() * 1.1);
      if (Math.random() < 0.3) this.speak(0.5 + Math.random() * 0.5);
    } else if (pick < 0.55) {
      const targets = [new THREE.Vector3(-4, 1, 0), AI_DICE_CENTER.clone(), new THREE.Vector3(1, 3, 6)];
      this.glanceAt(targets[Math.floor(Math.random() * targets.length)], 1.3 + Math.random() * 1.6);
    } else if (pick < 0.75) {
      // Shifts his weight.
      this.leanSpring.velocity += (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.4);
    } else if (pick < 0.88) {
      this.shrug.velocity += 0.8;
    } else {
      this.restlessRoll = (Math.random() - 0.5) * (restless ? 0.14 : 0.07);
    }
  }

  private updateGaze(deltaSeconds: number): void {
    const elapsed = this.time - this.moodStartedAt;
    const player = new THREE.Vector3(0, 3.5, 7);
    const cover = AI_DICE_CENTER.clone();
    const aside = new THREE.Vector3(-3, 5, -3);

    if (this.glance && this.time < this.glance.until) {
      this.gazeGoal.copy(this.glance.target);
    } else {
      switch (this.mood) {
        case 'thinking': {
          if (this.thinkVariant === 1) this.gazeGoal.copy(cover);
          else if (this.thinkVariant === 3) this.gazeGoal.copy(player);
          else {
            const cycle = this.thinkVariant === 2 ? [cover, player, aside, cover, player] : [cover, aside, player, cover];
            this.gazeGoal.copy(cycle[Math.floor(elapsed / (this.thinkVariant === 2 ? 1.3 : 2.2)) % cycle.length]);
          }
          break;
        }
        default:
          this.gazeGoal.copy(player);
      }
    }
    this.gaze.lerp(this.gazeGoal, 1 - Math.exp(-deltaSeconds * 6));
  }

  private applyPose(dt: number): void {
    const { pose, time } = this;
    const step = dt === 0 ? 0.001 : dt;

    // Breathing is never quite regular, and everything below drifts a little
    // on its own unrelated rhythm, so no single part is ever the only thing moving.
    const breath = Math.sin(time * 1.1) + 0.4 * Math.sin(time * 0.37 + 1.3);
    const speaking = time < this.speakUntil;

    const roll = this.roll.update(step, pose.headRoll + this.restlessRoll + wander(time, 1) * 0.03);
    const pitchTarget = pose.headPitch + wander(time, 2) * 0.025 + (speaking ? Math.sin(time * 7) * 0.05 : 0);
    const pitch = this.pitch.update(step, pitchTarget);
    const lean = this.leanSpring.update(step, pose.lean + wander(time, 4) * 0.02);
    const shrug = this.shrug.update(step, 0);

    const swayTarget = wander(time, 5) * 0.025;
    const sway = this.torsoSway;
    this.torsoSway += (swayTarget - this.torsoSway) * Math.min(1, dt * 3);
    const swayVelocity = dt === 0 ? 0 : (this.torsoSway - sway) / dt;

    // Silent laughter comes in bursts.
    const burst = Math.max(0, Math.sin(time * 0.8 + 0.6)) ** 0.6;
    const laugh = pose.laugh * burst * (0.5 + 0.5 * Math.sin(time * 9.5 + Math.sin(time * 1.7) * 3));
    const tremor = pose.tremble * Math.sin(time * 41) + pose.tremble * 0.6 * Math.sin(time * 27 + 1);

    // The beard trails the head: it swings against head turns and sways with the body.
    const beardAngle = this.beardSwing.update(step, -roll * 0.9 - swayVelocity * 0.35 + Math.sin(time * 1.1) * 0.012 + laugh * 0.05);
    const talk = speaking ? 0.35 + 0.65 * Math.abs(Math.sin(time * 15 + Math.sin(time * 4.3) * 2)) : 0;
    const grin = pose.grin * (0.55 + 0.25 * Math.sin(time * 2.1)) + laugh * 0.5;
    const jawOpen = this.jawOpen.update(step, Math.max(talk, grin));

    const shake = laugh * 0.05 * Math.sin(time * 19) + tremor * 0.4;
    this.torso.group.position.set(this.torsoSway + tremor * 0.3, TORSO_TOP + breath * 0.016 - lean * 0.3 + shrug * 0.06 + shake, lean * 0.4);
    this.torso.group.scale.setScalar(1 + lean * 0.05);
    this.cowl.group.position.set(this.torsoSway + tremor * 0.3, COWL_TOP + breath * 0.022 - lean * 0.3 + shrug * 0.12 + shake, 0.02 + lean * 0.4);
    this.cowl.group.scale.set(1 + lean * 0.05, 1 + lean * 0.05 + breath * 0.006, 1);

    this.headPivot.position.set(this.torsoSway + tremor * 0.5, NECK_Y + breath * 0.024 - pitch * 0.7 - lean * 0.4 + shrug * 0.1 + shake * 1.4, 0.2 + lean * 0.6);
    this.headPivot.rotation.z = roll + tremor * 0.15;
    this.headPivot.scale.setScalar(HEAD_SCALE * (1 + lean * 0.1));

    // His eyes throb like embers, and go from pale to furious as he loses his temper.
    const glow = (0.86 + 0.14 * Math.sin(time * 1.4) + 0.04 * Math.sin(time * 5.3)) * (1 + 0.3 * pose.rage);
    this.eyesMaterial.color.setRGB(glow, glow * (1 - 0.55 * pose.rage), glow * (0.94 - 0.8 * pose.rage));

    this.stage.updateMatrixWorld(true);
    this.updateEyes(step);
    const turn = this.turn.update(step, THREE.MathUtils.clamp((this.gaze.x - this.headPivot.getWorldPosition(new THREE.Vector3()).x) * 0.06, -0.5, 0.5));
    this.face.position.set(turn * 0.12 + wander(time, 3) * 0.02 + tremor * 0.3, -pitch * 0.04, 0);

    this.jaw.rotation.z = beardAngle;
    this.jaw.position.y = this.jawBaseY() - jawOpen * 0.09;
    this.mouth.group.scale.y = Math.max(0.001, jawOpen * 0.9);

    this.stage.updateMatrixWorld(true);
    this.updateArms(dt, time);
  }

  private jawBaseY(): number {
    return (HEAD_PX.height - HINGE_Y) * UNIT;
  }

  private updateEyes(step: number): void {
    if (this.time > this.nextBlinkAt) {
      this.blinkUntil = this.time + 0.18;
      this.nextBlinkAt = this.time + 4 + Math.random() * 5;
    }

    const headWorld = this.headPivot.getWorldPosition(new THREE.Vector3());
    const gx = this.gazeX.update(step, THREE.MathUtils.clamp((this.gaze.x - headWorld.x) * 0.35, -1, 1));
    const gy = this.gazeY.update(step, THREE.MathUtils.clamp((headWorld.y - this.gaze.y) * 0.3, -1, 1));

    // The eyes never hold quite still: tiny darting shifts, a drifting lid and restless brows.
    if (this.time > this.saccade.until) {
      this.saccade = { x: (Math.random() - 0.5) * 0.35, y: (Math.random() - 0.5) * 0.2, until: this.time + 0.3 + Math.random() * 1.1 };
    }
    const t = this.time;
    const state: EyeState = {
      open: this.time < this.blinkUntil ? 0.05 : Math.max(0.05, this.pose.eyeOpen + wander(t, 7) * 0.05),
      browRaise: this.pose.browRaise + wander(t, 6) * 0.1,
      browTilt: this.pose.browTilt + wander(t, 8) * 0.12,
      browAsym: this.pose.browAsym + wander(t, 9) * 0.08,
      gazeX: gx + this.saccade.x,
      gazeY: gy + this.saccade.y,
    };

    // Only redraw when something visibly changed.
    const key = [state.open, state.browRaise, state.browTilt, state.browAsym, state.gazeX, state.gazeY].map((v) => Math.round(v * 12)).join(',');
    if (key !== this.drawnEyes) {
      this.drawnEyes = key;
      drawEyes(this.eyesContext, state);
      this.eyesTexture.needsUpdate = true;
    }
  }

  /** Where a hand wants to be, in the world, for the current gesture. */
  private handGoal(side: 0 | 1, mode: HandMode): THREE.Vector3 {
    const outward = side === 0 ? -1 : 1;
    const t = this.time;
    const chin = () => this.chin.getWorldPosition(new THREE.Vector3());
    // His right hand rests behind where his dice go, and slides well off to the side when they are shown, so it never sits under them.
    const restGoal = () => new THREE.Vector3(OPPONENT_X + (side === 0 ? (this.clearOfDice ? -5.3 : -3.3) : 2.2) + wander(t, side + 11) * 0.09, 0.34, -3.0 + wander(t, side + 13) * 0.07);

    switch (mode) {
      case 'chin':
        // The fist is held under the chin, its knuckles toward you.
        return chin().add(new THREE.Vector3(0.1 + wander(t, 15) * 0.05, -2.0 + wander(t, 16) * 0.05, 0.95));
      case 'stroke':
        // The open hand drags slowly down his beard and back up.
        return chin().add(new THREE.Vector3(0.2, -2.0 + 0.3 * Math.sin(t * 0.9) + wander(t, 17) * 0.05, 0.95));
      case 'steeple':
        return chin().add(new THREE.Vector3(outward * 0.5, -2.2 + wander(t, side + 18) * 0.04, 1.0));
      case 'point': {
        const jab = Math.max(0, Math.sin((t - this.moodStartedAt) * 3.2)) * 0.35;
        return new THREE.Vector3(OPPONENT_X - 1.4, 1.5, -2.6 + jab);
      }
      case 'slam': {
        // Both fists rise together, a beat apart, and come down hard.
        const elapsed = t - this.moodStartedAt - side * 0.12;
        const goal = restGoal();
        if (elapsed < 0) return goal;
        if (elapsed < 0.55) {
          const rise = 1 - (1 - elapsed / 0.55) ** 2;
          goal.y += rise * 2.6;
          goal.z += rise * 0.6;
        } else if (elapsed < 0.66) {
          const drop = (elapsed - 0.55) / 0.11;
          goal.y += (1 - drop) * 2.6;
          goal.z += (1 - drop) * 0.6;
        } else if (!this.slammed[side]) {
          this.slammed[side] = true;
          if (side === 1) this.pendingImpact = true;
        }
        return goal;
      }
      default:
        // Flat on the table, either side of him, a little apart.
        return restGoal();
    }
  }

  private updateArms(dt: number, time: number): void {
    const spec = MOODS[this.mood];
    const variant = this.mood === 'thinking' ? THINK_VARIANTS[this.thinkVariant] : null;
    const slamDone = this.mood === 'enraged' && this.time - this.moodStartedAt > 0.9;
    const modes: readonly [HandMode, HandMode] = slamDone ? ['fist', 'fist'] : variant ? [variant.left, variant.right] : [spec.left, spec.right];
    const drumSpeed = variant ? variant.drumSpeed : spec.drumSpeed;
    const overrides = [this.handOverride.left, this.handOverride.right] as const;

    this.hands.forEach((hand, i) => {
      const side = i as 0 | 1;
      const override = overrides[side];
      const mode = override ? 'rest' : modes[side];
      const look = HAND_LOOK[mode];
      const outward = side === 0 ? -1 : 1;
      const dragging = mode === 'drum' || mode === 'claw';
      hand.hand.setDrumming(dragging ? drumSpeed : 0, mode === 'claw' ? 0.5 : dragging ? 0.32 : 0);
      // Hands move deliberately, except the slam, which is fast.
      const follow = dt === 0 ? 1 : 1 - Math.exp(-dt * (mode === 'slam' ? 16 : 3.2));
      const upright = mode === 'chin' || mode === 'stroke';
      const yaw = mode === 'steeple' ? Math.PI + outward * 0.3 : look.yaw + (upright ? 0 : outward * 0.22);
      hand.moveTo(this.handGoal(side, mode), { ...look, yaw }, follow, dt, time);
      hand.hand.setVisible(!(side === 1 && this.coverActive));
    });
  }
}
