import * as THREE from 'three';
import type { Face } from '../game/types';
import { FlatHand } from './Hands';
import { createDieMesh, facingQuaternion, restHeight } from './Die';
import { STARTING_DICE } from '../game/match';
import { AI_DICE_CENTER, PLAYER_HAND_BACK, PLAYER_HAND_FINGERS, PLAYER_HAND_REST, PLAYER_ROW_SPACING, PLAYER_ROW_START, PLAYER_ROW_Z } from './layout';
import { Opponent } from './Opponent';
import type { OpponentMood } from './Opponent';
import { PixelPass } from './post';
import { LANTERN_POSITION, LANTERN_TARGET, buildRoom } from './Room';
import type { Room } from './Room';
import { buildTable } from './Table';
import { Tweens, easeInOutCubic, easeOutCubic } from './tween';

export type { OpponentMood } from './Opponent';

/** How his guarding hand stands: on edge like a low wall, fingers reaching across to his right, thumb up, the back of it toward us. */
const GUARD_FINGERS = new THREE.Vector3(-0.95, 0.3, 0).normalize();
const GUARD_BACK = new THREE.Vector3(0, 0.12, 1).normalize();
const GUARD_SIDE = new THREE.Vector3().crossVectors(GUARD_FINGERS, new THREE.Vector3(0, 0, 1));

interface HandState {
  wrist: THREE.Vector3;
  fingers: THREE.Vector3;
  back: THREE.Vector3;
}

/** A hand lying flat, palm down, fingers toward the camera, as `FlatHand.place` leaves it. */
function flatState(wrist: THREE.Vector3, yaw = 0.1): HandState {
  return { wrist, fingers: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), back: new THREE.Vector3(0, 1, 0) };
}

/** Rolls the guard about its fingers: 0 stands on edge, larger tips the back of the hand up and over. */
function guardState(wrist: THREE.Vector3, roll = 0): HandState {
  const back = GUARD_BACK.clone().multiplyScalar(Math.cos(roll)).addScaledVector(GUARD_SIDE, Math.sin(roll));
  return { wrist, fingers: GUARD_FINGERS.clone(), back };
}

/** Where your hand lies, palm down, before you have rolled. */
/** Lying on the table your hand is smaller than it is when it stands to guard, so it doesn't fill the table. */
const PLAYER_HAND_IDLE_SIZE = 0.78;
const PLAYER_HAND_IDLE = new THREE.Vector3(-3.8, 0.12, 3.2);
const PLAYER_HAND_IDLE_FINGERS = new THREE.Vector3(0.6, 0, -0.8).normalize();

const TARGET_BUFFER_HEIGHT = 360;

const DITHER_CELL_CSS_PX = 2;

/** A row across his near edge, unevenly spaced and a little in and out of line, like yours, so his dice are as easy to read when they are shown. */
function rowPositions(count: number, center: THREE.Vector3): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => {
    const across = (i - (count - 1) / 2) * 1.1 + (Math.random() - 0.5) * 0.25;
    return new THREE.Vector3(center.x + across, 0, center.z + (Math.random() - 0.5) * 0.5);
  });
}

/**
 * Renderer, scene, camera and render loop for the table. The opponent's dice
 * stay hidden under his hand from the moment they are rolled until
 * revealHands(), so they can never be seen mid-toss.
 */
export class SceneManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly backgroundScene: THREE.Scene;
  private readonly room: Room;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pass = new PixelPass();
  private readonly opponent = new Opponent();
  // Both hands (his left, your left) guard their dice the same way: standing on edge, palm toward the dice.
  private readonly aiHand = new FlatHand(true, 301);
  private readonly playerHand = new FlatHand(true, 302);
  private readonly diceGroup = new THREE.Group();
  private readonly tweens = new Tweens();
  private readonly resizeObserver: ResizeObserver;
  private readonly timer = new THREE.Timer();
  private aiDice: THREE.Mesh[] = [];
  private opponentReachesOut = false;
  private readonly cameraBase = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3(0, -0.4, -1.5);
  /** Where the camera goes when the dice are shown: higher, further in and looking more steeply down at the middle of the table, so both rows read. */
  private readonly revealPosition = new THREE.Vector3(0, 8.6, 13.2);
  private readonly revealTarget = new THREE.Vector3(0, -0.5, -0.2);
  private table!: ReturnType<typeof buildTable>;
  private candleLight!: THREE.PointLight;
  private viewAmount = 0;
  private viewGoal = 0;
  private shake = 0;
  private coveringDice = false;
  private playerHandAway = false;
  /** Where your hand was left after clearing your dice away, so the roll can start from there. */
  private playerHandRest: HandState | null = null;
  private frameId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // The room is a separate scene, rendered as a blurred backdrop layer (see
    // PixelPass) so it never competes with — or, being depth-based, ever
    // accidentally blurs — the table itself.
    this.backgroundScene = new THREE.Scene();
    this.backgroundScene.background = new THREE.Color(0x060402);
    this.backgroundScene.fog = new THREE.FogExp2(0x060402, 0.007);
    this.room = buildRoom();
    this.backgroundScene.add(new THREE.HemisphereLight(0x6a7a58, 0x120c08, 0.28), this.room.group);

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(0x060402, 0.007);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    // A long lens from well back, so the hall behind the table is compressed
    // and reads as a room at a sensible distance, not a drop seen from above.
    this.camera.position.set(0, 7.2, 14.2);
    this.camera.lookAt(this.cameraTarget);
    this.cameraBase.copy(this.camera.position);

    this.scene.add(new THREE.HemisphereLight(0x5a6a4a, 0x100a06, 0.09));
    const table = buildTable();

    const lantern = new THREE.SpotLight(0xffae62, 380, 0, 0.75, 0.9, 2);
    lantern.position.copy(LANTERN_POSITION);
    lantern.target.position.copy(LANTERN_TARGET);
    lantern.castShadow = true;
    lantern.shadow.mapSize.set(2048, 2048);
    lantern.shadow.camera.near = 4;
    lantern.shadow.camera.far = 26;
    lantern.shadow.bias = -0.0004;
    const candle = new THREE.PointLight(0xff9a44, 60, 16, 1.5);
    candle.position.copy(table.flamePosition);
    this.table = table;
    this.candleLight = candle;
    // A pair of low flames on the monk's side of the table light the felt, and
    // the underside of his face, from below.
    const monkFlames = [new THREE.Vector3(3.4, 0.9, -2.6), new THREE.Vector3(6.2, 0.9, -2.4)].map((position) => {
      const flame = new THREE.PointLight(0xff8a30, 34, 11, 1.6);
      flame.position.copy(position);
      return flame;
    });

    this.scene.add(
      lantern,
      lantern.target,
      candle,
      ...monkFlames,
      table.group,
      this.opponent.group,
      this.aiHand.group,
      this.playerHand.group,
      this.diceGroup,
    );

    this.aiHand.setSize(0.6);
    this.playerHand.setSize(1.0);

    this.resetHands();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();
  }

  /** Off the left of the picture, where your hand waits between rounds. */
  private awayState(): HandState {
    return { wrist: new THREE.Vector3(this.visibleLeft(PLAYER_ROW_Z) - 8, 0.6, PLAYER_ROW_Z), fingers: new THREE.Vector3(1, 0.1, 0.1).normalize(), back: new THREE.Vector3(0, 1, 0) };
  }

  private resetHands(): void {
    if (this.playerHandAway) {
      // After the first round it stays out of sight until it comes back to roll.
      const away = this.awayState();
      this.playerHand.scaleTo(1);
      this.playerHand.placeByAxes(away.wrist, away.fingers, away.back);
      this.playerHand.setPose('fist', true);
    } else {
      // Before there is anything to guard, the hand just lies on the table, palm down.
      this.playerHand.scaleTo(PLAYER_HAND_IDLE_SIZE);
      this.playerHand.placeByAxes(PLAYER_HAND_IDLE, PLAYER_HAND_IDLE_FINGERS, new THREE.Vector3(0, 1, 0));
      this.playerHand.setPose('resting', true);
    }
    this.playerHand.setDrumming(0);
    this.playerHand.setVisible(true);
    this.aiHand.setVisible(false);
    this.aiHand.setDrumming(0);
    this.opponentReachesOut = false;
    this.coveringDice = false;
    this.viewGoal = 0;
    this.opponent.setClearOfDice(false);
    this.opponent.setCoverHand(null);
  }

  setOpponentMood(mood: OpponentMood): void {
    this.opponent.setMood(mood);
  }

  speak(seconds: number): void {
    this.opponent.speak(seconds);
  }

  /**
   * A look at his dice: the hand rolls over on its fingers so the edge nearest
   * him lifts, he studies them for a while, shifts for a second look, then
   * rolls it shut again. The gap faces him, never us.
   */
  async peekAtDice(): Promise<void> {
    if (!this.coveringDice) return;
    this.opponent.glanceAt(AI_DICE_CENTER, 3.4);
    const home = this.guardWrist();
    const open = (roll: number) => {
      if (!this.coveringDice) return;
      const wrist = home.clone().add(new THREE.Vector3(0, Math.sin(roll) * 0.25, -Math.sin(roll) * 0.35));
      const state = guardState(wrist, roll);
      this.aiHand.placeByAxes(state.wrist, state.fingers, state.back);
    };
    this.aiHand.setDrumming(0);
    await this.tweens.run(520, (t) => open(easeInOutCubic(t) * 0.85));
    // Holds it there, studying them, with a small shift and a hesitation.
    await this.tweens.run(1500, (t) => {
      const settle = Math.sin(t * Math.PI * 2.4) * 0.05 + (t > 0.55 && t < 0.72 ? Math.sin(((t - 0.55) / 0.17) * Math.PI) * 0.16 : 0);
      open(0.85 + settle);
    });
    await this.tweens.run(420, (t) => open((1 - easeInOutCubic(t)) * 0.85));
    if (this.coveringDice) this.aiHand.setDrumming(2.4, 0.1);
  }

  clearDice(): void {
    this.tweens.finishAll();
    this.diceGroup.clear();
    this.aiDice = [];
    this.resetHands();
  }

  async rollDice(hands: { player: readonly Face[]; ai: readonly Face[] }): Promise<void> {
    if (this.diceGroup.children.length > 0) {
      await this.sweepAway();
      this.diceGroup.clear();
      this.aiDice = [];
      this.coveringDice = false;
    } else {
      this.clearDice();
    }
    await Promise.all([this.throwPlayerDice(hands.player), this.opponentCoversDice(hands.ai)]);
  }

  async revealHands(): Promise<void> {
    this.slideDiceOut();
    this.opponent.setClearOfDice(true);
    this.viewGoal = 1;

    this.coveringDice = false;
    // Your hand comes off your dice and slides out of the picture, so they are shown.
    this.playerHand.setDrumming(0);
    this.playerHand.setPose('flat');
    this.playerHandAway = true;
    const playerAway = this.moveHandState(
      this.playerHand,
      { wrist: PLAYER_HAND_REST.clone(), fingers: PLAYER_HAND_FINGERS.clone(), back: PLAYER_HAND_BACK.clone() },
      this.awayState(),
      750,
      easeInOutCubic,
    ).then(() => this.playerHand.setPose('fist'));
    this.aiHand.setDrumming(0);
    const covering = this.aiHand.position.clone();
    const lifted = new THREE.Vector3(covering.x + 0.6, 2.2, covering.z - 1.4);
    this.aiHand.setPose('flat');
    await this.moveHandState(this.aiHand, guardState(covering), flatState(lifted, 0.25), 450, easeOutCubic);
    this.aiHand.setPose('relaxed');
    // It goes back to where his own hand lies, and he takes it up from there.
    const home = this.opponent.restPosition(1);
    await this.moveHandState(this.aiHand, flatState(lifted, 0.25), flatState(home, 0.1), 450, easeInOutCubic);

    this.opponentReachesOut = false;
    this.opponent.releaseCoverHand(home);
    this.aiHand.setVisible(false);
    await playerAway;
  }

  /** His dice come out from under his hand as it draws away, growing to size and settling into their places. */
  private slideDiceOut(): void {
    const tuck = this.guardWrist();
    this.aiDice.forEach((die, i) => {
      const home = die.position.clone();
      const from = home.clone().lerp(new THREE.Vector3(tuck.x - 0.8, home.y, tuck.z - 0.4), 0.55);
      from.y = home.y + 0.15;
      die.position.copy(from);
      die.scale.setScalar(0.5);
      die.visible = false;
      const delay = 120 + i * 70;
      const duration = 520;
      void this.tweens.run(delay + duration, (t) => {
        const u = THREE.MathUtils.clamp((t * (delay + duration) - delay) / duration, 0, 1);
        die.visible = u > 0;
        const e = easeOutCubic(u);
        die.position.lerpVectors(from, home, e);
        die.position.y = home.y + (from.y - home.y) * (1 - e) + Math.sin(u * Math.PI) * 0.22 * (1 - u);
        die.scale.setScalar(0.5 + 0.5 * e);
      });
    });
  }

  /**
   * The last round's dice are retrieved with a wave, the reveal played
   * backwards: each hand sweeps over its row, and every die it passes is
   * plucked up, drawn into the palm as it shrinks, and gone.
   */
  private async sweepAway(): Promise<void> {
    this.viewGoal = 0;
    this.opponent.setClearOfDice(false);
    this.aiHand.setDrumming(0);
    this.playerHand.setDrumming(0);
    const monkDice = this.aiDice;
    const playerDice = this.diceGroup.children.filter((die) => !monkDice.includes(die as THREE.Mesh));
    const up = new THREE.Vector3(0, 1, 0);

    /** Sweeps a hand along a line above a row, plucking each die into the palm as it passes over. */
    const wave = (hand: FlatHand, dice: readonly THREE.Object3D[], from: THREE.Vector3, to: THREE.Vector3, fingers: THREE.Vector3, palmReach: number, ms: number) =>
      this.tweens.run(ms, (t) => {
        const u = easeInOutCubic(t);
        const wrist = from.clone().lerp(to, u);
        // A loose wrist: the hand dips and rolls a little as it goes, like a conjuror's pass.
        wrist.y += Math.sin(u * Math.PI * 3) * 0.12;
        const back = new THREE.Vector3(Math.sin(u * Math.PI * 3) * 0.22, 1, 0).normalize();
        hand.placeByAxes(wrist, fingers, back);
        const palm = wrist.clone().addScaledVector(fingers, palmReach).add(new THREE.Vector3(0, -0.35, 0));
        for (const die of dice) {
          const along = THREE.MathUtils.clamp((die.userData.x - from.x) / (to.x - from.x), 0, 1);
          const p = THREE.MathUtils.clamp((u - along * 0.72) / 0.26, 0, 1);
          if (p <= 0) continue;
          const e = p * p;
          die.position.lerpVectors(die.userData.home, palm, e);
          // It rises a little first, as if pulled, before it drops into the hand.
          die.position.y += Math.sin(p * Math.PI) * 0.35;
          die.scale.setScalar(Math.max(0, 1 - e));
          die.visible = die.scale.x > 0.03;
        }
      });
    for (const die of [...monkDice, ...playerDice]) {
      die.userData.x = die.position.x;
      die.userData.home = die.position.clone();
    }

    // His left hand comes over from where it rests and passes across his row from his left to his right.
    const monkStart = this.opponent.handWrist(1);
    this.aiHand.setVisible(true);
    this.aiHand.setPose('cover', true);
    this.opponentReachesOut = true;
    const monkFingers = new THREE.Vector3(0.1, 0, 1).normalize();
    const monkFrom = new THREE.Vector3(AI_DICE_CENTER.x + 2.9, 1.5, AI_DICE_CENTER.z - 1.0);
    const monkTo = new THREE.Vector3(AI_DICE_CENTER.x - 2.9, 1.5, AI_DICE_CENTER.z - 1.0);
    const monkWave = (async () => {
      await this.moveHandState(this.aiHand, flatState(monkStart, 0.1), { wrist: monkFrom, fingers: monkFingers, back: up }, 480, easeInOutCubic);
      await wave(this.aiHand, monkDice, monkFrom, monkTo, monkFingers, 1.0, 1100);
      for (const die of monkDice) die.visible = false;
    })();

    // Yours passes over your row, left to right, out of the fist it will roll from.
    const away = this.awayState();
    const fingers = new THREE.Vector3(1, 0, 0.05).normalize();
    const rowZ = PLAYER_ROW_Z - 1.0;
    const from = new THREE.Vector3(this.visibleLeft(PLAYER_ROW_Z) - 1.0, 1.6, rowZ);
    const lastDie = Math.max(...playerDice.map((die) => die.userData.x as number), 0);
    const to = new THREE.Vector3(Math.max(lastDie - 3.4, from.x + 3), 1.6, rowZ);
    this.playerHand.setPose('flat');
    const playerWave = (async () => {
      await this.moveHandState(this.playerHand, { wrist: away.wrist, fingers: away.fingers, back: up }, { wrist: from, fingers, back: up }, 500, easeInOutCubic);
      // The palm is 2.6 ahead of the wrist, so a die is under it when the wrist is that far short of it.
      for (const die of playerDice) die.userData.x -= 2.6;
      await wave(this.playerHand, playerDice, from, to, fingers, 2.6, 1100);
      for (const die of playerDice) die.visible = false;
      this.playerHand.setPose('fist');
    })();
    this.playerHandAway = false;
    this.playerHandRest = { wrist: to.clone(), fingers, back: up.clone() };

    await Promise.all([monkWave, playerWave]);
  }

  private throwPlayerDice(faces: readonly Face[]): Promise<void> {
    // Dice land where they land: unevenly spaced, a little in and out of line.
    // On a narrow window the left of the table is out of frame: start the row inside the view, and squeeze the spacing to fit.
    const leftEdge = this.visibleLeft(PLAYER_ROW_Z) + 1.0;
    const start = Math.max(PLAYER_ROW_START, leftEdge);
    const spacing = Math.min(PLAYER_ROW_SPACING, (PLAYER_ROW_START + PLAYER_ROW_SPACING * 4 - start) / 4.4);
    // Lose a die and the gap opens on the left, though the row shuffles most of the way toward the middle.
    let x = start + (STARTING_DICE - faces.length) * spacing * 0.75;
    const targets = faces.map(() => {
      const target = new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, 0, PLAYER_ROW_Z + (Math.random() - 0.5) * 0.75);
      x += spacing * (0.88 + Math.random() * 0.38);
      return target;
    });
    const fromSweep = this.playerHandRest !== null;
    const comingBack = this.playerHandAway;
    this.playerHandAway = false;
    const flat: HandState = this.playerHandRest ?? (comingBack ? this.awayState() : { wrist: PLAYER_HAND_IDLE.clone(), fingers: PLAYER_HAND_IDLE_FINGERS.clone(), back: new THREE.Vector3(0, 1, 0) });
    this.playerHandRest = null;
    const startFactor = comingBack || fromSweep ? 1 : PLAYER_HAND_IDLE_SIZE;
    const raised: HandState = { wrist: new THREE.Vector3(-3.4, 2.0, 3.4), fingers: new THREE.Vector3(1, 0.3, 0.2).normalize(), back: new THREE.Vector3(0, 0.7, 0.7).normalize() };
    const guard: HandState = { wrist: PLAYER_HAND_REST.clone(), fingers: PLAYER_HAND_FINGERS.clone(), back: PLAYER_HAND_BACK.clone() };

    // The hand balls into a fist, lifts, opens to let the dice go, then settles into its guard over them.
    this.playerHand.setPose('fist');
    this.playerHand.setDrumming(0);
    let released = false;
    const wrist = new THREE.Vector3();
    const fingers = new THREE.Vector3();
    const back = new THREE.Vector3();
    const hop = this.tweens.run(900, (t) => {
      const from = t < 0.45 ? flat : raised;
      const to = t < 0.45 ? raised : guard;
      const u = easeInOutCubic(t < 0.45 ? t / 0.45 : (t - 0.45) / 0.55);
      wrist.lerpVectors(from.wrist, to.wrist, u);
      fingers.lerpVectors(from.fingers, to.fingers, u).normalize();
      back.lerpVectors(from.back, to.back, u).normalize();
      this.playerHand.scaleTo(startFactor + (1 - startFactor) * easeInOutCubic(Math.min(1, t / 0.6)));
      this.playerHand.placeByAxes(wrist, fingers, back);
      if (t > 0.45 && !released) {
        released = true;
        this.playerHand.setPose('flat');
      }
      if (t >= 1) {
        this.playerHand.setPose('cover');
        this.playerHand.setDrumming(0.9, 0.08);
      }
    });

    const raised0 = raised.wrist;
    const throws = faces.map((face, i) => {
      const die = createDieMesh('player');
      this.diceGroup.add(die);

      const target = targets[i];
      const start = new THREE.Vector3(raised0.x + Math.random() * 1.2 - 0.6, 2.4, raised0.z + Math.random() * 0.6 - 0.3);
      const final = facingQuaternion(face, (Math.random() - 0.5) * 0.5);
      target.y = restHeight(final);
      const spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const spinTurns = (2 + Math.random() * 2) * Math.PI * 2;
      const lift = 1.2 + Math.random() * 0.6;
      const spin = new THREE.Quaternion();
      die.position.copy(start);
      die.visible = false;

      return this.tweens.run(1300 + i * 70, (t) => {
        const delay = 0.3 + i * 0.02;
        const u = Math.max(0, (t - delay) / (1 - delay));
        die.visible = t >= delay;
        const travel = easeOutCubic(u);
        die.position.lerpVectors(start, target, travel);
        const bounce = u > 0.72 ? Math.sin(((u - 0.72) / 0.28) * Math.PI) * 0.16 : 0;
        die.position.y = target.y + (start.y - target.y) * (1 - travel) + Math.sin(u * Math.PI) * lift + bounce;
        spin.setFromAxisAngle(spinAxis, spinTurns * (1 - travel));
        die.quaternion.copy(final).multiply(spin);
      });
    });
    return Promise.all([hop, ...throws]).then(() => undefined);
  }

  private async opponentCoversDice(faces: readonly Face[]): Promise<void> {
    const positions = rowPositions(faces.length, AI_DICE_CENTER);
    this.aiDice = faces.map((face, i) => {
      const die = createDieMesh('ai');
      die.visible = false;
      die.position.copy(positions[i]);
      die.quaternion.copy(facingQuaternion(face, (Math.random() - 0.5) * 0.5));
      die.position.y = restHeight(die.quaternion);
      this.diceGroup.add(die);
      return die;
    });

    const above = new THREE.Vector3(AI_DICE_CENTER.x, 2.3, AI_DICE_CENTER.z - 0.9);
    const guard = this.guardWrist();

    // It starts from where his own hand was lying, so there is no jump when he takes it up.
    const start = this.opponentReachesOut ? this.aiHand.position.clone() : this.opponent.handWrist(1);
    this.aiHand.setVisible(true);
    this.aiHand.place(start, 0.1);
    this.aiHand.setPose('claw');
    this.opponentReachesOut = true;
    await this.moveHand(this.aiHand, start, above, 0.2, 520, easeInOutCubic);

    await this.tweens.run(1000, (t) => {
      const fade = Math.min(1, (1 - t) * 4) * Math.min(1, t * 6);
      const beat = Math.sin(t * 52) + Math.sin(t * 31 + 1) * 0.6;
      this.aiHand.place(
        new THREE.Vector3(
          above.x + beat * 0.2 * fade,
          above.y + Math.abs(Math.sin(t * 29)) * 0.24 * fade,
          above.z + Math.sin(t * 41) * 0.22 * fade,
        ),
        0.1,
        0.2 + Math.sin(t * 44) * 0.13 * fade,
      );
    });

    // Then the hand comes down and turns up on edge in front of them, like a man hiding his cards.
    this.aiHand.setPose('cover');
    const dropFrom = flatState(above.clone().add(new THREE.Vector3(0, 0, 0)), 0.3);
    await this.moveHandState(this.aiHand, dropFrom, guardState(guard), 460, easeOutCubic);
    this.aiHand.setDrumming(2.4, 0.1);
    this.coveringDice = true;
  }

  /** Where the wrist of his guarding hand sits: to our side of his dice, so the hand stands between them and us. */
  private guardWrist(): THREE.Vector3 {
    return new THREE.Vector3(AI_DICE_CENTER.x + 2.0, 0.62, AI_DICE_CENTER.z + 1.2);
  }

  private moveHandState(hand: FlatHand, from: HandState, to: HandState, durationMs: number, ease: (t: number) => number): Promise<void> {
    const wrist = new THREE.Vector3();
    const fingers = new THREE.Vector3();
    const back = new THREE.Vector3();
    return this.tweens.run(durationMs, (t) => {
      const e = ease(t);
      wrist.lerpVectors(from.wrist, to.wrist, e);
      fingers.lerpVectors(from.fingers, to.fingers, e).normalize();
      back.lerpVectors(from.back, to.back, e).normalize();
      hand.placeByAxes(wrist, fingers, back);
    });
  }

  private moveHand(
    hand: FlatHand,
    from: THREE.Vector3,
    to: THREE.Vector3,
    tilt: number,
    durationMs: number,
    ease: (t: number) => number,
  ): Promise<void> {
    const position = new THREE.Vector3();
    return this.tweens.run(durationMs, (t) => {
      const e = ease(t);
      position.lerpVectors(from, to, e);
      hand.place(position, 0.1, tilt * Math.sin(Math.min(1, e * 1.4) * Math.PI));
    });
  }

  /** The world x of the left edge of the view, at the depth of the given table z. */
  private visibleLeft(z: number): number {
    // Measured from the resting view, whatever the camera is doing at the moment.
    const direction = this.cameraTarget.clone().sub(this.cameraBase).normalize();
    const depth = new THREE.Vector3(0, 0, z).sub(this.cameraBase).dot(direction);
    return this.cameraBase.x - Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * depth;
  }

  private handleResize(): void {
    const cssWidth = this.canvas.clientWidth || 1;
    const cssHeight = this.canvas.clientHeight || 1;
    const pixelSize = Math.max(1, Math.round(cssHeight / TARGET_BUFFER_HEIGHT));
    const width = Math.max(1, Math.floor(cssWidth / pixelSize));
    const height = Math.max(1, Math.floor(cssHeight / pixelSize));

    this.renderer.setSize(width, height, false);
    this.pass.setSize(width, height, Math.max(1, Math.round(DITHER_CELL_CSS_PX / pixelSize)));
    this.camera.aspect = cssWidth / cssHeight;
    // Keep the whole table in frame on narrow screens.
    this.camera.fov = this.camera.aspect < 1.3 ? 46 : 34;
    // A lens shift, not a tilt: slides the picture down so the taller monk's head stays in frame without changing how far down we look.
    this.camera.setViewOffset(width, height, 0, -Math.round(height * 0.14), width, height);
    this.camera.updateProjectionMatrix();
  }

  private update(): void {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.05);

    this.tweens.update(delta * 1000);

    if (this.opponentReachesOut) this.opponent.setCoverHand(this.aiHand.position.clone());

    const time = this.timer.getElapsed();
    this.room.update(time);
    const flicker = this.table.update(time);
    this.candleLight.intensity = 60 * flicker;
    this.candleLight.position.set(this.table.flamePosition.x + Math.sin(time * 9) * 0.03, this.table.flamePosition.y, this.table.flamePosition.z);
    this.aiHand.update(delta, time);
    this.playerHand.update(delta, time);
    this.opponent.update(delta);

    // When the monk slams the table the whole view jolts, then settles.
    if (this.opponent.takeImpact()) this.shake = 1;
    this.shake *= Math.exp(-delta * 6);

    // Glide between the resting view and the reveal view.
    this.viewAmount += (this.viewGoal - this.viewAmount) * (1 - Math.exp(-delta * 2.6));
    const blend = this.viewAmount * this.viewAmount * (3 - 2 * this.viewAmount);
    const base = this.cameraBase.clone().lerp(this.revealPosition, blend);
    const look = this.cameraTarget.clone().lerp(this.revealTarget, blend);
    this.camera.position.set(
      base.x + (Math.random() - 0.5) * this.shake * 0.35,
      base.y + (Math.random() - 0.5) * this.shake * 0.28,
      base.z,
    );
    this.camera.lookAt(look);
  }

  start(): void {
    if (this.frameId !== null) return;
    const tick = () => {
      this.frameId = requestAnimationFrame(tick);
      this.update();
      this.pass.render(this.renderer, this.backgroundScene, this.scene, this.camera);
    };
    tick();
  }

  stop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.tweens.finishAll();
    this.resizeObserver.disconnect();
    this.pass.dispose();
    this.renderer.dispose();
  }
}
