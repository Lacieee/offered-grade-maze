import { describe, expect, it } from 'vitest';
import { FurnitureDTOSchema, RoomTypeSchema } from '../dto/dto.js';
import {
  DECOR_PREFABS,
  PREFABS,
  PREFAB_IDS,
  REQUIRED_BY_TYPE,
  SIGNATURE_PREFABS,
  frontDirection,
  optionalPrefabs,
  prefabAllowedIn,
  rotatedFootprint,
} from './catalog.js';

describe('prefab catalogue (CP05 T1)', () => {
  it('has the 45 prefabs of the table, each keyed by its own id', () => {
    expect(PREFAB_IDS).toHaveLength(45);
    for (const id of PREFAB_IDS) expect(PREFABS[id].id).toBe(id);
  });

  it('spot-checks rows against the CP05 table', () => {
    expect(PREFABS.sofa_3seat).toMatchObject({
      footprint: [
        [8, 4],
        [7, 4],
      ],
      height: 0.85,
      anchors: ['wall'],
      frontClearance: 3,
      blocks: true,
      colorSlots: 2,
      roomTypes: ['living'],
      role: 'required',
    });
    expect(PREFABS.counter_run.footprint).toEqual([
      [8, 3],
      [10, 3],
      [12, 3],
    ]);
    expect(PREFABS.floor_lamp.light).toEqual({ y: 1.5, color: '#ffd9a0', intensity: 0.8 });
    expect(PREFABS.runner_rug).toMatchObject({ blocks: false, anchors: ['floorFlat'] });
    expect(PREFABS.sig_painting).toMatchObject({ role: 'signature', anchors: ['wallHung'] });
  });

  it('flat and hung items never block; hung items have a mount height that fits the room', () => {
    for (const id of PREFAB_IDS) {
      const m = PREFABS[id];
      const hung = m.anchors.includes('wallHung');
      const flat = m.anchors.includes('floorFlat');
      if (hung || flat) expect(m.blocks, id).toBe(false);
      else expect(m.blocks, id).toBe(true);
      if (hung) {
        expect(m.mountY, id).toBeDefined();
        expect((m.mountY ?? 0) + m.height / 2, id).toBeLessThanOrEqual(2.8);
        expect((m.mountY ?? 0) - m.height / 2, id).toBeGreaterThan(0);
      } else {
        expect(m.mountY, id).toBeUndefined();
      }
      expect(m.footprint.length, id).toBeGreaterThan(0);
      for (const [w, d] of m.footprint) {
        expect(Number.isInteger(w) && Number.isInteger(d) && w > 0 && d > 0, id).toBe(true);
      }
    }
  });

  it('every room type has required items, and they are allowed there', () => {
    for (const type of RoomTypeSchema.options) {
      expect(REQUIRED_BY_TYPE[type].length).toBeGreaterThan(0);
      for (const id of REQUIRED_BY_TYPE[type]) expect(prefabAllowedIn(id, type), id).toBe(true);
      for (const id of optionalPrefabs(type)) {
        expect(PREFABS[id].role).toBe('optional');
        expect(REQUIRED_BY_TYPE[type]).not.toContain(id);
      }
    }
    expect(REQUIRED_BY_TYPE.study).toContain('bookshelf');
    expect(optionalPrefabs('living')).toContain('bookshelf');
    expect(optionalPrefabs('study')).not.toContain('bookshelf');
    expect(optionalPrefabs('bathroom')).toContain('floor_lamp');
    expect(prefabAllowedIn('stove', 'living')).toBe(false);
  });

  it('lists decor and signature prefabs', () => {
    expect(DECOR_PREFABS).toEqual(['painting', 'wall_clock', 'plant_small', 'plant_large']);
    expect(SIGNATURE_PREFABS).toHaveLength(6);
  });

  it('rotates footprints and fronts by quarter turns', () => {
    expect(rotatedFootprint('sofa_3seat', 1, 0)).toEqual({ w: 7, d: 4 });
    expect(rotatedFootprint('sofa_3seat', 1, 3)).toEqual({ w: 4, d: 7 });
    expect(() => rotatedFootprint('sofa_3seat', 2, 0)).toThrow(RangeError);
    expect([0, 1, 2, 3, -1].map(frontDirection)).toEqual([
      { x: 0, z: 1 },
      { x: 1, z: 0 },
      { x: 0, z: -1 },
      { x: -1, z: 0 },
      { x: -1, z: 0 },
    ]);
  });

  it('FurnitureDTO accepts only catalogue ids', () => {
    const item = { id: 'f00', prefab: 'sofa_3seat', x: 0, z: 0, rot: 0, variant: 0, colors: [] };
    expect(FurnitureDTOSchema.safeParse(item).success).toBe(true);
    expect(FurnitureDTOSchema.safeParse({ ...item, prefab: 'sofa' }).success).toBe(false);
  });
});
