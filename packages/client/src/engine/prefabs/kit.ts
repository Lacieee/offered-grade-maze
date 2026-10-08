/**
 * Building blocks for prefab recipes (CP06 T1): primitives with baked vertex colours,
 * collected by material kind so a room can merge all its furniture into a few meshes.
 *
 * Every primitive is converted to non-indexed geometry with `position`, `normal` and `color`
 * (plus `uv` for textured parts), so all parts of one kind merge into one buffer.
 */
import * as THREE from 'three';

/** Material kind of a part (CP06 T1). */
export type PartKind = 'solid' | 'emissive';

/** A textured part: geometry with UVs and the key of its (cached) texture. */
export interface TexturedPart {
  key: string;
  geometry: THREE.BufferGeometry;
  makeTexture: () => THREE.Texture;
}

/** How a swimming part moves (see `animated.ts`). */
export interface SwimMotion {
  /** Half the swim range along the local X axis (m). */
  amplitude: number;
  /** Start phase (radians). */
  phase: number;
  /** Angular speed (radians per second): one length of the tank takes π / speed seconds. */
  speed: number;
}

/** Geometry of one item, grouped by material kind, in the item's local space. */
export interface PrefabParts {
  solid: THREE.BufferGeometry[];
  emissive: THREE.BufferGeometry[];
  textured: TexturedPart[];
  /**
   * Lit parts that swim back and forth (aquarium fish). Besides position, normal and colour
   * they carry `swimDir` (unit swim direction), `swim` (offset along it from the swimmer's
   * centre, amplitude, phase, speed) and `swimSide` (offset across it, horizontally).
   */
  swim: THREE.BufferGeometry[];
  /** Self-lit TV screens showing animated static; position, normal, colour and `uv`. */
  screen: THREE.BufferGeometry[];
}

/** A colour scaled toward black (k < 1) or white (k > 1), as hex. */
export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k <= 1) c.multiplyScalar(k);
  else c.lerp(new THREE.Color(1, 1, 1), Math.min(1, k - 1));
  return `#${c.getHexString()}`;
}

/** Mixes `hex` into `base` by `t` (0 = base, 1 = hex), as hex. */
export function mix(base: string, hex: string, t: number): string {
  return `#${new THREE.Color(base).lerp(new THREE.Color(hex), t).getHexString()}`;
}

/** Foliage greens; the item colour picks one, so plants still differ between rooms. */
const LEAF_GREENS = ['#3f7a3a', '#2f6b3a', '#4f8a34', '#2e7351', '#5a8f3c'];

/**
 * Foliage stays clearly green whatever colour the item got (a brown or amber accent read as
 * dead leaves under warm room light): the item colour picks a green and tints it slightly.
 */
export function leafColor(hex: string): string {
  const c = new THREE.Color(hex);
  const pick = Math.round((c.r * 7 + c.g * 11 + c.b * 13) * 10) % LEAF_GREENS.length;
  return mix(LEAF_GREENS[pick] ?? '#3f7a3a', hex, 0.08);
}

/** Prepares a geometry for merging: non-indexed, coloured, without UVs unless asked. */
function finish(g: THREE.BufferGeometry, color: string, keepUv = false): THREE.BufferGeometry {
  const out = g.index === null ? g : g.toNonIndexed();
  if (out !== g) g.dispose();
  if (!keepUv) out.deleteAttribute('uv');
  if (!out.hasAttribute('normal')) out.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = out.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return out;
}

/**
 * Collects the parts of one item. Positions are in metres in the item's local frame:
 * footprint centred on the origin, front toward +Z, floor at y = 0.
 */
export class PartsBuilder {
  readonly parts: PrefabParts = { solid: [], emissive: [], textured: [], swim: [], screen: [] };

  /** Adds an already positioned geometry. */
  add(kind: PartKind, color: string, g: THREE.BufferGeometry): void {
    this.parts[kind].push(finish(g, color));
  }

  /** Axis-aligned box: size (w, h, d), bottom centre at (x, y0, z). */
  box(
    kind: PartKind,
    color: string,
    w: number,
    h: number,
    d: number,
    x: number,
    y0: number,
    z: number,
  ): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y0 + h / 2, z);
    this.add(kind, color, g);
  }

  /** Upright cylinder (or cone/frustum): bottom centre at (x, y0, z). */
  cylinder(
    kind: PartKind,
    color: string,
    rTop: number,
    rBottom: number,
    h: number,
    x: number,
    y0: number,
    z: number,
    segments = 10,
  ): void {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
    g.translate(x, y0 + h / 2, z);
    this.add(kind, color, g);
  }

  /** Cylinder lying along X (or Z), centred at (x, y, z): rails, rolls, hands. */
  rod(
    kind: PartKind,
    color: string,
    r: number,
    length: number,
    x: number,
    y: number,
    z: number,
    segments = 8,
    axis: 'x' | 'z' = 'x',
  ): void {
    const g = new THREE.CylinderGeometry(r, r, length, segments);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    else g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.add(kind, color, g);
  }

  /** Disc facing +Z (clock faces), centred at (x, y, z). */
  disc(
    kind: PartKind,
    color: string,
    r: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    segments = 16,
  ): void {
    const g = new THREE.CylinderGeometry(r, r, depth, segments);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.add(kind, color, g);
  }

  /** Low-poly sphere centred at (x, y, z), optionally squashed per axis. */
  sphere(
    kind: PartKind,
    color: string,
    r: number,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number] = [1, 1, 1],
    detail: [number, number] = [8, 6],
  ): void {
    const g = new THREE.SphereGeometry(r, detail[0], detail[1]);
    g.scale(...scale);
    g.translate(x, y, z);
    this.add(kind, color, g);
  }

  /** Faceted blob (leaf clusters): an icosahedron, squashed per axis. */
  blob(
    kind: PartKind,
    color: string,
    r: number,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number] = [1, 1, 1],
  ): void {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(...scale);
    g.translate(x, y, z);
    this.add(kind, color, g);
  }

  /** Lathe from a profile of [radius, height] points, bottom at (x, y0, z). */
  lathe(
    kind: PartKind,
    color: string,
    profile: [number, number][],
    x: number,
    y0: number,
    z: number,
    segments = 12,
  ): void {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      segments,
    );
    g.translate(x, y0, z);
    this.add(kind, color, g);
  }

  /**
   * One swimmer (a fish), facing +X: `build` adds its solid parts, which then move together
   * along X by ± `motion.amplitude` around where they were built, turning at each end.
   */
  swimming(motion: SwimMotion, build: (b: PartsBuilder) => void): void {
    const sub = new PartsBuilder();
    build(sub);
    const centre = new THREE.Box3();
    for (const g of sub.parts.solid) {
      g.computeBoundingBox();
      if (g.boundingBox) centre.union(g.boundingBox);
    }
    const cx = (centre.min.x + centre.max.x) / 2;
    const cz = (centre.min.z + centre.max.z) / 2;
    for (const g of sub.parts.solid) {
      const pos = g.getAttribute('position');
      const dir = new Float32Array(pos.count * 3);
      const swim = new Float32Array(pos.count * 4);
      const side = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        dir[i * 3] = 1;
        swim[i * 4] = pos.getX(i) - cx;
        swim[i * 4 + 1] = motion.amplitude;
        swim[i * 4 + 2] = motion.phase;
        swim[i * 4 + 3] = motion.speed;
        side[i] = pos.getZ(i) - cz;
      }
      g.setAttribute('swimDir', new THREE.BufferAttribute(dir, 3));
      g.setAttribute('swim', new THREE.BufferAttribute(swim, 4));
      g.setAttribute('swimSide', new THREE.BufferAttribute(side, 1));
      this.parts.swim.push(g);
    }
  }

  /** A TV screen showing static: a quad facing +Z, centred at (x, y, z). */
  screen(w: number, h: number, x: number, y: number, z: number): void {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(x, y, z);
    this.parts.screen.push(finish(g, '#ffffff', true));
  }

  /** A textured quad facing +Z, centred at (x, y, z). */
  picture(
    key: string,
    makeTexture: () => THREE.Texture,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(x, y, z);
    this.parts.textured.push({ key, makeTexture, geometry: finish(g, '#ffffff', true) });
  }
}
