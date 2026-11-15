/**
 * Z-fighting check (tests): finds faces of different primitives that lie in the same plane,
 * face the same way and overlap. Two such faces flicker or show blocky patterns, worst on
 * tile-based GPUs (Apple), unless they have the same colour and material.
 */
import type * as THREE from 'three';
import type { PrefabParts } from './kit.js';

/** One overlap between two primitives. */
export interface CoplanarOverlap {
  /** `solid[3]`, `emissive[0]`, `textured[1]`… */
  a: string;
  b: string;
  /** Overlapping area (m²). */
  area: number;
  /** A point of the shared plane (for messages). */
  at: [number, number, number];
}

interface Tri {
  part: string;
  /** Colour and material: faces with equal looks may share a plane. */
  look: string;
  p: [number, number, number][];
  n: [number, number, number];
  dist: number;
}

type V2 = [number, number];

const sub = (a: number[], b: number[]): [number, number, number] => [
  (a[0] ?? 0) - (b[0] ?? 0),
  (a[1] ?? 0) - (b[1] ?? 0),
  (a[2] ?? 0) - (b[2] ?? 0),
];
const cross = (a: number[], b: number[]): [number, number, number] => [
  (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
  (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
  (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];
const dot = (a: number[], b: number[]): number =>
  (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);

function triangles(g: THREE.BufferGeometry, part: string, group: string, out: Tri[]): void {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const p: [number, number, number][] = [0, 1, 2].map((k) => [
      pos.getX(i + k),
      pos.getY(i + k),
      pos.getZ(i + k),
    ]);
    const [p0, p1, p2] = p as [[number, number, number], ...[number, number, number][]];
    const c = cross(sub(p1 ?? p0, p0), sub(p2 ?? p0, p0));
    const len = Math.hypot(...c);
    if (len < 1e-10) continue;
    const n: [number, number, number] = [c[0] / len, c[1] / len, c[2] / len];
    const look = `${group}:${col.getX(i).toFixed(3)},${col.getY(i).toFixed(3)},${col.getZ(i).toFixed(3)}`;
    out.push({ part, look, p, n, dist: dot(n, p0) });
  }
}

/** Area of the intersection of two convex polygons (Sutherland–Hodgman). */
function overlapArea(a: V2[], b: V2[]): number {
  const orient = (poly: V2[]): V2[] => (signedArea(poly) < 0 ? [...poly].reverse() : poly);
  let out = orient(a);
  const clip = orient(b);
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const c0 = clip[i] as V2;
    const c1 = clip[(i + 1) % clip.length] as V2;
    const inside = (p: V2): number =>
      (c1[0] - c0[0]) * (p[1] - c0[1]) - (c1[1] - c0[1]) * (p[0] - c0[0]);
    const next: V2[] = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j] as V2;
      const q = out[(j + 1) % out.length] as V2;
      const sp = inside(p);
      const sq = inside(q);
      if (sp >= 0) next.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    out = next;
  }
  return out.length < 3 ? 0 : Math.abs(signedArea(out));
}

function signedArea(poly: V2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as V2;
    const q = poly[(i + 1) % poly.length] as V2;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

/**
 * Pairs of primitives with coplanar, same-facing, overlapping faces of a different colour or
 * material. Overlaps smaller than `minArea` (m²) are ignored, and so are faces nobody can
 * see: undersides below 1 m and, with `backAt`, backs against the wall at z = `backAt`.
 */
export function coplanarOverlaps(
  parts: PrefabParts,
  options: { minArea?: number; backAt?: number } = {},
): CoplanarOverlap[] {
  const minArea = options.minArea ?? 2e-5;
  const hidden = (t: Tri): boolean =>
    // Undersides below 1 m: the eye never goes below 1.6 m, so it never sees them.
    (t.n[1] < -0.999 && -t.dist < 1) ||
    (options.backAt !== undefined && t.n[2] < -0.999 && Math.abs(t.dist + options.backAt) < 1e-4);
  const tris: Tri[] = [];
  parts.solid.forEach((g, i) => {
    triangles(g, `solid[${String(i)}]`, 'solid', tris);
  });
  parts.emissive.forEach((g, i) => {
    triangles(g, `emissive[${String(i)}]`, 'emissive', tris);
  });
  parts.textured.forEach((t, i) => {
    triangles(t.geometry, `textured[${String(i)}]`, `textured:${t.key}`, tris);
  });

  const planes = new Map<string, Tri[]>();
  for (const t of tris) {
    if (hidden(t)) continue;
    const key = [...t.n.map((v) => Math.round(v * 1000)), Math.round(t.dist * 2000)].join(',');
    const list = planes.get(key) ?? [];
    list.push(t);
    planes.set(key, list);
  }

  const found = new Map<string, CoplanarOverlap>();
  for (const list of planes.values()) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i] as Tri;
      // A basis of the plane.
      const ref: [number, number, number] = Math.abs(a.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = cross(a.n, ref);
      const ul = Math.hypot(...u);
      const uu: [number, number, number] = [u[0] / ul, u[1] / ul, u[2] / ul];
      const vv = cross(a.n, uu);
      const flat = (t: Tri): V2[] => t.p.map((p) => [dot(p, uu), dot(p, vv)]);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j] as Tri;
        if (a.part === b.part || a.look === b.look) continue;
        if (Math.abs(a.dist - b.dist) > 2e-4) continue;
        const area = overlapArea(flat(a), flat(b));
        if (area <= 0) continue;
        const pair = a.part < b.part ? `${a.part}|${b.part}` : `${b.part}|${a.part}`;
        const prev = found.get(pair);
        const at = a.p[0] ?? [0, 0, 0];
        found.set(pair, {
          a: a.part < b.part ? a.part : b.part,
          b: a.part < b.part ? b.part : a.part,
          area: (prev?.area ?? 0) + area,
          at: [+at[0].toFixed(3), +at[1].toFixed(3), +at[2].toFixed(3)],
        });
      }
    }
  }
  return [...found.values()].filter((o) => o.area >= minArea);
}
