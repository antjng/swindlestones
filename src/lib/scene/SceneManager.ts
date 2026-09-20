import * as THREE from 'three';
import type { Face } from '../game/types';
import { FlatHand } from './Hands';
import { DIE_REST_HEIGHT, createDieMesh, restingQuaternion } from './Die';
import { AI_DICE_CENTER, OPPONENT_X, PLAYER_DICE_CENTER, PLAYER_HAND_REST } from './layout';
import { Opponent } from './Opponent';
import type { OpponentMood } from './Opponent';
import { PixelPass } from './post';
import { buildRoom } from './Room';
import { buildTable } from './Table';
import { Tweens, easeInCubic, easeInOutCubic, easeOutCubic } from './tween';

export type { OpponentMood } from './Opponent';

const HAND_COVER_HEIGHT = 0.85;

const COVER_WRIST_BEHIND = 2.0;
const HAND_HOME = new THREE.Vector3(OPPONENT_X - 1.0, 2.6, AI_DICE_CENTER.z - 4.4);

const TARGET_BUFFER_HEIGHT = 560;

const DITHER_CELL_CSS_PX = 2;

function clusterPositions(count: number, center: THREE.Vector3, spacing: number): THREE.Vector3[] {
  if (count === 1) return [new THREE.Vector3(center.x, DIE_REST_HEIGHT, center.z)];
  const radius = spacing / Math.sin(Math.PI / count);
  const offset = Math.random() * Math.PI * 2;
  return Array.from({ length: count }, (_, i) => {
    const angle = offset + (i / count) * Math.PI * 2;
    return new THREE.Vector3(center.x + Math.cos(angle) * radius, DIE_REST_HEIGHT, center.z + Math.sin(angle) * radius);
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
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pass = new PixelPass();
  private readonly opponent = new Opponent();
  private readonly aiHand = new FlatHand();
  private readonly playerHand = new FlatHand(true);
  private readonly diceGroup = new THREE.Group();
  private readonly tweens = new Tweens();
  private readonly resizeObserver: ResizeObserver;
  private readonly timer = new THREE.Timer();
  private aiDice: THREE.Mesh[] = [];
  private opponentReachesOut = false;
  private coveringDice = false;
  private frameId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060402);
    this.scene.fog = new THREE.FogExp2(0x060402, 0.014);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 8, 7.4);
    this.camera.lookAt(0, 0, -4.6);

    this.scene.add(new THREE.HemisphereLight(0xa8988a, 0x2a1e16, 0.7));
    const table = buildTable();
    this.scene.add(
      buildRoom(table.flamePosition),
      table.group,
      this.opponent.group,
      this.aiHand.group,
      this.playerHand.group,
      this.diceGroup,
    );
    this.resetHands();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();
  }

  private resetHands(): void {
    this.playerHand.place(PLAYER_HAND_REST, Math.PI);
    this.playerHand.setPose('relaxed', true);
    this.playerHand.setDrumming(1.4, 0.12);
    this.playerHand.setVisible(true);
    this.aiHand.setVisible(false);
    this.aiHand.setDrumming(0);
    this.opponentReachesOut = false;
    this.coveringDice = false;
    this.opponent.setCoverHand(null);
  }

  setOpponentMood(mood: OpponentMood): void {
    this.opponent.setMood(mood);
  }

  speak(seconds: number): void {
    this.opponent.speak(seconds);
  }

  /** Lifts the far edge of his hand for a glance at his dice. The gap opens away from the camera, so the dice stay hidden. */
  async peekAtDice(): Promise<void> {
    if (!this.coveringDice) return;
    this.opponent.glanceAt(AI_DICE_CENTER, 1.6);
    const rest = this.aiHand.position.clone();
    const length = 4.4;
    await this.tweens.run(1100, (t) => {
      const lift = Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.55;
      if (!this.coveringDice) return;
      this.aiHand.place(new THREE.Vector3(rest.x, rest.y + lift, rest.z), 0.1, Math.asin(lift / length));
    });
  }

  clearDice(): void {
    this.tweens.finishAll();
    this.diceGroup.clear();
    this.aiDice = [];
    this.resetHands();
  }

  async rollDice(hands: { player: readonly Face[]; ai: readonly Face[] }): Promise<void> {
    this.clearDice();
    await Promise.all([this.throwPlayerDice(hands.player), this.opponentCoversDice(hands.ai)]);
  }

  async revealHands(): Promise<void> {
    for (const die of this.aiDice) die.visible = true;

    this.coveringDice = false;
    this.aiHand.setDrumming(0);
    const covering = this.aiHand.position.clone();
    const lifted = new THREE.Vector3(covering.x + 2.2, 1.3, covering.z - 0.5);
    this.aiHand.setPose('flat');
    await this.moveHand(this.aiHand, covering, lifted, 0.25, 450, easeOutCubic);
    this.aiHand.setPose('relaxed');
    await this.moveHand(this.aiHand, lifted, HAND_HOME, 0, 450, easeInOutCubic);

    this.aiHand.setVisible(false);
    this.opponentReachesOut = false;
    this.opponent.setCoverHand(null);
  }

  private throwPlayerDice(faces: readonly Face[]): Promise<void> {
    const targets = clusterPositions(faces.length, PLAYER_DICE_CENTER, 0.62);
    const resting = PLAYER_HAND_REST.clone();

    this.playerHand.setPose('claw');
    this.playerHand.setDrumming(0);
    let released = false;
    const hop = this.tweens.run(560, (t) => {
      const lift = Math.sin(t * Math.PI) * 1.0;
      this.playerHand.place(new THREE.Vector3(resting.x, resting.y + lift, resting.z - Math.sin(t * Math.PI) * 0.5), Math.PI, -lift * 0.06);
      if (t > 0.42 && !released) {
        released = true;
        this.playerHand.setPose('flat');
      }
      if (t >= 1) {
        this.playerHand.setPose('relaxed');
        this.playerHand.setDrumming(1.4, 0.12);
      }
    });

    const throws = faces.map((face, i) => {
      const die = createDieMesh('player');
      this.diceGroup.add(die);

      const target = targets[i];
      const start = new THREE.Vector3(resting.x + 0.9 + Math.random() * 0.8, 1.7, resting.z - 4.1 + Math.random() * 0.8);
      const final = restingQuaternion(face, Math.random() * Math.PI * 2);
      const spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const spinTurns = (2 + Math.random() * 2) * Math.PI * 2;
      const lift = 1.2 + Math.random() * 0.6;
      const spin = new THREE.Quaternion();
      die.position.copy(start);
      die.visible = false;

      return this.tweens.run(1000 + i * 70, (t) => {
        const delay = 0.2 + i * 0.03;
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
    const positions = clusterPositions(faces.length, AI_DICE_CENTER, 0.56);
    this.aiDice = faces.map((face, i) => {
      const die = createDieMesh('ai');
      die.visible = false;
      die.position.copy(positions[i]);
      die.quaternion.copy(restingQuaternion(face, Math.random() * Math.PI * 2));
      this.diceGroup.add(die);
      return die;
    });

    const above = new THREE.Vector3(AI_DICE_CENTER.x, 2.3, AI_DICE_CENTER.z - COVER_WRIST_BEHIND - 0.5);
    const over = new THREE.Vector3(AI_DICE_CENTER.x, HAND_COVER_HEIGHT, AI_DICE_CENTER.z - COVER_WRIST_BEHIND);

    this.aiHand.setVisible(true);
    this.aiHand.place(HAND_HOME, 0.1);
    this.aiHand.setPose('claw', true);
    this.opponentReachesOut = true;
    await this.moveHand(this.aiHand, HAND_HOME, above, 0.2, 520, easeInOutCubic);

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

    this.aiHand.setPose('press');
    await this.moveHand(this.aiHand, above, new THREE.Vector3(above.x, above.y + 0.3, above.z - 0.2), 0, 160, easeOutCubic);
    await this.moveHand(this.aiHand, new THREE.Vector3(above.x, above.y + 0.3, above.z - 0.2), over, 0, 220, easeInCubic);
    await this.tweens.run(160, (t) => {
      this.aiHand.place(new THREE.Vector3(over.x, over.y + Math.sin(t * Math.PI) * 0.14, over.z), 0.1);
    });
    this.aiHand.setPose('cover');
    this.aiHand.setDrumming(2.4, 0.1);
    this.coveringDice = true;
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
    this.camera.fov = this.camera.aspect < 1.3 ? 66 : 50;
    this.camera.updateProjectionMatrix();
  }

  private update(): void {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.05);

    this.tweens.update(delta * 1000);

    if (this.opponentReachesOut) this.opponent.setCoverHand(this.aiHand.position.clone());

    const time = this.timer.getElapsed();
    this.aiHand.update(delta, time);
    this.playerHand.update(delta, time);
    this.opponent.update(delta);
  }

  start(): void {
    if (this.frameId !== null) return;
    const tick = () => {
      this.frameId = requestAnimationFrame(tick);
      this.update();
      this.pass.render(this.renderer, this.scene, this.camera);
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
