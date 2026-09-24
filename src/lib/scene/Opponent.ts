import * as THREE from 'three';
import { HandRig } from './HandRig';
import type { HandPoseName } from './HandRig';
import { ART_SCALE, createCanvas } from './ink';
import { AI_DICE_CENTER, OPPONENT_X, OPPONENT_Z } from './layout';
import {
  BEARD_BOX,
  EYES_STRIP,
  HEAD_PX,
  MOUSTACHE_BOX,
  SLEEVE_PX,
  drawBeard,
  drawCowl,
  drawEyes,
  drawHead,
  drawMoustache,
  drawMouth,
  drawSleeve,
  drawTorso,
} from './opponentArt';
import type { EyeState } from './opponentArt';
import { Spring } from './spring';

export type OpponentMood = 'idle' | 'thinking' | 'calling' | 'tense' | 'smug' | 'dismayed';

/** The cut-out leans back by this much so it faces the camera's downward view. */
const STAGE_TILT = -0.5;

/** World units per drawing unit, shared by every part of the figure so its proportions hold. */
const UNIT = 0.0105;

const SLEEVE_LENGTH = (440 - 16) * UNIT;
const SHOULDER_X = 2.5;
const SHOULDER_Y = 1.5;

/** Where the top of the habit, the top of the bunched cowl, and the base of the neck sit. */
const TORSO_TOP = 2.9;
const COWL_TOP = TORSO_TOP + 0.73;
const NECK_Y = TORSO_TOP - 0.35;

const SPRITE_TINT = 0xf0e6d2;

const HAND_SCALE = 0.55;

interface Pose {
  lean: number;
  headPitch: number;
  headRoll: number;
  browRaise: number;
  /** Positive slopes the brows down toward the nose (stern), negative up (worried). */
  browTilt: number;
  browAsym: number;
  eyeOpen: number;
}

type HandMode = 'rest' | 'drum' | 'chin' | 'point';

interface MoodSpec {
  pose: Pose;
  left: HandMode;
  right: HandMode;
  drumSpeed: number;
}

const MOODS: Record<OpponentMood, MoodSpec> = {
  idle: {
    pose: { lean: 0.03, headPitch: 0, headRoll: 0, browRaise: 0, browTilt: 0.35, browAsym: 0, eyeOpen: 0.5 },
    left: 'rest',
    right: 'drum',
    drumSpeed: 5,
  },
  thinking: {
    pose: { lean: 0.1, headPitch: -0.04, headRoll: 0.12, browRaise: 0.3, browTilt: 0, browAsym: 0.7, eyeOpen: 0.8 },
    left: 'rest',
    right: 'chin',
    drumSpeed: 0,
  },
  calling: {
    pose: { lean: 0.2, headPitch: 0.05, headRoll: -0.04, browRaise: -0.3, browTilt: 0.9, browAsym: 0, eyeOpen: 0.75 },
    left: 'rest',
    right: 'point',
    drumSpeed: 0,
  },
  tense: {
    pose: { lean: -0.05, headPitch: 0.02, headRoll: 0.04, browRaise: 0.9, browTilt: -0.6, browAsym: 0, eyeOpen: 1.3 },
    left: 'drum',
    right: 'drum',
    drumSpeed: 11,
  },
  smug: {
    pose: { lean: -0.18, headPitch: -0.14, headRoll: 0.09, browRaise: 0.1, browTilt: 0.5, browAsym: 0, eyeOpen: 0.5 },
    left: 'rest',
    right: 'rest',
    drumSpeed: 0,
  },
  dismayed: {
    pose: { lean: 0.12, headPitch: 0.3, headRoll: -0.07, browRaise: 0.2, browTilt: -0.9, browAsym: 0, eyeOpen: 0.7 },
    left: 'rest',
    right: 'rest',
    drumSpeed: 0,
  },
};

const HAND_LOOK: Record<HandMode, { pose: HandPoseName; roll: number; lie: number }> = {
  rest: { pose: 'relaxed', roll: 0, lie: 1 },
  drum: { pose: 'relaxed', roll: 0, lie: 1 },
  chin: { pose: 'fist', roll: Math.PI, lie: 0 },
  point: { pose: 'point', roll: 0, lie: 0 },
};

interface Sprite {
  readonly group: THREE.Group;
  readonly texture: THREE.CanvasTexture;
}

/** A flat cut-out; `anchor` is the point of the picture (0-1, y up) placed at the group's origin. */
function createSprite(canvas: HTMLCanvasElement, unit: number, anchor: readonly [number, number] = [0.5, 0.5]): Sprite {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const width = (canvas.width / ART_SCALE) * unit;
  const height = (canvas.height / ART_SCALE) * unit;
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate((0.5 - anchor[0]) * width, (0.5 - anchor[1]) * height, 0);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.4, color: SPRITE_TINT })));
  return { group, texture };
}

class PuppetHand {
  readonly group = new THREE.Group();
  readonly rig: HandRig;
  readonly position = new THREE.Vector3();
  private readonly roll = new Spring(0, 90, 11);
  private lie = 1;
  private initialised = false;

  constructor(mirrored: boolean) {
    this.rig = new HandRig(mirrored);
    this.group.add(this.rig.group);
  }

  moveTo(goal: THREE.Vector3, mode: HandMode, follow: number, dt: number, time: number): void {
    if (!this.initialised) {
      this.position.copy(goal);
      this.initialised = true;
    }
    const look = HAND_LOOK[mode];
    this.position.lerp(goal, follow);
    this.group.position.copy(this.position);
    this.rig.setPose(look.pose);
    this.rig.update(dt, time);

    // a hand lying on the table is seen foreshortened, a raised one full length
    this.lie += (look.lie - this.lie) * Math.min(1, dt * 8);
    this.group.rotation.z = this.roll.update(dt, look.roll);
    this.group.scale.set(HAND_SCALE, HAND_SCALE * (1 - 0.42 * this.lie), 1);
  }
}

/**
 * The opponent: a layered cut-out puppet (torso, cowl, head, jaw and beard,
 * eyes, sleeves, articulated hands). Springs give the beard, jaw and
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
  private readonly sleeves: readonly [Sprite, Sprite];
  private readonly hands = [new PuppetHand(true), new PuppetHand(false)] as const;
  private readonly restTargets: readonly [THREE.Vector3, THREE.Vector3];
  private readonly pointTarget: THREE.Vector3;

  private coverActive = false;
  private mood: OpponentMood = 'idle';
  private moodStartedAt = 0;
  private time = 0;

  private nextBlinkAt = 2;
  private blinkUntil = 0;
  private nextFidgetAt = 4;
  private glance: { target: THREE.Vector3; until: number } | null = null;
  private speakUntil = 0;
  private restlessRoll = 0;

  private readonly roll = new Spring(0, 80, 11);
  private readonly pitch = new Spring(0, 80, 11);
  private readonly leanSpring = new Spring(0, 60, 9);
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
    this.stage.position.set(OPPONENT_X, -2.3, OPPONENT_Z);
    this.stage.rotation.x = STAGE_TILT;
    this.stage.scale.setScalar(1.2);
    this.group.add(this.stage);

    this.torso = createSprite(drawTorso(), UNIT, [0.5, 1]);
    this.cowl = createSprite(drawCowl(), UNIT, [0.5, 1]);
    this.stage.add(this.torso.group, this.cowl.group);
    this.cowl.group.position.z = 0.02;

    this.sleeves = [createSprite(drawSleeve(), UNIT, [0.5, 1 - 16 / SLEEVE_PX.height]), createSprite(drawSleeve(), UNIT, [0.5, 1 - 16 / SLEEVE_PX.height])];
    for (const sleeve of this.sleeves) this.stage.add(sleeve.group);

    this.headPivot.position.set(0, NECK_Y, 0.2);
    this.stage.add(this.headPivot);
    const head = createSprite(drawHead(), UNIT, [0.5, 0]);
    this.headPivot.add(head.group, this.face);

    const headPoint = (x: number, y: number) => new THREE.Vector3((x - HEAD_PX.width / 2) * UNIT, (HEAD_PX.height - y) * UNIT, 0);

    this.mouth = createSprite(drawMouth(), UNIT);
    this.mouth.group.position.copy(headPoint(170, 300)).setZ(0.01);
    this.mouth.group.scale.y = 0.001;
    this.face.add(this.mouth.group);

    const [eyesCanvas, eyesContext] = createCanvas(EYES_STRIP.width, EYES_STRIP.height);
    this.eyesContext = eyesContext;
    this.eyesTexture = new THREE.CanvasTexture(eyesCanvas);
    this.eyesTexture.colorSpace = THREE.SRGBColorSpace;
    const eyes = new THREE.Mesh(
      new THREE.PlaneGeometry(EYES_STRIP.width * UNIT, EYES_STRIP.height * UNIT),
      new THREE.MeshBasicMaterial({ map: this.eyesTexture, alphaTest: 0.3, color: SPRITE_TINT }),
    );
    eyes.position.copy(headPoint(HEAD_PX.width / 2, EYES_STRIP.top + EYES_STRIP.height / 2)).setZ(0.02);
    this.face.add(eyes);

    const moustache = createSprite(drawMoustache(), UNIT);
    moustache.group.position.copy(headPoint(MOUSTACHE_BOX.x + MOUSTACHE_BOX.width / 2, MOUSTACHE_BOX.y + MOUSTACHE_BOX.height / 2)).setZ(0.03);
    this.face.add(moustache.group);

    const hinge = { x: 170, y: 304 };
    const beard = createSprite(drawBeard(), UNIT, [(hinge.x - BEARD_BOX.x) / BEARD_BOX.width, 1 - (hinge.y - BEARD_BOX.y) / BEARD_BOX.height]);
    this.jaw.position.copy(headPoint(hinge.x, hinge.y)).setZ(0.035);
    this.jaw.add(beard.group);
    this.face.add(this.jaw);

    this.chin.position.copy(headPoint(176, 350)).setZ(0.05);
    this.headPivot.add(this.chin);

    for (const hand of this.hands) {
      hand.group.position.z = 0.3;
      this.stage.add(hand.group);
    }

    this.stage.updateMatrixWorld(true);
    this.restTargets = [this.toStage(new THREE.Vector3(OPPONENT_X - 1.7, 2.0, -2.9)), this.toStage(new THREE.Vector3(OPPONENT_X + 1.7, 2.0, -2.9))];
    this.pointTarget = this.toStage(new THREE.Vector3(OPPONENT_X - 1.8, 2.4, -1.8));

    this.applyPose(0);
  }

  private toStage(world: THREE.Vector3): THREE.Vector3 {
    return this.stage.worldToLocal(world.clone());
  }

  setMood(mood: OpponentMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.moodStartedAt = this.time;
  }

  /** Sends the left arm to a flat hand lying at `wrist` (hiding the puppet's own left hand), or back when null. */
  setCoverHand(wrist: THREE.Vector3 | null): void {
    this.handOverride.left = wrist;
    this.coverActive = wrist !== null;
  }

  speak(seconds: number): void {
    this.speakUntil = Math.max(this.speakUntil, this.time + seconds);
  }

  glanceAt(target: THREE.Vector3, seconds: number): void {
    this.glance = { target: target.clone(), until: this.time + seconds };
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const blend = 1 - Math.exp(-deltaSeconds * 5);
    const target = MOODS[this.mood].pose;
    for (const key of Object.keys(target) as (keyof Pose)[]) {
      this.pose[key] += (target[key] - this.pose[key]) * blend;
    }
    this.direct();
    this.updateGaze(deltaSeconds);
    this.applyPose(deltaSeconds);
  }

  private direct(): void {
    if (this.time < this.nextFidgetAt) return;
    this.nextFidgetAt = this.time + 3 + Math.random() * 5;
    const pick = Math.random();
    if (pick < 0.4) {
      const targets = [new THREE.Vector3(-4, 1, 0), AI_DICE_CENTER.clone(), new THREE.Vector3(1, 3, 6)];
      this.glanceAt(targets[Math.floor(Math.random() * targets.length)], 0.7 + Math.random() * 0.8);
    } else if (pick < 0.65) {
      this.shrug.velocity += 3.2;
    } else {
      this.restlessRoll = (Math.random() - 0.5) * 0.14;
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
          const cycle = [cover, aside, player, cover];
          this.gazeGoal.copy(cycle[Math.floor(elapsed / 0.9) % cycle.length]);
          break;
        }
        case 'dismayed':
          this.gazeGoal.copy(cover);
          break;
        default:
          this.gazeGoal.copy(player);
      }
    }
    this.gaze.lerp(this.gazeGoal, 1 - Math.exp(-deltaSeconds * 14));
  }

  private applyPose(dt: number): void {
    const { pose, time } = this;
    const step = dt === 0 ? 0.001 : dt;

    const breath = Math.sin(time * 1.7);
    const speaking = time < this.speakUntil;

    const roll = this.roll.update(step, pose.headRoll + this.restlessRoll + Math.sin(time * 0.6) * 0.02);
    const pitchTarget = pose.headPitch + (speaking ? Math.sin(time * 7) * 0.05 : 0);
    const pitch = this.pitch.update(step, pitchTarget);
    const lean = this.leanSpring.update(step, pose.lean);
    const shrug = this.shrug.update(step, 0);

    const swayTarget = Math.sin(time * 0.4) * 0.05;
    const sway = this.torsoSway;
    this.torsoSway += (swayTarget - this.torsoSway) * Math.min(1, dt * 3);
    const swayVelocity = dt === 0 ? 0 : (this.torsoSway - sway) / dt;

    // The beard trails the head: it swings against head turns and sways with the body.
    const beardAngle = this.beardSwing.update(step, -roll * 0.9 - swayVelocity * 0.35 + Math.sin(time * 1.1) * 0.012);
    const talk = speaking ? 0.35 + 0.65 * Math.abs(Math.sin(time * 15 + Math.sin(time * 4.3) * 2)) : 0;
    const jawOpen = this.jawOpen.update(step, talk);

    this.torso.group.position.set(this.torsoSway, TORSO_TOP + breath * 0.02 - lean * 0.3 + shrug * 0.06, lean * 0.4);
    this.torso.group.scale.setScalar(1 + lean * 0.05);
    this.cowl.group.position.set(this.torsoSway, COWL_TOP + breath * 0.028 - lean * 0.3 + shrug * 0.12, 0.02 + lean * 0.4);
    this.cowl.group.scale.set(1 + lean * 0.05, 1 + lean * 0.05 + breath * 0.008, 1);

    this.headPivot.position.set(this.torsoSway, NECK_Y + breath * 0.03 - pitch * 0.7 - lean * 0.4 + shrug * 0.1, 0.2 + lean * 0.6);
    this.headPivot.rotation.z = roll;
    this.headPivot.scale.setScalar(1 + lean * 0.1);

    this.stage.updateMatrixWorld(true);
    this.updateEyes(step);
    const turn = this.turn.update(step, THREE.MathUtils.clamp((this.gaze.x - this.headPivot.getWorldPosition(new THREE.Vector3()).x) * 0.06, -0.5, 0.5));
    this.face.position.set(turn * 0.12, -pitch * 0.04, 0);

    this.jaw.rotation.z = beardAngle;
    this.jaw.position.y = this.jawBaseY() - jawOpen * 0.09;
    this.mouth.group.scale.y = Math.max(0.001, jawOpen * 0.9);

    this.stage.updateMatrixWorld(true);
    this.updateArms(dt, time);
  }

  private jawBaseY(): number {
    return (HEAD_PX.height - 304) * UNIT;
  }

  private updateEyes(step: number): void {
    if (this.time > this.nextBlinkAt) {
      this.blinkUntil = this.time + 0.13;
      this.nextBlinkAt = this.time + 2 + Math.random() * 3.5;
    }

    const headWorld = this.headPivot.getWorldPosition(new THREE.Vector3());
    const gx = this.gazeX.update(step, THREE.MathUtils.clamp((this.gaze.x - headWorld.x) * 0.35, -1, 1));
    const gy = this.gazeY.update(step, THREE.MathUtils.clamp((headWorld.y - this.gaze.y) * 0.3, -1, 1));

    const state: EyeState = {
      open: this.time < this.blinkUntil ? 0.05 : this.pose.eyeOpen,
      browRaise: this.pose.browRaise,
      browTilt: this.pose.browTilt,
      browAsym: this.pose.browAsym,
      gazeX: gx,
      gazeY: gy,
    };

    // Only redraw when something visibly changed.
    const key = [state.open, state.browRaise, state.browTilt, state.browAsym, gx, gy].map((v) => Math.round(v * 12)).join(',');
    if (key !== this.drawnEyes) {
      this.drawnEyes = key;
      drawEyes(this.eyesContext, state);
      this.eyesTexture.needsUpdate = true;
    }
  }

  private handTarget(side: 0 | 1, mode: HandMode, drumSpeed: number): THREE.Vector3 {
    switch (mode) {
      case 'chin': {
        // The fist sits under the chin, its wrist below.
        const chin = this.toStage(this.chin.getWorldPosition(new THREE.Vector3()));
        return chin.add(new THREE.Vector3(0.3, -1.6, 0.2));
      }
      case 'point': {
        const jab = Math.max(0, Math.sin((this.time - this.moodStartedAt) * 7)) * 0.25;
        return this.pointTarget.clone().add(new THREE.Vector3(0, -jab, 0));
      }
      case 'drum': {
        const shift = drumSpeed > 0 ? Math.sin(this.time * drumSpeed * 0.5 + side) * 0.04 : 0;
        return this.restTargets[side].clone().add(new THREE.Vector3(shift, 0, 0));
      }
      default:
        return this.restTargets[side].clone();
    }
  }

  private updateArms(dt: number, time: number): void {
    const spec = MOODS[this.mood];
    const modes = [spec.left, spec.right] as const;
    const overrides = [this.handOverride.left, this.handOverride.right] as const;
    const follow = dt === 0 ? 1 : 1 - Math.exp(-dt * 10);

    this.hands.forEach((hand, i) => {
      const side = i as 0 | 1;
      const override = overrides[side];
      const mode = override ? 'rest' : modes[side];
      const goal = override ? this.toStage(override) : this.handTarget(side, mode, spec.drumSpeed);
      hand.rig.setDrumming(mode === 'drum' ? spec.drumSpeed : 0, mode === 'drum' ? 0.55 : 0);
      hand.moveTo(goal, mode, follow, dt, time);
      hand.group.visible = !(side === 0 && this.coverActive);

      const shoulder = new THREE.Vector3((side === 0 ? -1 : 1) * SHOULDER_X, SHOULDER_Y + this.torso.group.position.y - 0.9 + this.shrug.value * 0.1, 0.1);
      const wrist = hand.position;
      const dx = wrist.x - shoulder.x;
      const dy = wrist.y + 0.15 - shoulder.y;
      const length = Math.hypot(dx, dy);
      const stretch = THREE.MathUtils.clamp(length / SLEEVE_LENGTH, 0.22, 2.4);

      const sleeve = this.sleeves[side].group;
      sleeve.position.copy(shoulder);
      // Behind the cowl, so the arms seem to come out from under it.
      sleeve.position.z = 0.01;
      sleeve.rotation.z = Math.atan2(dx, -dy);
      sleeve.scale.set(THREE.MathUtils.clamp(1 / Math.sqrt(stretch), 0.75, 1.15), stretch, 1);
    });
  }
}

