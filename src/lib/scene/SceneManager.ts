import * as THREE from 'three';
import type { Face } from '../game/types';
import { createStoneMesh, STONE_HEIGHT } from './DiceToken';
import { playRollAnimation } from './rollAnimation';

const TABLE_RADIUS = 3.4;
const TABLE_HEIGHT = 0.3;
const ROW_SPACING = 1.1;
const PLAYER_ROW_Z = 1.3;
const AI_ROW_Z = -1.3;
const PLAYER_TOSS_Z = 2.8;
const AI_TOSS_Z = -2.8;

function rowPositions(count: number, z: number): THREE.Vector3[] {
  const startX = -((count - 1) * ROW_SPACING) / 2;
  return Array.from(
    { length: count },
    (_, i) => new THREE.Vector3(startX + i * ROW_SPACING, STONE_HEIGHT / 2, z),
  );
}

/** Owns the Three.js renderer, scene, camera and render loop for the table. */
export class SceneManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly stoneGroup: THREE.Group;
  private readonly resizeObserver: ResizeObserver;
  private frameId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2a1f);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 4.4, 4.8);
    this.camera.lookAt(0, 0, 0);

    this.buildLights();
    this.buildTable();

    this.stoneGroup = new THREE.Group();
    this.scene.add(this.stoneGroup);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();
  }

  private buildLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const key = new THREE.DirectionalLight(0xfff2d8, 1.5);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.35);
    fill.position.set(-4, 3, -2);
    this.scene.add(fill);
  }

  private buildTable(): void {
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS, TABLE_HEIGHT, 64),
      new THREE.MeshStandardMaterial({ color: 0x2f5233, roughness: 0.95 }),
    );
    table.position.y = -TABLE_HEIGHT / 2;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  /** Replaces all stones on the table immediately. */
  setStones(hands: { player: readonly Face[]; ai: readonly Face[] }): void {
    this.stoneGroup.clear();
    this.placeStatic(hands.player, PLAYER_ROW_Z);
    this.placeStatic(hands.ai, AI_ROW_Z);
  }

  private placeStatic(faces: readonly Face[], z: number): void {
    rowPositions(faces.length, z).forEach((position, i) => {
      const mesh = createStoneMesh(faces[i]);
      mesh.position.copy(position);
      this.stoneGroup.add(mesh);
    });
  }

  /** Tosses both hands onto the table; resolves once every stone has settled. */
  async rollStones(
    hands: { player: readonly Face[]; ai: readonly Face[] },
    options: { hideAi?: boolean } = {},
  ): Promise<void> {
    this.stoneGroup.clear();
    const animations = [
      ...this.tossRow(hands.player, PLAYER_ROW_Z, PLAYER_TOSS_Z, false),
      ...this.tossRow(hands.ai, AI_ROW_Z, AI_TOSS_Z, options.hideAi ?? false),
    ];
    await Promise.all(animations);
  }

  private tossRow(faces: readonly Face[], restZ: number, tossZ: number, hidden: boolean): Promise<void>[] {
    const restPositions = rowPositions(faces.length, restZ);
    return faces.map((face, i) => {
      const mesh = createStoneMesh(face);
      mesh.position.set(restPositions[i].x, STONE_HEIGHT / 2, tossZ);
      this.stoneGroup.add(mesh);
      return playRollAnimation(mesh, restPositions[i], { hidden });
    });
  }

  private handleResize(): void {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.frameId !== null) return;
    const tick = () => {
      this.frameId = requestAnimationFrame(tick);
      this.renderer.render(this.scene, this.camera);
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
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
