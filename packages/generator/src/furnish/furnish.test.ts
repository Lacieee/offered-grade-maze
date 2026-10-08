import { PREFABS, rotatedFootprint, type PrefabId } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import { rngFor } from '../prng/index.js';
import { PALETTES } from '../identity/palettes.js';
import {
  CENTER_MARGIN,
  MAX_OPTIONAL,
  RoomPlacer,
  candidates,
  chooseItems,
  itemColors,
  toDTO,
  type FurnishInput,
  type ItemSpec,
} from './furnish.js';
import { BLOCK, CLEAR, RESERVED, RoomGrid, doorCentre, reservedZones, zoneList } from './grid.js';
import { furnishHouse, roomLights, type HouseRoom } from './house.js';

const rng = (label: string) => rngFor('M1-0000-0000', label);
const item = (prefab: PrefabId): ItemSpec => ({
  prefab,
  colors: Array<string>(PREFABS[prefab].colorSlots).fill('#808080'),
  signature: PREFABS[prefab].role === 'signature',
});

/** 4 × 4 m study with one door in the middle of the north wall. */
const study: FurnishInput = {
  type: 'study',
  widthU: 16,
  depthU: 16,
  doors: [{ wall: 'N', offset: 0 }],
  isStart: false,
  isGoal: false,
};

describe('reserved zones (CP05 T3)', () => {
  it('door clearance covers every cell of 1.4 × 1.2 m: 6 × 5 cells centred on the door', () => {
    const z = reservedZones(16, 20, [{ wall: 'N', offset: 0 }], false, false);
    expect(z.doors[0]).toEqual({ x0: 5, z0: 0, w: 6, d: 5 });
    const s = reservedZones(16, 20, [{ wall: 'S', offset: 1 }], false, false);
    // S doors use the mirrored offset (local +X points to −x).
    expect(s.doors[0]).toEqual({ x0: 4, z0: 15, w: 6, d: 5 });
    const e = reservedZones(16, 20, [{ wall: 'E', offset: -2 }], false, false);
    expect(e.doors[0]).toEqual({ x0: 11, z0: 5, w: 5, d: 6 });
    const w = reservedZones(16, 20, [{ wall: 'W', offset: -2 }], false, false);
    expect(w.doors[0]).toEqual({ x0: 0, z0: 9, w: 5, d: 6 });
  });

  it('spawn 4 × 4 and goal 6 × 6 cells at the room centre; spawn and goal come first', () => {
    const z = reservedZones(16, 20, [{ wall: 'N', offset: 0 }], true, true);
    expect(z.spawn).toEqual({ x0: 6, z0: 8, w: 4, d: 4 });
    expect(z.goal).toEqual({ x0: 5, z0: 7, w: 6, d: 6 });
    expect(zoneList(z)).toEqual([z.spawn, z.goal, z.doors[0]]);
  });

  it('door centres follow the DoorDTO offset convention', () => {
    expect(doorCentre(16, 20, { wall: 'N', offset: 2 })).toBe(10);
    expect(doorCentre(16, 20, { wall: 'S', offset: 2 })).toBe(6);
    expect(doorCentre(16, 20, { wall: 'E', offset: 2 })).toBe(12);
    expect(doorCentre(16, 20, { wall: 'W', offset: 2 })).toBe(8);
  });
});

describe('walkability (CP05 T4 step 6)', () => {
  const hall = (): RoomGrid => new RoomGrid(8, 24);
  const zones = [
    { x0: 1, z0: 0, w: 6, d: 5 },
    { x0: 1, z0: 19, w: 6, d: 5 },
  ];

  it('an empty hallway connects both door zones', () => {
    expect(hall().walkable(zones)).toBe(true);
  });

  it('a 3-cell (0.75 m) gap stays open; a 2-cell gap closes', () => {
    const g = hall();
    // An item over x 0…4 leaves cells 5…7 (0.75 m): inflated, only cell 6 stays free.
    g.mark({ x0: 0, z0: 10, w: 5, d: 2 }, BLOCK);
    expect(g.walkable(zones)).toBe(true);
    expect(g.walkable(zones, { x0: 5, z0: 10, w: 1, d: 2 })).toBe(false);
  });

  it('a zone with no free cell fails', () => {
    expect(hall().walkable([{ x0: 0, z0: 0, w: 1, d: 1 }])).toBe(false);
    expect(hall().walkable([])).toBe(true);
  });
});

describe('candidates (CP05 T4 step 4)', () => {
  it('wall items stand against a wall facing in', () => {
    for (const c of candidates('desk_set', 16, 16)) {
      const { rect, rot } = c;
      const against = {
        0: rect.z0 === 0,
        2: rect.z0 + rect.d === 16,
        1: rect.x0 === 0,
        3: rect.x0 + rect.w === 16,
      };
      expect(against[rot as 0 | 1 | 2 | 3]).toBe(true);
    }
  });

  it('corner items touch two walls; centre items keep 1 m from every wall', () => {
    for (const { rect } of candidates('plant_large', 16, 20)) {
      const walls =
        Number(rect.z0 === 0) +
        Number(rect.z0 + rect.d === 20) +
        Number(rect.x0 === 0) +
        Number(rect.x0 + rect.w === 16);
      expect(walls).toBe(2);
    }
    const centre = candidates('coffee_table', 24, 24);
    expect(centre.length).toBeGreaterThan(0);
    for (const { rect } of centre) {
      expect(rect.x0).toBeGreaterThanOrEqual(CENTER_MARGIN);
      expect(rect.z0).toBeGreaterThanOrEqual(CENTER_MARGIN);
      expect(rect.x0 + rect.w).toBeLessThanOrEqual(24 - CENTER_MARGIN);
      expect(rect.z0 + rect.d).toBeLessThanOrEqual(24 - CENTER_MARGIN);
    }
  });

  it('footprints match the variant and rotation', () => {
    for (const c of candidates('counter_run', 24, 24)) {
      expect({ w: c.rect.w, d: c.rect.d }).toEqual(
        rotatedFootprint('counter_run', c.variant, c.rot),
      );
    }
  });
});

describe('RoomPlacer', () => {
  it('rejects blocking items in reserved zones and marks clearance', () => {
    const p = new RoomPlacer(study);
    expect(p.fits('desk_set', { variant: 0, rot: 0, rect: { x0: 5, z0: 0, w: 5, d: 5 } })).toBe(
      false,
    );
    const placed = p.commit(item('desk_set'), {
      variant: 0,
      rot: 0,
      rect: { x0: 0, z0: 5, w: 5, d: 5 },
    });
    expect(placed.rect).toEqual({ x0: 0, z0: 5, w: 5, d: 5 });
    // desk_set has 2 cells of front clearance: z 10…11 in front of it.
    expect(p.grid.cells[11 * 16 + 2]).toBe(CLEAR);
    expect(p.grid.cells[0 * 16 + 6]).toBe(RESERVED);
    // Nothing blocking may cover that clearance.
    expect(
      p.fits('filing_cabinet', { variant: 0, rot: 1, rect: { x0: 0, z0: 10, w: 3, d: 2 } }),
    ).toBe(false);
  });

  it('hangs wall items only on free wall: not over a door, not over tall furniture', () => {
    const p = new RoomPlacer(study);
    // Door on N at cells 5…10 (± 0.1 m around the 1 m opening).
    expect(p.fits('painting', { variant: 0, rot: 0, rect: { x0: 7, z0: 0, w: 4, d: 1 } })).toBe(
      false,
    );
    expect(p.fits('painting', { variant: 0, rot: 0, rect: { x0: 11, z0: 0, w: 4, d: 1 } })).toBe(
      true,
    );
    // A bookshelf (1.9 m) on the S wall: a painting (1.1–1.9 m) cannot hang above it.
    p.commit(item('bookshelf'), { variant: 0, rot: 2, rect: { x0: 4, z0: 14, w: 4, d: 2 } });
    expect(p.fits('painting', { variant: 0, rot: 2, rect: { x0: 5, z0: 15, w: 4, d: 1 } })).toBe(
      false,
    );
    // …but a wall clock (1.75–2.15 m) still clears it.
    expect(p.fits('wall_clock', { variant: 0, rot: 2, rect: { x0: 5, z0: 15, w: 2, d: 1 } })).toBe(
      false,
    );
    expect(p.fits('wall_clock', { variant: 0, rot: 2, rect: { x0: 10, z0: 15, w: 2, d: 1 } })).toBe(
      true,
    );
    // And tall furniture cannot go under a hung item.
    p.commit(item('painting'), { variant: 0, rot: 2, rect: { x0: 10, z0: 15, w: 4, d: 1 } });
    expect(p.fits('bookshelf', { variant: 0, rot: 2, rect: { x0: 10, z0: 14, w: 4, d: 2 } })).toBe(
      false,
    );
  });

  it('rugs avoid blocking items and other rugs', () => {
    const p = new RoomPlacer({ ...study, type: 'bedroom' });
    p.commit(item('rug_medium'), { variant: 1, rot: 0, rect: { x0: 5, z0: 5, w: 6, d: 4 } });
    expect(p.fits('rug_medium', { variant: 1, rot: 0, rect: { x0: 6, z0: 6, w: 6, d: 4 } })).toBe(
      false,
    );
    // Rugs may lie in reserved zones (here the door clearance).
    expect(p.fits('rug_medium', { variant: 1, rot: 0, rect: { x0: 5, z0: 0, w: 6, d: 4 } })).toBe(
      true,
    );
  });

  it('place() returns null when nothing fits', () => {
    const tiny: FurnishInput = {
      ...study,
      widthU: 8,
      depthU: 8,
      doors: [{ wall: 'N', offset: 0 }],
    };
    expect(new RoomPlacer(tiny).place(rng('x'), item('bed_double'))).toBeNull();
  });
});

describe('item choice and output', () => {
  it('bathrooms try their drawn bath first and the other as a fallback', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const c = chooseItems(rng(`c${i}`), 'bathroom');
      const bath = c.required.find((alts) => alts.includes('bathtub'));
      expect(bath?.slice().sort()).toEqual(['bathtub', 'shower']);
      seen.add(bath?.[0] ?? '');
      expect(c.optional.length).toBeLessThanOrEqual(MAX_OPTIONAL);
      expect(c.decor.length).toBeGreaterThanOrEqual(1);
      expect(c.decor.length).toBeLessThanOrEqual(3);
    }
    expect(seen).toEqual(new Set(['bathtub', 'shower']));
  });

  it('colours come from the accents and the trim; DTO centres are exact metres', () => {
    const palette = PALETTES.kitchen[0];
    if (palette === undefined) throw new Error('fixture');
    expect(itemColors(rng('k'), 'kitchen', palette, 3)).toHaveLength(3);
    const dto = toDTO(
      {
        prefab: 'stove',
        variant: 0,
        rot: 1,
        rect: { x0: 0, z0: 3, w: 3, d: 3 },
        colors: ['#000000', '#ffffff'],
        signature: false,
      },
      'f07',
      16,
      20,
    );
    expect(dto).toEqual({
      id: 'f07',
      prefab: 'stove',
      x: -1.625,
      z: -1.375,
      rot: 1,
      variant: 0,
      colors: ['#000000', '#ffffff'],
    });
  });

  it('lights: ceiling first, one per floor lamp (max 2), goal light last in the goal room', () => {
    const lamp = (id: string) => ({
      id,
      prefab: 'floor_lamp' as const,
      x: 1,
      z: 1,
      rot: 0 as const,
      variant: 0,
      colors: [],
    });
    const lights = roomLights([lamp('f00'), lamp('f01'), lamp('f02')], true);
    expect(lights.map((l) => l.kind)).toEqual(['ceiling', 'lamp', 'lamp', 'goal']);
    expect(lights[1]).toMatchObject({ x: 1, y: 1.5, z: 1, color: '#ffd9a0', intensity: 0.8 });
    expect(roomLights([], false)).toHaveLength(1);
  });
});

describe('furnishHouse', () => {
  const rooms: HouseRoom[] = [
    {
      ...study,
      tempId: 't00',
      twinOf: null,
      type: 'living',
      widthU: 28,
      depthU: 28,
      isStart: true,
    },
    {
      ...study,
      tempId: 't01',
      twinOf: null,
      type: 'kitchen',
      widthU: 20,
      depthU: 20,
      isGoal: true,
    },
    { ...study, tempId: 't02', twinOf: 't01', type: 'kitchen', widthU: 20, depthU: 20 },
    { ...study, tempId: 't03', twinOf: null, type: 'kitchen', widthU: 20, depthU: 24 },
  ];

  it('is deterministic', () => {
    expect(furnishHouse('M1-0000-0000', rooms)).toEqual(furnishHouse('M1-0000-0000', rooms));
  });

  it('a twin copies its original exactly except for its own signature', () => {
    const out = furnishHouse('M1-0000-0001', rooms);
    const original = out.get('t01');
    const twin = out.get('t02');
    expect(twin?.palette).toEqual(original?.palette);
    const plain = (f: { signature?: true }[] | undefined) => f?.filter((x) => x.signature !== true);
    expect(plain(twin?.furniture)).toEqual(plain(original?.furniture));
    const sig = (f: { signature?: true; id: string }[] | undefined) =>
      f?.find((x) => x.signature === true);
    expect(sig(twin?.furniture)).not.toEqual(sig(original?.furniture));
    expect(sig(twin?.furniture)?.id).toBe(sig(original?.furniture)?.id);
    // The goal light belongs to the goal room only.
    expect(original?.lights.some((l) => l.kind === 'goal')).toBe(true);
    expect(twin?.lights.some((l) => l.kind === 'goal')).toBe(false);
  });

  it('rooms of one type get different palettes while there are enough', () => {
    const out = furnishHouse('M1-0000-0002', rooms);
    expect(out.get('t03')?.palette).not.toEqual(out.get('t01')?.palette);
  });
});
