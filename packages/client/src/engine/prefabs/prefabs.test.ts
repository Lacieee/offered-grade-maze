import { GRID, PREFABS, PREFAB_IDS, type FurnitureDTO, type PrefabId } from '@ogm/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPrefab, buildPrefabLocal, triangleCount } from './index.js';
import { leafColor, type PrefabParts } from './kit.js';

/** Every prefab × variant. */
const CASES: [PrefabId, number][] = PREFAB_IDS.flatMap((id) =>
  PREFABS[id].footprint.map((_, v) => [id, v] as [PrefabId, number]),
);

const item = (
  prefab: PrefabId,
  variant: number,
  extra: Partial<FurnitureDTO> = {},
): FurnitureDTO => ({
  id: 'f00',
  prefab,
  x: 0,
  z: 0,
  rot: 0,
  variant,
  colors: ['#aa3322', '#22aa33', '#3322aa'].slice(0, PREFABS[prefab].colorSlots),
  ...(prefab === 'painting' || prefab === 'sig_painting'
    ? { params: { pattern: 'waves', seed: 7 } }
    : {}),
  ...extra,
});

function bounds(parts: PrefabParts): THREE.Box3 {
  const box = new THREE.Box3();
  for (const g of [...parts.solid, ...parts.emissive, ...parts.textured.map((t) => t.geometry)]) {
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
  }
  return box;
}

describe('prefab recipes (CP06 T1)', () => {
  it.each(CASES)('%s v%i: footprint within 2 cm, height and triangle budget', (prefab, variant) => {
    const meta = PREFABS[prefab];
    const parts = buildPrefabLocal(item(prefab, variant));
    const fp = meta.footprint[variant] ?? [0, 0];
    const w = fp[0] * GRID;
    const d = fp[1] * GRID;
    const box = bounds(parts);
    const tol = 0.02 + 1e-6;
    // The visual base matches the collider footprint: every side within 2 cm, nothing outside.
    expect(box.min.x, 'min x').toBeGreaterThanOrEqual(-w / 2 - 1e-6);
    expect(box.max.x, 'max x').toBeLessThanOrEqual(w / 2 + 1e-6);
    expect(box.min.z, 'min z').toBeGreaterThanOrEqual(-d / 2 - 1e-6);
    expect(box.max.z, 'max z').toBeLessThanOrEqual(d / 2 + 1e-6);
    if (meta.blocks) {
      expect(box.min.x, 'left side').toBeLessThanOrEqual(-w / 2 + tol);
      expect(box.max.x, 'right side').toBeGreaterThanOrEqual(w / 2 - tol);
      expect(box.min.z, 'back').toBeLessThanOrEqual(-d / 2 + tol);
      expect(box.max.z, 'front').toBeGreaterThanOrEqual(d / 2 - tol);
    }
    // Height: floor items stand on the floor; hung items span their mount height.
    const y0 = meta.mountY === undefined ? 0 : meta.mountY - meta.height / 2;
    expect(box.min.y, 'bottom').toBeGreaterThanOrEqual(y0 - 1e-6);
    expect(box.min.y, 'bottom').toBeLessThanOrEqual(y0 + 0.02);
    expect(Math.abs(box.max.y - (y0 + meta.height)), 'top').toBeLessThanOrEqual(0.25);
    expect(box.max.y).toBeLessThanOrEqual(2.8);
    const tris = triangleCount(parts);
    expect(tris).toBeGreaterThanOrEqual(12);
    expect(tris).toBeLessThanOrEqual(600);
    // Lamps have a glowing part where the light is.
    if (meta.light) expect(parts.emissive.length).toBeGreaterThan(0);
  });

  it.each(CASES)('%s v%i: mergeable attributes', (prefab, variant) => {
    const parts = buildPrefabLocal(item(prefab, variant));
    for (const g of [...parts.solid, ...parts.emissive]) {
      expect(g.index).toBeNull();
      expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'position']);
      for (const v of g.getAttribute('position').array) expect(Number.isFinite(v)).toBe(true);
    }
    for (const t of parts.textured) {
      expect(Object.keys(t.geometry.attributes).sort()).toEqual([
        'color',
        'normal',
        'position',
        'uv',
      ]);
    }
  });

  it('places items by x, z and quarter turns', () => {
    const local = bounds(buildPrefabLocal(item('sofa_3seat', 0)));
    const placed = bounds(buildPrefab(item('sofa_3seat', 0, { x: 1, z: -2, rot: 1 })));
    // rot 1 turns the front (+Z) to +X: width now runs along Z.
    expect(placed.max.x - placed.min.x).toBeCloseTo(local.max.z - local.min.z, 5);
    expect(placed.max.z - placed.min.z).toBeCloseTo(local.max.x - local.min.x, 5);
    expect((placed.min.x + placed.max.x) / 2).toBeCloseTo(1 + (local.min.z + local.max.z) / 2, 5);
    expect((placed.min.z + placed.max.z) / 2).toBeCloseTo(-2, 5);
  });

  it('uses the item colours as vertex colours', () => {
    const parts = buildPrefabLocal(item('fridge', 0, { colors: ['#ff0000'] }));
    const c = parts.solid[1]?.getAttribute('color');
    expect([c?.getX(0), c?.getY(0), c?.getZ(0)]).toEqual([1, 0, 0]);
  });

  it('paintings carry a textured part keyed by their params', () => {
    const a = buildPrefabLocal(item('painting', 0));
    const b = buildPrefabLocal(item('painting', 1, { params: { pattern: 'grid', seed: 3 } }));
    expect(a.textured).toHaveLength(1);
    expect(a.textured[0]?.key).toBe('painting:waves:7:#22aa33:#3322aa');
    expect(b.textured[0]?.key).toBe('painting:grid:3:#22aa33:#3322aa');
  });
});

describe('foliage (CP06 visual pass)', () => {
  const green = (hex: string): boolean => {
    const c = new THREE.Color(hex);
    return c.g > c.r * 1.25 && c.g > c.b * 1.25;
  };

  it.each(['#8c6b4a', '#e8a317', '#c0262d', '#2456b8', '#f2f2f2', '#000000'])(
    'leaves stay clearly green for item colour %s',
    (hex) => {
      expect(green(leafColor(hex)), leafColor(hex)).toBe(true);
    },
  );

  it('different item colours give different greens', () => {
    const tones = new Set(['#8c6b4a', '#e8a317', '#c0262d', '#2456b8'].map(leafColor));
    expect(tones.size).toBeGreaterThan(1);
  });
});
