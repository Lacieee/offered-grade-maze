/**
 * Difficulty table v1 (CP04 T1, architecture §8.3). Data only.
 *
 * Probabilities are integers in per-mille. Every value changes generator output, so after
 * v1.0.0 any change requires a `GENERATOR_VERSION` bump.
 */
import type { Difficulty, FloorKind, RoomType } from '@ogm/shared';

/** Inclusive integer range. */
export interface Range {
  min: number;
  max: number;
}

/** Weights for the kind of link drawn for a remaining free slot (CP04 T3 step 10). */
export interface RemainingWeights {
  back: number;
  lateral: number;
  forward: number;
}

/** One row of the difficulty table. */
export interface DifficultyParams {
  /** Room count N. */
  rooms: Range;
  /** Solution length L in doors (shortest start → goal distance). */
  solutionLength: Range;
  /** Door count drawn per room (start ≥ 2, hallways +1 up to 4). */
  doorsPerRoom: Range;
  /** Probability of reciprocating a link and of pairing two free slots. */
  reciprocalPerMille: number;
  /** Validated range of the asymmetric-link share, per mille. */
  asymmetricShare: Range;
  selfLinks: Range;
  sealedDoors: Range;
  /** Links whose target depth ≤ source depth − 3. */
  longBackLinks: Range;
  twins: Range;
  /** Minimum misleading doors in spine rooms (doors that do not lead closer to the goal). */
  misleadingDoorsMin: number;
  remainingWeights: RemainingWeights;
}

/** Upper bound used in the table for "at least" ranges. */
export const OPEN_MAX = 99;

/** The difficulty table. */
export const DIFFICULTY_TABLE: Readonly<Record<Difficulty, DifficultyParams>> = {
  easy: {
    rooms: { min: 8, max: 10 },
    solutionLength: { min: 4, max: 5 },
    doorsPerRoom: { min: 2, max: 3 },
    reciprocalPerMille: 850,
    asymmetricShare: { min: 0, max: 250 },
    selfLinks: { min: 0, max: 0 },
    sealedDoors: { min: 0, max: 1 },
    longBackLinks: { min: 0, max: 1 },
    twins: { min: 0, max: 0 },
    misleadingDoorsMin: 1,
    remainingWeights: { back: 30, lateral: 20, forward: 50 },
  },
  medium: {
    rooms: { min: 12, max: 16 },
    solutionLength: { min: 6, max: 7 },
    doorsPerRoom: { min: 2, max: 4 },
    reciprocalPerMille: 500,
    asymmetricShare: { min: 300, max: 600 },
    selfLinks: { min: 1, max: 2 },
    sealedDoors: { min: 1, max: 3 },
    longBackLinks: { min: 2, max: 3 },
    twins: { min: 1, max: 2 },
    misleadingDoorsMin: 3,
    remainingWeights: { back: 40, lateral: 25, forward: 35 },
  },
  hard: {
    rooms: { min: 18, max: 24 },
    solutionLength: { min: 8, max: 10 },
    doorsPerRoom: { min: 3, max: 4 },
    reciprocalPerMille: 200,
    asymmetricShare: { min: 600, max: 1000 },
    selfLinks: { min: 2, max: 4 },
    sealedDoors: { min: 3, max: 6 },
    longBackLinks: { min: 4, max: OPEN_MAX },
    twins: { min: 3, max: 5 },
    misleadingDoorsMin: 6,
    remainingWeights: { back: 50, lateral: 25, forward: 25 },
  },
};

/** Size and floor of a room type. Sizes are in grid units (0.25 m), always even (0.5 m snap). */
export interface RoomTypeParams {
  width: Range;
  depth: Range;
  floor: FloorKind;
  /** Weight when filling rooms beyond the first of each type. */
  weight: number;
  /**
   * Most doors a room of this type may have (CP05, ADR-0006): a 3–4 m bathroom with four
   * door clearance zones often has no wall left for a bathtub or a shower.
   */
  maxDoors: number;
}

/** Room types (CP04 T1). Metres × 4 = units: living 6.0–8.0 m → 24–32 units. */
export const ROOM_TYPES: Readonly<Record<RoomType, RoomTypeParams>> = {
  living: {
    width: { min: 24, max: 32 },
    depth: { min: 24, max: 36 },
    floor: 'wood',
    weight: 1,
    maxDoors: 4,
  },
  kitchen: {
    width: { min: 16, max: 24 },
    depth: { min: 16, max: 24 },
    floor: 'tile',
    weight: 1,
    maxDoors: 4,
  },
  bedroom: {
    width: { min: 16, max: 24 },
    depth: { min: 18, max: 24 },
    floor: 'carpet',
    weight: 2,
    maxDoors: 4,
  },
  bathroom: {
    width: { min: 12, max: 16 },
    depth: { min: 12, max: 16 },
    floor: 'tile',
    weight: 1,
    maxDoors: 3,
  },
  hallway: {
    width: { min: 8, max: 10 },
    depth: { min: 20, max: 36 },
    floor: 'wood',
    weight: 2,
    maxDoors: 4,
  },
  study: {
    width: { min: 14, max: 20 },
    depth: { min: 14, max: 20 },
    floor: 'carpet',
    weight: 1,
    maxDoors: 4,
  },
};

/** All room types in a fixed order (iteration order for generation). */
export const ROOM_TYPE_ORDER = [
  'living',
  'kitchen',
  'bedroom',
  'bathroom',
  'hallway',
  'study',
] as const satisfies readonly RoomType[];

/** i18n label key of a room type, e.g. `room.living`. */
export function roomLabel(type: RoomType): string {
  return `room.${type}`;
}
