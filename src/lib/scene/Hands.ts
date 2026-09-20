import * as THREE from 'three';
import { HAND_SIZE, HandRig } from './HandRig';
import type { HandPose, HandPoseName } from './HandRig';

let blobTexture: THREE.CanvasTexture | null = null;

function getBlobTexture(): THREE.CanvasTexture {
  if (!blobTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(0,0,0,0.9)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    blobTexture = new THREE.CanvasTexture(canvas);
  }
  return blobTexture;
}

/** A hand lying flat on the table with a blob shadow. Hangs from the wrist; the fingers point toward +z before yaw. */
export class FlatHand {
  readonly group = new THREE.Group();
  readonly rig: HandRig;
  private readonly pivot = new THREE.Group();
  private readonly shadowPivot = new THREE.Group();
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly wrist = new THREE.Vector3();

  constructor(mirrored = false) {
    this.rig = new HandRig(mirrored);
    this.rig.group.rotation.x = -Math.PI / 2;
    this.pivot.rotation.order = 'YXZ';
    this.pivot.add(this.rig.group);

    const length = HAND_SIZE.palmLength + HAND_SIZE.fingerLength;
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: getBlobTexture(), transparent: true, opacity: 0.5, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(HAND_SIZE.palmWidth * 1.35, length * 0.95), this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.z = length * 0.5;
    this.shadowPivot.add(shadow);

    this.group.add(this.shadowPivot, this.pivot);
    this.group.visible = false;
  }

  place(wrist: THREE.Vector3, yaw = 0, tilt = 0): void {
    this.wrist.copy(wrist);
    this.pivot.position.copy(wrist);
    this.pivot.rotation.set(tilt, yaw, 0);

    this.shadowPivot.position.set(wrist.x + wrist.y * 0.14, 0.03, wrist.z + wrist.y * 0.22);
    this.shadowPivot.rotation.set(0, yaw, 0);
    this.shadowMaterial.opacity = THREE.MathUtils.clamp(0.55 - wrist.y * 0.1, 0.12, 0.55);
  }

  get position(): THREE.Vector3 {
    return this.wrist;
  }

  setPose(pose: HandPose | HandPoseName, immediately = false): void {
    this.rig.setPose(pose, immediately);
  }

  setDrumming(speed: number, amount?: number): void {
    this.rig.setDrumming(speed, amount);
  }

  update(deltaSeconds: number, timeSeconds: number): void {
    this.rig.update(deltaSeconds, timeSeconds);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
