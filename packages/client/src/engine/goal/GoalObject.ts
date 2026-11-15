/**
 * The Offered Grade (Megajánlott jegy), CP09 T1: a rolled diploma with a red ribbon and a gold
 * seal, floating, turning and glowing in the goal room. It lives in the goal room's scene, so
 * every portal pass shows it exactly like the main view (one `update(t)` per frame).
 */
import * as THREE from 'three';

/** Bob height (m), period (s), yaw speed (rad/s) and tilt (rad), CP09 T1.3. */
export const GOAL_BOB = 0.08;
export const GOAL_BOB_PERIOD = 3;
export const GOAL_YAW_SPEED = 0.6;
export const GOAL_TILT = (10 * Math.PI) / 180;
/** Warm gold of the seal, ribbon edges, halo and sparkles. */
export const GOAL_GOLD = '#ffcf6b';
/** Halo sprite width (m). */
export const HALO_SIZE = 1.4;
/** Width of the hot inner glow (m): the halo's core, so the goal outshines lamps and walls. */
export const CORE_SIZE = 0.6;
/** Sparkles and their orbit radius (m). */
export const SPARKLES = 20;
export const SPARKLE_RADIUS = 0.6;
/** The goal light pulses ±15 % with the bob. */
export const LIGHT_PULSE = 0.15;
/** Pickup animation length (s). */
export const PICKUP_SECONDS = 0.6;

const LENGTH = 0.45;
const RADIUS = 0.045;

/**
 * A soft radial alpha texture: white, opaque out to `plateau` (fraction of the radius), then
 * falling off to the edge with `power`.
 */
export function radialTexture(size: number, power: number, plateau = 0): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / c);
      const a = d <= plateau ? 1 : Math.pow((1 - d) / (1 - plateau), power);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A five-pointed star outline (the seal's relief). */
function starShape(outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/** Sparkle orbits: radius, height, speed and phase per particle (deterministic). */
function sparkleOrbits(): { r: number; h: number; speed: number; phase: number }[] {
  const out: { r: number; h: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < SPARKLES; i++) {
    // Golden-angle spread; no randomness so every pass and every test sees the same picture.
    const f = (i + 0.5) / SPARKLES;
    out.push({
      r: SPARKLE_RADIUS * (0.45 + 0.55 * ((i * 0.618) % 1)),
      h: (f - 0.5) * 0.7,
      speed: 0.25 + 0.2 * ((i * 0.382) % 1),
      phase: i * 2.39996,
    });
  }
  return out;
}

export class GoalObject {
  /** At the goal position; the diploma bobs inside it. */
  readonly group = new THREE.Group();
  /** The diploma (tilted, turning). */
  readonly model = new THREE.Group();
  readonly halo: THREE.Sprite;
  /** A smaller, nearly white sprite at the halo's centre. */
  readonly core: THREE.Sprite;
  readonly sparkles: THREE.Points;
  private readonly orbits = sparkleOrbits();
  private readonly baseLight: number;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly textures: THREE.Texture[] = [];
  private pickupProgress = 0;

  constructor(
    readonly base: { x: number; y: number; z: number },
    /** The room's `goal` light, pulsing with the bob. */
    private readonly light: THREE.PointLight | null = null,
  ) {
    this.group.name = 'goal';
    this.group.position.set(base.x, base.y, base.z);
    this.baseLight = light?.intensity ?? 0;
    this.buildModel();

    const haloTexture = radialTexture(64, 2.2);
    this.textures.push(haloTexture);
    const haloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      color: GOAL_GOLD,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Sprite(haloMaterial);
    this.halo.name = 'goal:halo';
    this.halo.scale.set(HALO_SIZE, HALO_SIZE, 1);
    this.materials.push(haloMaterial);

    const coreTexture = radialTexture(32, 1.5, 0.35);
    this.textures.push(coreTexture);
    const coreMaterial = new THREE.SpriteMaterial({
      map: coreTexture,
      color: '#fff6e0',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.core = new THREE.Sprite(coreMaterial);
    this.core.name = 'goal:core';
    this.core.scale.set(CORE_SIZE, CORE_SIZE, 1);
    this.materials.push(coreMaterial);

    const sparkleTexture = radialTexture(16, 1.5);
    this.textures.push(sparkleTexture);
    const positions = new Float32Array(SPARKLES * 3);
    const sparkleGeometry = new THREE.BufferGeometry();
    sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const sparkleMaterial = new THREE.PointsMaterial({
      map: sparkleTexture,
      color: GOAL_GOLD,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkles = new THREE.Points(sparkleGeometry, sparkleMaterial);
    this.sparkles.name = 'goal:sparkles';
    this.geometries.push(sparkleGeometry);
    this.materials.push(sparkleMaterial);

    this.group.add(this.model, this.halo, this.core, this.sparkles);
    // Rooms render with oblique projections, where Three.js frustum culling would be wrong.
    this.group.traverse((o) => {
      o.frustumCulled = false;
    });
    this.update(0);
  }

  private buildModel(): void {
    const cream = this.lambert('#f3ead2', '#3a3326');
    const creamDark = this.lambert('#e2d3ae', '#2a2418');
    const red = this.lambert('#c0262d', '#2a0505');
    const gold = new THREE.MeshBasicMaterial({ color: GOAL_GOLD });
    const goldBright = new THREE.MeshBasicMaterial({ color: '#fff0c4' });
    this.materials.push(gold, goldBright);

    const add = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
      this.geometries.push(g);
      const mesh = new THREE.Mesh(g, m);
      this.model.add(mesh);
      return mesh;
    };
    // Scroll along X, with slightly thicker rolled ends.
    add(new THREE.CylinderGeometry(RADIUS, RADIUS, LENGTH, 18).rotateZ(Math.PI / 2), cream);
    for (const sx of [-1, 1]) {
      add(
        new THREE.CylinderGeometry(RADIUS * 1.12, RADIUS * 1.12, 0.03, 18)
          .rotateZ(Math.PI / 2)
          .translate(sx * (LENGTH / 2 - 0.015), 0, 0),
        creamDark,
      );
      // The paper's spiral end: a small dark disc.
      add(
        new THREE.CircleGeometry(RADIUS * 0.55, 12)
          .rotateY((sx * Math.PI) / 2)
          .translate(sx * (LENGTH / 2 + 0.0005), 0, 0),
        red,
      );
    }
    // Ribbon around the middle with gold edges, and two short tails.
    add(
      new THREE.CylinderGeometry(RADIUS * 1.06, RADIUS * 1.06, 0.05, 18).rotateZ(Math.PI / 2),
      red,
    );
    for (const sx of [-1, 1]) {
      add(
        new THREE.CylinderGeometry(RADIUS * 1.08, RADIUS * 1.08, 0.006, 18)
          .rotateZ(Math.PI / 2)
          .translate(sx * 0.026, 0, 0),
        gold,
      );
      add(
        new THREE.BoxGeometry(0.022, 0.09, 0.004)
          .rotateZ(sx * 0.35)
          .translate(sx * 0.018, -RADIUS - 0.04, RADIUS * 0.6),
        red,
      );
    }
    // Gold wax seal on the front of the ribbon, with a star relief.
    add(
      new THREE.CylinderGeometry(0.035, 0.037, 0.012, 20)
        .rotateX(Math.PI / 2)
        .translate(0, -0.012, RADIUS * 1.06 + 0.006),
      gold,
    );
    add(
      new THREE.ExtrudeGeometry(starShape(0.022, 0.009), {
        depth: 0.003,
        bevelEnabled: false,
      }).translate(0, -0.012, RADIUS * 1.06 + 0.012),
      goldBright,
    );
    this.model.rotation.order = 'YXZ';
  }

  private lambert(color: string, emissive: string): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color, emissive });
    this.materials.push(m);
    return m;
  }

  /** The diploma's height above the floor at time `t` (s). */
  static heightAt(baseY: number, t: number): number {
    return baseY + GOAL_BOB * Math.sin((2 * Math.PI * t) / GOAL_BOB_PERIOD);
  }

  /** Moves everything to game time `t` (s); identical for every render pass of a frame. */
  update(t: number): void {
    if (this.pickupProgress > 0) return;
    const bob = Math.sin((2 * Math.PI * t) / GOAL_BOB_PERIOD);
    this.model.position.set(0, GOAL_BOB * bob, 0);
    this.model.rotation.set(GOAL_TILT, GOAL_YAW_SPEED * t, 0);
    this.halo.position.copy(this.model.position);
    this.core.position.copy(this.model.position);
    if (this.light) this.light.intensity = this.baseLight * (1 + LIGHT_PULSE * bob);
    const pos = this.sparkles.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.orbits.forEach((o, i) => {
      const a = o.phase + o.speed * t;
      pos.setXYZ(i, Math.cos(a) * o.r, o.h + 0.05 * Math.sin(a * 1.7), Math.sin(a) * o.r);
    });
    pos.needsUpdate = true;
  }

  /** The diploma's centre in room coordinates. */
  worldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.group.position).add(this.model.position);
  }

  /**
   * Pickup animation at progress `p` ∈ [0, 1]: flies toward `eye` (room coordinates), grows
   * and fades. At 1 the goal is hidden.
   */
  pickup(p: number, eye: THREE.Vector3): void {
    const k = Math.min(1, Math.max(0, p));
    if (this.pickupProgress === 0) this.flyFrom = this.worldPosition();
    this.pickupProgress = Math.max(k, 1e-6);
    const ease = 1 - (1 - k) ** 3;
    const target = eye.clone().lerp(this.flyFrom, 0.25);
    const at = this.flyFrom.clone().lerp(target, ease);
    this.group.position.copy(at).sub(this.model.position);
    this.group.scale.setScalar(1 + 1.5 * ease);
    for (const m of this.materials) {
      m.transparent = true;
      m.opacity = 1 - ease;
    }
    if (this.light) this.light.intensity = this.baseLight * (1 + 2 * (1 - ease));
    this.group.visible = k < 1;
  }

  private flyFrom = new THREE.Vector3();

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
