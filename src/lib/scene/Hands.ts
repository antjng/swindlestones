import * as THREE from 'three';
import { HAND_POSES, HAND_SIZE } from './handPose';
import type { HandPose, HandPoseName } from './handPose';
import { hash2 } from './pixel';
import { Spring } from './spring';

// Drawing space: the wrist at the origin, u across the palm, v along the fingers, in the same units as HAND_SIZE.
const CARD_U = 3.6;
const CARD_V_MIN = -0.6;
const CARD_V_MAX = 6.8;
const FINGER_X = [-0.96, -0.32, 0.32, 0.96] as const;
const KNUCKLE_V = 3.15;
const FINGER_LENGTH = [0.93, 1, 0.94, 0.77] as const;
const BONE_LENGTHS = [1.32, 0.8, 0.62] as const;
const BONE_RADII = [0.31, 0.27, 0.24, 0.19] as const;
const SLACK = [0.1, 0.17, 0.2] as const;
const CURL = [1.3, 1.6, 1.1] as const;
const THUMB_LENGTHS = [1.45, 0.86, 0.66] as const;
const THUMB_RADII = [0.42, 0.34, 0.3, 0.24] as const;

// Cut from tea-stained paper and drawn over in pen: muted, flat tones, nothing glossy.
const [INK, DEEP, SHADE, BASE, LIGHT, NAIL] = ['#1a120a', '#3a2c1e', '#7a6852', '#a8977c', '#bcae94', '#cfc4ac'];
const PALETTE = [INK, SHADE, BASE, LIGHT, NAIL].map((hex) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
});

/** The direction from the table toward the camera, roughly: a hand lying flat leans a little toward it so it reads as a drawing, not a sliver. */
const TOWARD_CAMERA = new THREE.Vector3(0, 0.35, 0.94).normalize();

interface Joint {
  u: number;
  v: number;
  /** Height above the palm, only used to decide what overlaps what. */
  z: number;
}

/**
 * A hand drawn each frame as ink-outlined pixel art (dark outline, three skin
 * tones, dithered shadow) onto a small nearest-filtered card, then stood in the
 * scene like a cut-out. The fingers are a proper jointed skeleton, driven by
 * springs, so all the motion is procedural. It hangs from the wrist; the
 * fingers point toward +z before yaw.
 */
export class FlatHand {
  readonly group = new THREE.Group();
  private readonly pivot = new THREE.Group();
  /** The hand's own shadow: its silhouette, projected from the lantern onto the table. */
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly shadowGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly shadowCanvas = document.createElement('canvas');
  private shadowTexture: THREE.CanvasTexture;
  private lean = 0.12;
  private readonly card: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private readonly wrist = new THREE.Vector3();
  private scale = 1;
  /** A further shrink of the drawn card, cheaper than resizing: lets a hand ease between sizes. */
  private factor = 1;
  private pixelsPerUnit = 20;
  private palmView = false;

  private pose: HandPose = HAND_POSES.relaxed;
  private readonly flex = [0, 0, 0, 0].map(() => new Spring(0.2, 150, 13));
  private readonly joints = [0, 0, 0, 0].map(() => [new Spring(0, 90, 11), new Spring(0, 62, 9), new Spring(0, 44, 8)]);
  private readonly spread = new Spring(0.5, 60, 10);
  private readonly thumbTuck = new Spring(0.4, 70, 10);
  private readonly thumbJoints = [new Spring(0, 80, 10), new Spring(0, 55, 9)];
  private drum = { speed: 0, amount: 0 };
  private fidget = 0;
  private visible = false;

  constructor(private readonly mirrored = false, private readonly seed = 1) {
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: false });
    this.texture = new THREE.CanvasTexture(this.canvas);
    const geometry = new THREE.PlaneGeometry(CARD_U * 2, CARD_V_MAX - CARD_V_MIN);
    geometry.translate(0, (CARD_V_MAX + CARD_V_MIN) / 2, 0);
    this.card = new THREE.Mesh(geometry, this.material);
    this.pivot.add(this.card);

    this.shadowTexture = new THREE.CanvasTexture(this.shadowCanvas);
    this.shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, alphaTest: 0.01, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadow.frustumCulled = false;
    shadow.renderOrder = -1;

    this.group.add(shadow, this.pivot);
    this.group.visible = false;
    this.setSize(1);
    this.setPose(HAND_POSES.relaxed, true);
  }

  /** Lays the hand out from where its fingers point and which way the back of it faces. */
  placeByAxes(wrist: THREE.Vector3, fingers: THREE.Vector3, back: THREE.Vector3): void {
    const f = fingers.clone().normalize();
    let n = back.clone().sub(f.clone().multiplyScalar(back.dot(f))).normalize();

    // Seen from behind, the card would show the wrong side: draw the palm instead.
    this.palmView = n.dot(TOWARD_CAMERA) < 0;
    if (this.palmView) n.negate();

    const lean = this.lean * Math.max(0, n.y) ** 2;
    n.addScaledVector(TOWARD_CAMERA, lean).normalize();
    f.sub(n.clone().multiplyScalar(f.dot(n))).normalize();
    const x = new THREE.Vector3().crossVectors(f, n);
    this.pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, f, n));

    // Leaning can dip the fingertips through the table; lift the whole hand clear of it.
    const size = this.scale * this.factor;
    const reach = (HAND_SIZE.palmLength + HAND_SIZE.fingerLength) * size;
    const lowest = Math.min(f.y * reach, f.y * reach * 0.5 - Math.abs(x.y) * 1.3 * size, -Math.abs(x.y) * 1.3 * size);
    this.pivot.position.copy(wrist);
    this.pivot.position.y += Math.max(0, 0.05 - (wrist.y + lowest));
    this.wrist.copy(wrist);

    this.projectShadow();
  }

  /** The simple case: lying palm down, fingers toward the camera, turned by `yaw` and tipped by `tilt` (negative stands it on end). */
  place(wrist: THREE.Vector3, yaw = 0, tilt = 0): void {
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ'));
    this.placeByAxes(wrist, new THREE.Vector3(0, 0, 1).applyQuaternion(turn), new THREE.Vector3(0, 1, 0).applyQuaternion(turn));
  }

  get position(): THREE.Vector3 {
    return this.wrist;
  }

  setPose(pose: HandPose | HandPoseName, immediately = false): void {
    this.pose = typeof pose === 'string' ? HAND_POSES[pose] : pose;
    if (immediately) {
      this.flex.forEach((spring, i) => spring.snapTo(this.pose.flex[i]));
      this.spread.snapTo(this.pose.spread);
      this.thumbTuck.snapTo(this.pose.thumb);
      this.step(0, 0);
      this.draw();
    }
  }

  setFidget(amount: number): void {
    this.fidget = amount;
  }

  /** Makes the fingers tap the table in turn. */
  setDrumming(speed: number, amount = 0.5): void {
    this.drum = { speed, amount: speed > 0 ? amount : 0 };
  }

  update(deltaSeconds: number, timeSeconds: number): void {
    if (!this.visible) return;
    this.step(deltaSeconds, timeSeconds);
    this.draw();
  }

  /** Scales the whole hand about its wrist. */
  setSize(scale: number): void {
    this.scale = scale;
    this.card.scale.setScalar(scale * this.factor);
    // One art pixel is about two screen pixels, whatever the hand's size.
    this.pixelsPerUnit = Math.max(7, Math.round(22 * scale));
    this.canvas.width = Math.ceil(CARD_U * 2 * this.pixelsPerUnit);
    this.canvas.height = Math.ceil((CARD_V_MAX - CARD_V_MIN) * this.pixelsPerUnit);
    this.texture.dispose();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material.map = this.texture;
    this.material.needsUpdate = true;
    this.shadowCanvas.width = this.canvas.width;
    this.shadowCanvas.height = this.canvas.height;
    this.shadowTexture.dispose();
    this.shadowTexture = new THREE.CanvasTexture(this.shadowCanvas);
    this.shadowTexture.magFilter = THREE.NearestFilter;
    this.shadowTexture.minFilter = THREE.NearestFilter;
    this.shadowTexture.generateMipmaps = false;
    this.shadowMaterial.map = this.shadowTexture;
    this.shadowMaterial.needsUpdate = true;
    if (this.visible) this.draw();
  }

  /** How far a hand lying flat leans up toward the camera, so it doesn't look pressed into the table. */
  setLean(amount: number): void {
    this.lean = amount;
  }

  /** Lays the card's outline onto the table along the light's direction, corner by corner. */
  private projectShadow(): void {
    this.card.updateWorldMatrix(true, false);
    const corners = [
      [-CARD_U, CARD_V_MAX],
      [CARD_U, CARD_V_MAX],
      [-CARD_U, CARD_V_MIN],
      [CARD_U, CARD_V_MIN],
    ];
    const positions = this.shadowGeometry.getAttribute('position');
    const point = new THREE.Vector3();
    let height = 0;
    corners.forEach(([u, v], i) => {
      this.card.localToWorld(point.set(u, v, 0));
      const h = Math.max(0, point.y - 0.03);
      height += h / 4;
      // The lantern hangs above and a little behind-left, so shadows fall forward and to the right.
      positions.setXYZ(i, point.x + h * 0.32, 0.03, point.z + h * 0.28);
    });
    positions.needsUpdate = true;
    this.shadowMaterial.opacity = THREE.MathUtils.clamp(0.55 - height * 0.1, 0.12, 0.55);
  }

  /** Draws the hand at a fraction of its size; the shadow and lift follow on the next placement. */
  scaleTo(factor: number): void {
    this.factor = factor;
    this.card.scale.setScalar(this.scale * factor);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.group.visible = visible;
  }

  private angles: number[][] = [0, 1, 2, 3].map(() => [0, 0, 0]);
  private fan = [0, 0, 0, 0];
  private thumbAngle = 0;
  private thumbBends = [0, 0];

  private step(dt: number, time: number): void {
    const spread = dt === 0 ? this.spread.value : this.spread.update(dt, this.pose.spread + 0.05 * Math.sin(time * 0.6));
    const tuck = dt === 0 ? this.thumbTuck.value : this.thumbTuck.update(dt, this.pose.thumb);

    for (let i = 0; i < 4; i++) {
      // Taps are never a metronome: each finger has its own rate, drifting phase and accent.
      let tap = 0;
      if (this.drum.speed > 0) {
        const phase = time * this.drum.speed * (1 + 0.11 * i) + i * 2.3 + 1.7 * Math.sin(time * 0.45 + i * 1.9);
        const accent = 0.65 + 0.35 * Math.sin(time * 0.31 + i * 5.1);
        tap = Math.max(0, Math.sin(phase)) ** 2 * this.drum.amount * accent;
      }
      const idle = this.fidget * 0.06 * (Math.sin(time * 0.83 + i * 2.7) + Math.sin(time * 1.9 + i * 4.1) * 0.6);
      const flex = dt === 0 ? this.flex[i].value : this.flex[i].update(dt, this.pose.flex[i] + tap + idle);
      const lift = THREE.MathUtils.clamp(flex, -0.12, 1.05);
      for (let k = 0; k < 3; k++) {
        const target = lift * CURL[k] + SLACK[k] + this.fidget * 0.04 * Math.sin(time * 0.7 + i * 1.9 + k * 0.8);
        if (dt === 0) this.joints[i][k].snapTo(target);
        this.angles[i][k] = dt === 0 ? target : this.joints[i][k].update(dt, target);
      }
      this.fan[i] = (i - 1.5) * spread * 0.17;
    }

    this.thumbAngle = -0.95 + tuck * 1.3;
    for (let k = 0; k < 2; k++) {
      const target = 0.1 + tuck * 0.35 + k * 0.08;
      if (dt === 0) this.thumbJoints[k].snapTo(target);
      this.thumbBends[k] = dt === 0 ? target : this.thumbJoints[k].update(dt, target);
    }
  }

  private draw(): void {
    const { ctx, canvas, pixelsPerUnit: ppu } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // The thumb sits on the near side of a right hand seen from behind; seen from the palm, it flips.
    const m = this.mirrored !== this.palmView ? -1 : 1;
    const X = (u: number) => W / 2 + m * u * ppu;
    const Y = (v: number) => H - (v - CARD_V_MIN) * ppu;
    const outline = Math.max(1, ppu * 0.06);

    const stroke = (points: readonly { u: number; v: number }[], width: number, color: string, dx = 0, dy = 0) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, width * ppu);
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.u) + dx * ppu, Y(p.v) + dy * ppu) : ctx.lineTo(X(p.u) + dx * ppu, Y(p.v) + dy * ppu)));
      ctx.stroke();
    };
    const polygon = (points: readonly (readonly [number, number])[], color: string, inset = 0, dx = 0, dy = 0, grow = 0) => {
      const cu = points.reduce((s, p) => s + p[0], 0) / points.length;
      const cv = points.reduce((s, p) => s + p[1], 0) / points.length;
      ctx.beginPath();
      points.forEach(([u, v], i) => {
        const d = Math.hypot(u - cu, v - cv) || 1;
        const k = (d - inset) / d;
        const px = X(cu + (u - cu) * k) + dx * ppu;
        const py = Y(cv + (v - cv) * k) + dy * ppu;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      if (grow > 0) {
        ctx.strokeStyle = color;
        ctx.lineWidth = grow * 2;
        ctx.stroke();
      }
    };

    const palm: readonly (readonly [number, number])[] = [
      [-0.8, 0],
      [-1.3, 0.55],
      [-1.55, 1.4],
      [-1.42, 2.3],
      [-1.32, 3.15],
      [-0.3, 3.32],
      [0.7, 3.3],
      [1.32, 3.1],
      [1.3, 2.2],
      [1.22, 1.1],
      [0.85, 0],
    ];

    // Each finger as a chain of joints; curling foreshortens it, as a hand seen from above does.
    const chains = FINGER_X.map((rootU, i) => {
      const joints: Joint[] = [{ u: rootU, v: KNUCKLE_V, z: 0 }];
      let theta = 0;
      for (let k = 0; k < 3; k++) {
        theta += this.angles[i][k];
        const length = BONE_LENGTHS[k] * FINGER_LENGTH[i];
        const flat = length * Math.cos(Math.min(theta, 2.4));
        const last = joints[k];
        joints.push({ u: last.u + Math.sin(this.fan[i]) * flat, v: last.v + Math.cos(this.fan[i]) * flat, z: last.z - length * Math.sin(theta) });
      }
      return { joints, theta };
    });
    const thumb: Joint[] = [{ u: -0.85, v: 0.95, z: 0 }];
    {
      let angle = this.thumbAngle;
      THUMB_LENGTHS.forEach((length, k) => {
        if (k > 0) angle += this.thumbBends[k - 1];
        const last = thumb[k];
        thumb.push({ u: last.u + Math.sin(angle) * length, v: last.v + Math.cos(angle) * length, z: 0 });
      });
    }

    // Everything's silhouette first, in ink, so the hand reads as one drawn shape.
    polygon(palm, INK, 0, 0, 0, outline);
    chains.forEach(({ joints }) => joints.slice(1).forEach((p, k) => stroke([joints[k], p], (BONE_RADII[k] + BONE_RADII[k + 1]) + (outline * 2) / ppu, INK)));
    thumb.slice(1).forEach((p, k) => stroke([thumb[k], p], THUMB_RADII[k] + THUMB_RADII[k + 1] + (outline * 2) / ppu, INK));

    const limb = (points: readonly Joint[], radii: readonly number[], first: number) => {
      for (let k = first; k < points.length - 1; k++) {
        const w = radii[k] + radii[k + 1];
        stroke([points[k], points[k + 1]], w, SHADE);
        stroke([points[k], points[k + 1]], w * 0.74, BASE, -w * 0.1, w * 0.05);
        const a = points[k];
        const b = points[k + 1];
        const inset = (t: number) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
        void inset;
      }
    };

    const thumbOver = this.thumbTuck.value > 0.55;
    if (!thumbOver) limb(thumb, THUMB_RADII, 0);
    polygon(palm, SHADE);
    polygon(palm, BASE, 0.12, -0.14, 0.06);
    // Pen hatching down the shaded side.
    for (let h = 0; h < 6; h++) {
      const v = 0.35 + h * 0.5;
      stroke([{ u: 0.7 + (hash2(h, 3, this.seed) - 0.5) * 0.1, v }, { u: 1.2, v: v + 0.32 }], 0.05, DEEP);
    }
    // The base of the thumb swells into the palm.
    if (this.palmView) {
      // Creases across the palm.
      stroke([{ u: -1.1, v: 1.9 }, { u: -0.3, v: 1.55 }, { u: 0.6, v: 1.85 }], 0.06, SHADE);
      stroke([{ u: -1.05, v: 2.5 }, { u: 0, v: 2.35 }, { u: 1.0, v: 2.6 }], 0.06, SHADE);
    }
    if (!this.palmView) {
      // The back of the hand: tendons running to the knuckles.
      FINGER_X.forEach((u, i) => stroke([{ u: u * 0.6, v: 0.5 }, { u, v: KNUCKLE_V - 0.25 }], 0.04, DEEP));
    }
    [...chains].sort((a, b) => a.theta - b.theta).forEach(({ joints }, order) => {
      void order;
      limb(joints, BONE_RADII, 0);
    });
    if (thumbOver) limb(thumb, THUMB_RADII, 0);

    // Fine ink: a line along each finger's far side, and a crease at its middle knuckle.
    chains.forEach(({ joints, theta }, i) => {
      const side = joints.map((p, k) => ({ u: p.u + BONE_RADII[k] * 0.92, v: p.v }));
      if (i < 3) stroke(side.slice(0, 3), 0.045, DEEP);
      // A knuckle bump at the base of the finger.
      if (!this.palmView) stroke([{ u: joints[0].u - 0.12, v: joints[0].v }, { u: joints[0].u + 0.12, v: joints[0].v }], 0.05, DEEP);
      const p = joints[1];
      stroke([{ u: p.u - BONE_RADII[1] * 0.7, v: p.v }, { u: p.u + BONE_RADII[1] * 0.7, v: p.v }], 0.04, SHADE);
      // A nail, if the fingertip is still turned up to us.
      if (!this.palmView && theta < 1.6) {
        const tip = joints[3];
        const knuckle = joints[2];
        const at = (t: number) => ({ u: knuckle.u + (tip.u - knuckle.u) * t, v: knuckle.v + (tip.v - knuckle.v) * t });
        stroke([at(0.32), at(0.94)], BONE_RADII[3] * 1.15, NAIL, 0, 0);
      }
    });
    if (!this.palmView) {
      const tip = thumb[3];
      const knuckle = thumb[2];
      stroke([{ u: knuckle.u + (tip.u - knuckle.u) * 0.45, v: knuckle.v + (tip.v - knuckle.v) * 0.45 }, { u: knuckle.u + (tip.u - knuckle.u) * 0.9, v: knuckle.v + (tip.v - knuckle.v) * 0.9 }], 0.22, NAIL);
    }

    this.quantise(W, H);
    this.texture.needsUpdate = true;
  }

  /** Snaps every pixel to the palette, with no soft edges, and dithers the shadow into the base tone. */
  private quantise(W: number, H: number): void {
    const image = this.ctx.getImageData(0, 0, W, H);
    const data = image.data;
    const shadow = this.shadowCanvas.getContext('2d')!;
    const shadowImage = shadow.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (data[i + 3] < 110) {
          data[i + 3] = 0;
          continue;
        }
        let best = 0;
        let bestDistance = Infinity;
        for (let p = 0; p < PALETTE.length; p++) {
          const d = (data[i] - PALETTE[p][0]) ** 2 + (data[i + 1] - PALETTE[p][1]) ** 2 + (data[i + 2] - PALETTE[p][2]) ** 2;
          if (d < bestDistance) {
            bestDistance = d;
            best = p;
          }
        }
        // Shadow is a checker of shade and base; a scatter of ink hatching sits in it.
        if (best === 1) best = (x + y) % 2 === 0 ? 2 : hash2(x, y, this.seed) < 0.16 ? 0 : 1;
        // Paper fibre: flecks of a lighter and a darker sheet, in short horizontal runs.
        else if (best === 2) {
          const fibre = hash2(x >> 1, y, this.seed + 9);
          if (fibre < 0.1) best = 3;
          else if (fibre > 0.94) best = 1;
        }
        data[i] = PALETTE[best][0];
        data[i + 1] = PALETTE[best][1];
        data[i + 2] = PALETTE[best][2];
        data[i + 3] = 255;
        shadowImage.data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(image, 0, 0);
    shadow.putImageData(shadowImage, 0, 0);
    this.shadowTexture.needsUpdate = true;
  }
}
