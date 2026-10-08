/**
 * Prefab catalogue (CP05 T1): what each furniture prefab is, how much floor it takes and where
 * it may stand. The generator places items from this metadata; the client (CP06) builds
 * matching geometry. Sizes are in grid units (1 unit = 0.25 m), heights in metres.
 *
 * Local frame of an unrotated item: footprint `w` along X, `d` along Z, the front faces +Z.
 * `FurnitureDTO.rot` turns it by quarter turns about +Y (rot 1 makes the front face +X).
 */
import type { RoomType } from '../dto/dto.js';

/** Where an item may stand. */
export type Anchor = 'wall' | 'corner' | 'center' | 'wallHung' | 'floorFlat';

/** What a prefab means for the furnishing algorithm. */
export type PrefabRole = 'required' | 'optional' | 'decor' | 'signature';

/** Light emitted by a lamp prefab. */
export interface PrefabLight {
  /** Height of the light above the floor (m). */
  y: number;
  color: string;
  intensity: number;
}

/** Metadata of one prefab. */
export interface PrefabMeta {
  id: PrefabId;
  /** Footprint per variant in grid units, unrotated: [w (X), d (Z)]. The front faces +Z. */
  footprint: readonly (readonly [w: number, d: number])[];
  /** Height (m). */
  height: number;
  /** Allowed anchors. */
  anchors: readonly Anchor[];
  /** Grid units of free floor required in front (+Z side before rotation). */
  frontClearance: number;
  /** False for floorFlat and wallHung items: they never block the player. */
  blocks: boolean;
  /** Number of colours the client expects in `FurnitureDTO.colors`. */
  colorSlots: number;
  /** Lamp prefabs only. */
  light?: PrefabLight;
  /**
   * WallHung prefabs only: height of the item's centre above the floor (m). Extension of the
   * CP05 interface (ADR-0006): the client needs it to hang the item, the placer to keep it
   * clear of tall furniture.
   */
  mountY?: number;
  /** Room types the prefab may appear in. */
  roomTypes: readonly RoomType[] | 'any';
  role: PrefabRole;
  /**
   * For required items with alternatives (bathroom: bathtub or shower): the group name. A
   * room needs exactly one item of each group.
   */
  oneOf?: string;
}

/** Every prefab id, in catalogue order. */
export const PREFAB_IDS = [
  'sofa_3seat',
  'coffee_table',
  'tv_unit',
  'armchair',
  'bookshelf',
  'floor_lamp',
  'side_table',
  'rug_large',
  'counter_run',
  'stove',
  'fridge',
  'dining_set',
  'wall_cabinet',
  'bin',
  'bed_double',
  'wardrobe',
  'nightstand',
  'dresser',
  'mirror_standing',
  'rug_medium',
  'bathtub',
  'shower',
  'toilet',
  'washbasin',
  'towel_rack',
  'laundry_basket',
  'mirror_wall',
  'runner_rug',
  'coat_rack',
  'shoe_cabinet',
  'console_table',
  'umbrella_stand',
  'desk_set',
  'filing_cabinet',
  'globe',
  'painting',
  'wall_clock',
  'plant_small',
  'plant_large',
  'sig_painting',
  'sig_grandfather_clock',
  'sig_red_armchair',
  'sig_aquarium',
  'sig_giant_plant',
  'sig_large_globe',
] as const;

/** A prefab id from the catalogue. */
export type PrefabId = (typeof PREFAB_IDS)[number];

/** Patterns of `painting` and `sig_painting` (`params.pattern`). */
export const PAINTING_PATTERNS = ['stripes', 'circles', 'waves', 'grid', 'checks'] as const;
/** A painting pattern. */
export type PaintingPattern = (typeof PAINTING_PATTERNS)[number];
/** Largest `params.seed` of a painting. */
export const PAINTING_SEED_MAX = 9999;

type Row = Omit<PrefabMeta, 'id'>;

const ROWS: Readonly<Record<PrefabId, Row>> = {
  // living
  sofa_3seat: row(
    [
      [8, 4],
      [7, 4],
    ],
    0.85,
    ['wall'],
    3,
    true,
    2,
    ['living'],
    'required',
  ),
  coffee_table: row(
    [
      [4, 2],
      [3, 3],
    ],
    0.45,
    ['center'],
    1,
    true,
    1,
    ['living'],
    'required',
  ),
  tv_unit: row(
    [
      [6, 2],
      [7, 2],
    ],
    1.1,
    ['wall'],
    4,
    true,
    2,
    ['living'],
    'required',
  ),
  armchair: row(
    [[4, 4]],
    0.9,
    ['wall', 'corner', 'center'],
    2,
    true,
    2,
    ['living', 'study'],
    'optional',
  ),
  // Optional in living rooms, required in studies (see REQUIRED_BY_TYPE).
  bookshelf: row(
    [
      [4, 2],
      [6, 2],
    ],
    1.9,
    ['wall'],
    2,
    true,
    2,
    ['living', 'study'],
    'optional',
  ),
  floor_lamp: {
    ...row([[2, 2]], 1.6, ['corner'], 0, true, 2, 'any', 'optional'),
    light: { y: 1.5, color: '#ffd9a0', intensity: 0.8 },
  },
  side_table: row(
    [[2, 2]],
    0.55,
    ['wall', 'corner'],
    0,
    true,
    1,
    ['living', 'bedroom'],
    'optional',
  ),
  rug_large: row(
    [
      [10, 7],
      [8, 6],
    ],
    0.01,
    ['floorFlat'],
    0,
    false,
    2,
    ['living'],
    'optional',
  ),
  // kitchen
  counter_run: row(
    [
      [8, 3],
      [10, 3],
      [12, 3],
    ],
    0.92,
    ['wall'],
    4,
    true,
    3,
    ['kitchen'],
    'required',
  ),
  stove: row([[3, 3]], 0.92, ['wall'], 4, true, 2, ['kitchen'], 'required'),
  fridge: row([[3, 3]], 1.9, ['wall', 'corner'], 4, true, 1, ['kitchen'], 'required'),
  dining_set: row(
    [
      [8, 6],
      [6, 6],
    ],
    0.95,
    ['center'],
    1,
    true,
    2,
    ['kitchen'],
    'optional',
  ),
  wall_cabinet: {
    ...row([[6, 2]], 0.7, ['wallHung'], 0, false, 2, ['kitchen'], 'optional'),
    mountY: 1.85,
  },
  bin: row([[1, 1]], 0.6, ['corner'], 0, true, 1, ['kitchen'], 'optional'),
  // bedroom
  bed_double: row(
    [
      [7, 8],
      [6, 8],
    ],
    0.6,
    ['wall'],
    2,
    true,
    3,
    ['bedroom'],
    'required',
  ),
  wardrobe: row(
    [
      [8, 3],
      [6, 3],
    ],
    2.0,
    ['wall'],
    3,
    true,
    2,
    ['bedroom'],
    'required',
  ),
  nightstand: row([[2, 2]], 0.55, ['wall'], 0, true, 1, ['bedroom'], 'required'),
  dresser: row([[5, 2]], 0.85, ['wall'], 3, true, 2, ['bedroom'], 'optional'),
  mirror_standing: row([[2, 1]], 1.7, ['wall'], 1, true, 1, ['bedroom'], 'optional'),
  rug_medium: row(
    [
      [8, 6],
      [6, 4],
    ],
    0.01,
    ['floorFlat'],
    0,
    false,
    2,
    ['bedroom', 'study'],
    'optional',
  ),
  // bathroom
  bathtub: {
    ...row([[7, 3]], 0.6, ['wall', 'corner'], 3, true, 2, ['bathroom'], 'required'),
    oneOf: 'bath',
  },
  shower: {
    ...row([[4, 4]], 2.0, ['corner'], 3, true, 2, ['bathroom'], 'required'),
    oneOf: 'bath',
  },
  toilet: row([[2, 3]], 0.8, ['wall'], 3, true, 1, ['bathroom'], 'required'),
  washbasin: row([[3, 2]], 0.9, ['wall'], 3, true, 2, ['bathroom'], 'required'),
  towel_rack: {
    ...row([[3, 1]], 1.1, ['wallHung'], 0, false, 2, ['bathroom'], 'optional'),
    mountY: 1.0,
  },
  laundry_basket: row([[2, 2]], 0.55, ['corner'], 0, true, 1, ['bathroom'], 'optional'),
  mirror_wall: {
    ...row([[3, 1]], 1.2, ['wallHung'], 0, false, 1, ['bathroom', 'hallway'], 'optional'),
    mountY: 1.5,
  },
  // hallway
  runner_rug: row(
    [
      [4, 12],
      [4, 16],
      [4, 20],
    ],
    0.01,
    ['floorFlat'],
    0,
    false,
    2,
    ['hallway'],
    'required',
  ),
  coat_rack: row([[2, 2]], 1.8, ['wall', 'corner'], 1, true, 1, ['hallway'], 'required'),
  shoe_cabinet: row([[4, 2]], 0.9, ['wall'], 2, true, 2, ['hallway'], 'optional'),
  console_table: row([[4, 2]], 0.8, ['wall'], 2, true, 2, ['hallway'], 'optional'),
  umbrella_stand: row([[1, 1]], 0.6, ['corner'], 0, true, 1, ['hallway'], 'optional'),
  // study
  desk_set: row([[5, 5]], 0.75, ['wall'], 2, true, 3, ['study'], 'required'),
  filing_cabinet: row([[2, 3]], 1.3, ['wall'], 2, true, 1, ['study'], 'optional'),
  globe: row([[2, 2]], 1.0, ['corner', 'center'], 0, true, 2, ['study'], 'optional'),
  // decor (any room)
  painting: {
    ...row(
      [
        [4, 1],
        [3, 1],
      ],
      0.8,
      ['wallHung'],
      0,
      false,
      3,
      'any',
      'decor',
    ),
    mountY: 1.5,
  },
  wall_clock: { ...row([[2, 1]], 0.4, ['wallHung'], 0, false, 2, 'any', 'decor'), mountY: 1.95 },
  plant_small: row([[1, 1]], 0.5, ['corner'], 0, true, 2, 'any', 'decor'),
  plant_large: row([[2, 2]], 1.4, ['corner'], 0, true, 2, 'any', 'decor'),
  // signatures (any room, one per room, unique in the house)
  sig_painting: {
    ...row([[5, 1]], 1.0, ['wallHung'], 0, false, 2, 'any', 'signature'),
    mountY: 1.5,
  },
  sig_grandfather_clock: row([[2, 2]], 2.0, ['wall', 'corner'], 1, true, 2, 'any', 'signature'),
  sig_red_armchair: row([[4, 4]], 0.95, ['corner', 'center'], 2, true, 2, 'any', 'signature'),
  sig_aquarium: row([[5, 2]], 1.3, ['wall'], 2, true, 2, 'any', 'signature'),
  sig_giant_plant: row([[3, 3]], 2.1, ['corner'], 0, true, 2, 'any', 'signature'),
  sig_large_globe: row([[3, 3]], 1.4, ['corner', 'center'], 0, true, 2, 'any', 'signature'),
};

function row(
  footprint: (readonly [number, number])[],
  height: number,
  anchors: Anchor[],
  frontClearance: number,
  blocks: boolean,
  colorSlots: number,
  roomTypes: RoomType[] | 'any',
  role: PrefabRole,
): Row {
  return { footprint, height, anchors, frontClearance, blocks, colorSlots, roomTypes, role };
}

/** The catalogue, by id. */
export const PREFABS: Readonly<Record<PrefabId, PrefabMeta>> = Object.fromEntries(
  PREFAB_IDS.map((id) => [id, { id, ...ROWS[id] }]),
) as Record<PrefabId, PrefabMeta>;

/**
 * Required prefabs per room type (CP05 T1 "required"). Items with the same `oneOf` group are
 * alternatives (exactly one is placed). The bookshelf is optional elsewhere but required in a
 * study.
 */
export const REQUIRED_BY_TYPE: Readonly<Record<RoomType, readonly PrefabId[]>> = {
  living: ['sofa_3seat', 'coffee_table', 'tv_unit'],
  kitchen: ['counter_run', 'stove', 'fridge'],
  bedroom: ['bed_double', 'wardrobe', 'nightstand'],
  bathroom: ['bathtub', 'shower', 'toilet', 'washbasin'],
  hallway: ['runner_rug', 'coat_rack'],
  study: ['bookshelf', 'desk_set'],
};

/** True when the prefab may appear in a room of this type. */
export function prefabAllowedIn(id: PrefabId, type: RoomType): boolean {
  const types = PREFABS[id].roomTypes;
  return types === 'any' || types.includes(type);
}

/** Optional prefabs for a room type, in catalogue order (excluding the type's required ones). */
export function optionalPrefabs(type: RoomType): PrefabId[] {
  return PREFAB_IDS.filter(
    (id) =>
      PREFABS[id].role === 'optional' &&
      prefabAllowedIn(id, type) &&
      !REQUIRED_BY_TYPE[type].includes(id),
  );
}

/** Decor prefabs (any room), in catalogue order. */
export const DECOR_PREFABS: readonly PrefabId[] = PREFAB_IDS.filter(
  (id) => PREFABS[id].role === 'decor',
);

/** Signature prefabs, in catalogue order. */
export const SIGNATURE_PREFABS: readonly PrefabId[] = PREFAB_IDS.filter(
  (id) => PREFABS[id].role === 'signature',
);

/**
 * Footprint of a variant after `rot` quarter turns, in grid units: odd turns swap w and d.
 *
 * @throws RangeError for an unknown variant.
 */
export function rotatedFootprint(
  id: PrefabId,
  variant: number,
  rot: number,
): { w: number; d: number } {
  const fp = PREFABS[id].footprint[variant];
  if (fp === undefined) throw new RangeError(`${id} has no variant ${variant}`);
  return rot % 2 === 0 ? { w: fp[0], d: fp[1] } : { w: fp[1], d: fp[0] };
}

/** Unit vector of an item's front after `rot` quarter turns (rot 0 → +Z, 1 → +X, 2 → −Z, 3 → −X). */
export function frontDirection(rot: number): { x: number; z: number } {
  switch (((rot % 4) + 4) % 4) {
    case 0:
      return { x: 0, z: 1 };
    case 1:
      return { x: 1, z: 0 };
    case 2:
      return { x: 0, z: -1 };
    default:
      return { x: -1, z: 0 };
  }
}
