import * as THREE from 'three';
import type { Face } from '../game/types';
import { FlatHand } from './Hands';
import { createDieMesh, facingQuaternion, restHeight } from './Die';
import { STARTING_DICE } from '../game/match';
import { AI_DICE_CENTER, OPPONENT_X, OPPONENT_Z, PLAYER_HAND_BACK, PLAYER_HAND_FINGERS, PLAYER_HAND_REST, PLAYER_ROW_SPACING, PLAYER_ROW_START, PLAYER_ROW_Z } from './layout';
import { simulateFlick } from './dicePhysics';
import type { Obstacle } from './dicePhysics';
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
  /** Your right hand, which only appears to knock on the table. */
  private readonly rightHand = new FlatHand(false, 303);
  /** His right hand, which takes over from his resting one to flick a die. */
  private readonly monkRightHand = new FlatHand(false, 304);
  private readonly raycaster = new THREE.Raycaster();
  private locks = 0;
  /** While your hand is poised to flick, the dice you can choose from, and the one you have clicked or are hovering over. */
  private flickChoices: THREE.Object3D[] | null = null;
  private flickChosen: THREE.Object3D | null = null;
  private flickHoverDie: THREE.Object3D | null = null;
  /** Where on the die the pointer is, which sets the angle of the flick. */
  private flickAimPoint: THREE.Vector3 | null = null;
  /** Run every frame while your hand is poised, so it follows the pointer smoothly rather than in fits and starts. */
  private flickTick: (() => void) | null = null;
  private flickFinish: (() => void) | null = null;
  /** An unseen hand of your size, used to measure where a fingertip lands at any angle. */
  private readonly probeHand = new FlatHand(false, 399);
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
      this.rightHand.group,
      this.monkRightHand.group,
      this.opponent.hitbox,
      this.diceGroup,
    );

    this.aiHand.setSize(0.6);
    this.rightHand.setSize(0.9);
    this.monkRightHand.setSize(0.6);
    this.probeHand.setSize(0.9);
    this.playerHand.setSize(1.0);

    this.resetHands();

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
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

  /** While the scene is playing out a move, the pointer leaves things alone. */
  private locked<T>(work: Promise<T>): Promise<T> {
    this.locks++;
    return work.finally(() => this.locks--);
  }

  rollDice(hands: { player: readonly Face[]; ai: readonly Face[] }): Promise<void> {
    return this.locked(this.doRoll(hands));
  }

  revealHands(): Promise<void> {
    return this.locked(this.doReveal());
  }

  /** Whoever lost a die flicks one off the table. */
  loseDie(by: 'player' | 'ai'): Promise<void> {
    return this.locked(this.doLoseDie(by));
  }

  private async doLoseDie(by: 'player' | 'ai'): Promise<void> {
    const monk = by === 'ai';
    const pool: THREE.Object3D[] = monk ? [...this.aiDice] : this.diceGroup.children.filter((die) => !this.aiDice.includes(die as THREE.Mesh));
    if (pool.length === 0) return;
    const hand = monk ? this.monkRightHand : this.rightHand;
    const up = new THREE.Vector3(0, 1, 0);
    const yAxis = new THREE.Vector3(0, 1, 0);

    // Each flicks across the table, along the line their hand points. He reaches in from the side, past the edge of his robe, toward you.
    // You are aiming at him, or just away from you, and your aim is never quite true.
    // His hand always comes in from his side, but the flick itself might go anywhere from across the table to straight at you.
    // Yours starts pointing straight ahead, then follows where on the die the pointer is, so you choose the angle.
    const forward = monk ? new THREE.Vector3(0.8, 0, 0.6).normalize() : new THREE.Vector3(0, 0, -1);
    const error = (Math.random() - 0.5) * (monk ? 1.0 : 0.16);

    // Measure once where the fingertip is, relative to the wrist, when the finger is straight; a hand at any strike position then touches the die with it.
    hand.setVisible(true);
    const gauge = monk ? hand : this.probeHand;
    gauge.setPose('point', true);
    const probe = new THREE.Vector3(0, 0.5, 0);
    const tipOffset = new THREE.Vector3();
    const measure = () => {
      gauge.placeByAxes(probe, forward, up);
      gauge.redraw();
      tipOffset.copy(gauge.fingertip()).sub(probe);
    };
    measure();
    const strikeAt = (at: THREE.Vector3) => new THREE.Vector3(at.x - forward.x * 0.42 - tipOffset.x, 0.5, at.z - forward.z * 0.42 - tipOffset.z);
    // Cocked, the hand is drawn back so the finger has room to whip out.
    const cockedAt = (at: THREE.Vector3) => strikeAt(at).addScaledVector(forward, -0.9);
    // Hovering, the hand comes right up to the die, fingertip just short of it.
    const nearAt = (at: THREE.Vector3) => strikeAt(at).addScaledVector(forward, -0.3);

    // While it waits for your choice, the hand hovers off to the side, up off the table where it can be seen.
    const poiseY = 0.9;
    const poiseSide = new THREE.Vector3(-forward.z * 2.3, 0, forward.x * 2.3);
    // He flicks his right-most die, which from where you sit is the one on the left; you start on your right-most.
    const rightMost = pool.reduce((a, b) => ((monk ? b.position.x < a.position.x : b.position.x > a.position.x) ? b : a));

    // The hand reaches in from its own side of the table, fingertip cocked against the thumb.
    let from: HandState;
    const firstCocked = cockedAt(rightMost.position);
    if (monk) {
      // His right hand, on the left of the picture, takes over from his own resting hand.
      const start = this.opponent.handWrist(0);
      hand.setPose('relaxed', true);
      this.opponent.setRightHandOut(true);
      from = flatState(start, 0.1);
    } else {
      hand.setPose('relaxed', true);
      from = { wrist: firstCocked.clone().addScaledVector(forward, -3.5).add(new THREE.Vector3(0, 0.4, 0)), fingers: forward, back: up };
    }
    const firstGoal = monk ? firstCocked : nearAt(rightMost.position).add(poiseSide).setY(poiseY);
    await this.moveHandState(hand, from, { wrist: firstGoal, fingers: forward, back: up }, 500, easeInOutCubic);
    hand.setPose('fist');

    let die = rightMost;
    // How far the poised hand still is from the die once you have chosen, to be closed in the build-up.
    let carry = new THREE.Vector3();
    if (!monk) {
      // Every one of your dice can be flicked: each is outlined, the outline glows under the pointer, and the hand comes to whichever die you are over.
      const outlines = pool.map((candidate) => {
        const outline = new THREE.Mesh(
          (candidate as THREE.Mesh).geometry,
          new THREE.MeshBasicMaterial({ color: 0xc9a24a, side: THREE.BackSide, transparent: true, opacity: 0.45, depthWrite: false, fog: false }),
        );
        outline.scale.setScalar(1.08);
        candidate.add(outline);
        candidate.userData.glow = 0;
        return { candidate, outline };
      });
      this.flickChoices = pool;
      this.flickChosen = null;
      this.flickHoverDie = null;
      const dim = new THREE.Color(0xc9a24a);
      const bright = new THREE.Color(0xfff2b0);
      const anchor = rightMost.position.clone();
      const handAt = new THREE.Vector3();
      let lean = 0;
      let last = performance.now();
      const step = () => {
        const nowMs = performance.now();
        const dt = Math.min(0.1, (nowMs - last) / 1000);
        last = nowMs;
        const now = nowMs / 1000;
        const hovered = this.flickHoverDie;
        if (hovered) anchor.lerp(hovered.position, 1 - Math.exp(-dt * 7));
        // Where on the die the pointer is sets the angle: dead centre, the hand faces straight ahead and the die goes straight ahead;
        // toward an edge, the hand comes at the die from that side and the flick goes from there through its middle.
        if (hovered && this.flickAimPoint) {
          const off = new THREE.Vector3(hovered.position.x - this.flickAimPoint.x, 0, hovered.position.z - this.flickAimPoint.z);
          const size = off.length();
          const weight = THREE.MathUtils.smoothstep(size, 0.08, 0.5);
          const wanted = new THREE.Vector3(0, 0, -1).multiplyScalar(1 - weight);
          if (size > 1e-4) wanted.addScaledVector(off.divideScalar(size), weight);
          forward.lerp(wanted.normalize(), 1 - Math.exp(-dt * 7)).normalize();
        }
        poiseSide.set(-forward.z * 2.3, 0, forward.x * 2.3);
        measure();
        lean += ((hovered ? 1 : 0) - lean) * (1 - Math.exp(-dt * 5));
        for (const { candidate, outline } of outlines) {
          const glow = (candidate.userData.glow += ((candidate === hovered ? 1 : 0) - candidate.userData.glow) * (1 - Math.exp(-dt * 12)));
          const material = outline.material as THREE.MeshBasicMaterial;
          material.color.copy(dim).lerp(bright, glow);
          material.opacity = 0.45 + 0.55 * glow * (0.88 + 0.12 * Math.sin(now * 10));
          outline.scale.setScalar(1.08 + 0.07 * glow);
        }
        const away = 1 - lean;
        // It only trembles while the pointer is over a die: poised and still otherwise.
        const shake = 0.06 * lean * lean;
        const place = nearAt(anchor);
        hand.placeByAxes(
          new THREE.Vector3(
            place.x + poiseSide.x * away + Math.sin(now * 80) * shake,
            place.y + (poiseY - place.y) * away + Math.abs(Math.sin(now * 61)) * shake * 0.6,
            place.z + poiseSide.z * away + Math.sin(now * 97) * shake * 0.5,
          ),
          forward,
          up,
        );
        handAt.set(place.x + poiseSide.x * away, place.y + (poiseY - place.y) * away, place.z + poiseSide.z * away);
      };
      // Driven from the frame loop, with everything eased, so the hand glides after the pointer.
      this.flickTick = step;
      await new Promise<void>((resolve) => {
        this.flickFinish = resolve;
        setTimeout(resolve, 25000);
      });
      this.flickTick = null;
      this.flickFinish = null;
      die = this.flickChosen ?? rightMost;
      measure();
      // What is left between where the hand is and where it needs to be, to be closed as it builds up.
      carry = handAt.clone().sub(cockedAt(die.position));
      for (const { candidate, outline } of outlines) {
        candidate.remove(outline);
        (outline.material as THREE.Material).dispose();
      }
      this.flickChoices = null;
      this.flickChosen = null;
      this.flickHoverDie = null;
    }

    const strike = strikeAt(die.position);
    const cocked = { wrist: cockedAt(die.position), fingers: forward, back: up };
    const launch = forward.clone().applyAxisAngle(yAxis, error);

    // The build-up: the finger is drawn back against the thumb and strains, the whole hand trembling harder as the force builds.
    const strain = monk ? 560 + Math.random() * 380 : 240;
    const phase = Math.random() * 10;
    await this.tweens.run(strain, (t) => {
      const force = t * t;
      const shake = 0.012 + 0.075 * force;
      const close = 1 - easeInOutCubic(t);
      hand.placeByAxes(
        new THREE.Vector3(
          cocked.wrist.x + carry.x * close - forward.x * 0.28 * easeInOutCubic(t) + Math.sin(t * 90 + phase) * shake,
          cocked.wrist.y + carry.y * close + Math.abs(Math.sin(t * 73 + phase)) * shake * 0.6,
          cocked.wrist.z + carry.z * close - forward.z * 0.28 * easeInOutCubic(t) + Math.sin(t * 111) * shake * 0.5,
        ),
        forward,
        up,
      );
    });

    // Work out where everything goes before it goes: the die thrown in an arc, off the table, bouncing off whatever is in its way,
    // and any dice it hits knocked along in turn.
    const props: Obstacle[] = [];
    for (const object of this.table.pickables) {
      if (object.userData.hitRadius) props.push({ object, x: object.position.x, z: object.position.z, r: object.userData.hitRadius, h: object.userData.hitHeight });
    }
    const standing = this.diceGroup.children.filter((other) => other !== die && other.visible);
    const simulation = simulateFlick(die, standing, props, launch, { object: this.opponent.hitbox, x: OPPONENT_X, z: OPPONENT_Z });

    // The flick: the finger springs free, the hand jerks forward and the die is struck at the end of it.
    hand.setPose('point');
    // The hand whips forward to the strike position, the fingertip arriving on the die.
    await this.tweens.run(90, (t) => hand.placeByAxes(cocked.wrist.clone().lerp(strike, 1 - (1 - t) ** 2), forward, up));
    this.shake = Math.max(this.shake, 0.4);
    let played = -1;
    await this.tweens.run(simulation.frameCount * 16, (t) => {
      const index = Math.min(simulation.frameCount - 1, Math.floor(t * simulation.frameCount));
      // Whatever is struck along the way reacts as it is hit.
      for (const event of simulation.events) {
        if (event.frame <= played || event.frame > index) continue;
        if (event.kind === 'monk') this.opponent.annoy(true);
        else if (event.kind === 'prop') this.wobble(event.object);
        this.shake = Math.max(this.shake, event.kind === 'die' ? 0.15 : 0.12);
      }
      played = index;
      for (const body of simulation.bodies) {
        const state = body.frames[Math.min(index, body.frames.length - 1)];
        body.object.position.copy(state.position);
        body.object.quaternion.copy(state.orientation);
        body.object.scale.setScalar(state.scale);
      }
    });
    die.visible = false;
    this.diceGroup.remove(die);
    this.aiDice = this.aiDice.filter((d) => d !== die);

    // The hand goes back where it came from.
    if (monk) {
      const home = this.opponent.restPosition(0);
      await this.moveHandState(hand, cocked, flatState(home, 0.1), 500, easeInOutCubic);
      this.opponent.releaseRightHand(home);
      hand.setVisible(false);
    } else {
      await this.moveHandState(hand, cocked, from, 450, easeInOutCubic);
      hand.setVisible(false);
    }
  }

  /** Raps on the table, with his right hand or yours, to call. */
  knockTable(by: 'player' | 'ai'): Promise<void> {
    return this.locked(by === 'ai' ? this.knockMonk() : this.knockPlayer());
  }

  private async knockMonk(): Promise<void> {
    this.opponent.knock();
    await this.tweens.run(1000, () => undefined);
  }

  private async knockPlayer(): Promise<void> {
    const up = new THREE.Vector3(0, 1, 0);
    const fingers = new THREE.Vector3(-0.35, 0, -1).normalize();
    const away: HandState = { wrist: new THREE.Vector3(7.4, 0.9, 5.6), fingers, back: up };
    const table: HandState = { wrist: new THREE.Vector3(2.4, 0.5, 3.6), fingers, back: up };
    this.rightHand.setPose('fist', true);
    this.rightHand.setVisible(true);
    await this.moveHandState(this.rightHand, away, table, 380, easeOutCubic);
    for (let i = 0; i < 2; i++) {
      await this.tweens.run(230, (t) => this.rightHand.placeByAxes(new THREE.Vector3(table.wrist.x, table.wrist.y + 0.8 * Math.sin(Math.PI * t), table.wrist.z), fingers, up));
      this.shake = Math.max(this.shake, 0.3);
    }
    await this.moveHandState(this.rightHand, table, away, 380, easeInOutCubic);
    this.rightHand.setVisible(false);
  }

  private async doRoll(hands: { player: readonly Face[]; ai: readonly Face[] }): Promise<void> {
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

  private async doReveal(): Promise<void> {
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
   * The last round's dice leave the way they arrived, played backwards: each
   * hand comes back to guard its row, and the dice slide in under it, shrinking
   * away, one after another.
   */
  private async sweepAway(): Promise<void> {
    this.viewGoal = 0;
    this.opponent.setClearOfDice(false);
    this.aiHand.setDrumming(0);
    this.playerHand.setDrumming(0);
    const monkDice = this.aiDice;
    const playerDice = this.diceGroup.children.filter((die) => !monkDice.includes(die as THREE.Mesh));
    const up = new THREE.Vector3(0, 1, 0);

    /** The reverse of slideDiceOut: each die slides toward the hand and shrinks to nothing, in the opposite order. */
    const tuckIn = (dice: readonly THREE.Object3D[], toward: THREE.Vector3, delayMs: number) => {
      const homes = dice.map((die) => die.position.clone());
      const duration = 520;
      const total = delayMs + duration + Math.max(0, dice.length - 1) * 70;
      return this.tweens.run(total, (t) => {
        dice.forEach((die, i) => {
          const start = delayMs + (dice.length - 1 - i) * 70;
          const u = THREE.MathUtils.clamp((t * total - start) / duration, 0, 1);
          if (u <= 0) return;
          const e = u * u;
          const home = homes[i];
          const to = home.clone().lerp(new THREE.Vector3(toward.x, home.y, toward.z), 0.55);
          to.y = home.y + 0.15;
          die.position.lerpVectors(home, to, e);
          die.position.y = home.y + (to.y - home.y) * e + Math.sin(u * Math.PI) * 0.22 * (1 - u);
          die.scale.setScalar(Math.max(0, 1 - e * 0.5) * (u >= 1 ? 0 : 1));
          die.visible = u < 1;
        });
      });
    };

    // His left hand goes out from where it rests, up and over, and comes down to guard his row.
    const monkStart = this.opponent.handWrist(1);
    this.aiHand.setVisible(true);
    this.aiHand.setPose('relaxed', true);
    this.opponentReachesOut = true;
    const guard = this.guardWrist();
    const lifted = new THREE.Vector3(guard.x + 0.6, 2.2, guard.z - 1.4);
    const monkReturn = (async () => {
      await this.moveHandState(this.aiHand, flatState(monkStart, 0.1), flatState(lifted, 0.25), 450, easeInOutCubic);
      this.aiHand.setPose('cover');
      await this.moveHandState(this.aiHand, flatState(lifted, 0.25), guardState(guard), 450, easeInOutCubic);
      await tuckIn(monkDice, new THREE.Vector3(guard.x - 0.8, 0, guard.z - 0.4), 100);
      for (const die of monkDice) die.visible = false;
      // Then it lifts and turns back toward the camera, ready to shake the new dice.
      await this.moveHandState(this.aiHand, guardState(guard), flatState(new THREE.Vector3(guard.x, 1.6, guard.z - 0.8), 0.1), 320, easeInOutCubic);
    })();

    // Yours comes in from the left and settles into its guard, and your dice slide under it.
    const away = this.awayState();
    const playerGuard: HandState = { wrist: PLAYER_HAND_REST.clone(), fingers: PLAYER_HAND_FINGERS.clone(), back: PLAYER_HAND_BACK.clone() };
    this.playerHand.setPose('flat');
    const playerReturn = (async () => {
      await this.moveHandState(this.playerHand, { wrist: away.wrist, fingers: away.fingers, back: up }, playerGuard, 650, easeInOutCubic);
      this.playerHand.setPose('cover');
      await tuckIn(playerDice, new THREE.Vector3(PLAYER_HAND_REST.x + 3, 0, PLAYER_HAND_REST.z + 0.5), 100);
      for (const die of playerDice) die.visible = false;
      this.playerHand.setPose('fist');
    })();
    this.playerHandAway = false;
    this.playerHandRest = playerGuard;

    await Promise.all([monkReturn, playerReturn]);
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
    const dropFrom = flatState(above.clone(), 0.3);
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

  private readonly onPointerDown = (event: PointerEvent): void => {
    const hit = this.pick(event);
    if (!hit) return;
    if (this.flickChoices) {
      this.flickChosen = hit.object;
      this.flickFinish?.();
      return;
    }
    switch (hit.kind) {
      case 'die':
        this.wiggleDie(hit.object);
        break;
      case 'tankard':
      case 'coins':
        this.wobble(hit.object);
        break;
      case 'candle':
        this.table.toggleCandle();
        break;
      case 'monk':
        this.opponent.annoy();
        break;
      case 'hand':
        hit.hand.poke();
        break;
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const hit = this.pick(event);
    this.canvas.style.cursor = hit ? 'pointer' : '';
    this.flickHoverDie = this.flickChoices && hit ? hit.object : null;
    this.flickAimPoint = this.flickChoices && hit?.point ? hit.point.clone() : null;
  };

  /** Finds what is under the pointer, undoing the lens warp the picture goes through on its way to the screen. */
  private pick(event: PointerEvent): { kind: string; object: THREE.Object3D; hand: FlatHand; point?: THREE.Vector3 } | null {
    // The one thing that can be clicked while a move is playing out is the die you are about to flick.
    if (this.locks > 0 && !this.flickChoices) return null;
    const rect = this.canvas.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    const cx = (event.clientX - rect.left) / rect.width - 0.5;
    const cy = 0.5 - (event.clientY - rect.top) / rect.height;
    const warp = (1 + 0.06 * ((cx * aspect) ** 2 + cy ** 2)) * 0.94;
    this.raycaster.setFromCamera(new THREE.Vector2(cx * warp * 2, cy * warp * 2), this.camera);

    const targets = [
      ...this.diceGroup.children,
      ...this.table.pickables,
      this.opponent.hitbox,
      this.playerHand.pickMesh,
      this.aiHand.pickMesh,
      this.rightHand.pickMesh,
      this.monkRightHand.pickMesh,
      ...this.opponent.handMeshes,
    ];
    for (const hit of this.raycaster.intersectObjects(targets, true)) {
      let shown = true;
      let picked: THREE.Object3D | null = hit.object;
      let found: { kind: string; object: THREE.Object3D } | null = null;
      let hand: FlatHand | undefined;
      while (picked) {
        if (!picked.visible) shown = false;
        if (!found && picked.userData.pick) found = { kind: picked.userData.pick, object: picked };
        if (picked.userData.hand) hand = picked.userData.hand;
        picked = picked.parent;
      }
      if (!shown) continue;
      if (this.flickChoices) {
        if (found && this.flickChoices.includes(found.object)) return { ...found, hand: this.playerHand, point: hit.point };
        continue;
      }
      if (hand) {
        // A hand is a picture on a card: only its solid parts count.
        if (hit.uv && hand.isSolidAt(hit.uv)) return { kind: 'hand', object: hit.object, hand };
        continue;
      }
      if (found) return { ...found, hand: this.playerHand };
    }
    return null;
  }

  /** The world x of the left edge of the view, at the depth of the given table z. */
  private visibleLeft(z: number): number {
    // Measured from the resting view, whatever the camera is doing at the moment.
    const direction = this.cameraTarget.clone().sub(this.cameraBase).normalize();
    const depth = new THREE.Vector3(0, 0, z).sub(this.cameraBase).dot(direction);
    return this.cameraBase.x - Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * depth;
  }

  /** A die shivers and hops, as if nudged. */
  private wiggleDie(die: THREE.Object3D): void {
    if (die.userData.wiggling) return;
    die.userData.wiggling = true;
    const base = die.quaternion.clone();
    const y = die.position.y;
    const direction = Math.random() < 0.5 ? -1 : 1;
    const turn = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    void this.tweens.run(600, (t) => {
      const decay = (1 - t) ** 2;
      turn.setFromAxisAngle(up, direction * 0.45 * Math.sin(t * 20) * decay);
      die.quaternion.copy(base).premultiply(turn);
      die.position.y = y + Math.abs(Math.sin(t * 13)) * 0.16 * decay;
    }).then(() => {
      die.quaternion.copy(base);
      die.position.y = y;
      die.userData.wiggling = false;
    });
  }

  /** Something on the table rocks and settles: the tankard, a stack of coins, the purse. */
  private wobble(object: THREE.Object3D): void {
    if (object.userData.wobbling) return;
    object.userData.wobbling = true;
    const rotation = object.rotation.clone();
    const position = object.position.clone();
    const scale = object.scale.clone();
    const direction = Math.random() < 0.5 ? -1 : 1;
    void this.tweens.run(700, (t) => {
      const decay = (1 - t) ** 2;
      const swing = Math.sin(t * 21) * decay;
      object.rotation.z = rotation.z + direction * 0.2 * swing;
      object.rotation.x = rotation.x + 0.1 * Math.sin(t * 17 + 1) * decay;
      object.position.y = position.y + Math.abs(Math.sin(t * 14)) * 0.05 * decay;
      object.scale.set(scale.x * (1 + 0.05 * swing), scale.y * (1 - 0.05 * swing), scale.z);
    }).then(() => {
      object.rotation.copy(rotation);
      object.position.copy(position);
      object.scale.copy(scale);
      object.userData.wobbling = false;
    });
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
    this.flickTick?.();
    const flicker = this.table.update(time);
    this.candleLight.intensity = 60 * flicker;
    this.candleLight.position.set(this.table.flamePosition.x + Math.sin(time * 9) * 0.03, this.table.flamePosition.y, this.table.flamePosition.z);
    this.aiHand.update(delta, time);
    this.playerHand.update(delta, time);
    this.rightHand.update(delta, time);
    this.monkRightHand.update(delta, time);
    this.opponent.update(delta);

    // When the monk slams the table the whole view jolts, then settles.
    if (this.opponent.takeImpact()) this.shake = 1;
    if (this.opponent.takeKnock()) this.shake = Math.max(this.shake, 0.3);
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
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.pass.dispose();
    this.renderer.dispose();
  }
}
