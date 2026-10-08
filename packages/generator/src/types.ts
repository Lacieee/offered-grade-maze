/**
 * The generator's output model (CP04 §4). Internally the generator works in grid units
 * (1 unit = 0.25 m, integers); a `Level` is in metres via the `@ogm/shared` DTOs.
 */
import type { Difficulty, RoomDTO, RoomId, Spawn } from '@ogm/shared';

/** Generator version. Any change to output for an existing seed after v1.0.0 bumps it. */
export const GENERATOR_VERSION = 1 as const;

/** Difficulty metrics of a level (CP04 T5). */
export interface LevelMetrics {
  rooms: number;
  doors: number;
  links: number;
  /** BFS distance start → goal. */
  shortest: number;
  /** Links whose target door does not link back to the source door, per mille of all links. */
  asymmetricShare: number;
  selfLinks: number;
  sealedDoors: number;
  /** Links whose target depth ≤ source depth − 3 (assigned depths). */
  longBackLinks: number;
  twins: number;
  /** (spine room except goal, linked door) pairs that do not lead closer to the goal. */
  misleadingDoors: number;
}

/** Generation facts that are not sent to players (debug view and tests only). */
export interface LevelMeta {
  /** Assigned depth of every room. */
  depth: Record<RoomId, number>;
  /** Start … goal, length L + 1. */
  spine: RoomId[];
  /** For each room: the room it copies, or null. */
  twinOf: Record<RoomId, RoomId | null>;
  /** Attempts used (1 when the first attempt succeeded). */
  attempts: number;
  metrics: LevelMetrics;
  /** SHA-256 hex of the canonical JSON of the hashed fields (CP04 T6). */
  levelHash: string;
}

/** A generated house. Immutable once generated. */
export interface Level {
  /** Canonical seed code. */
  seed: string;
  difficulty: Difficulty;
  generatorVersion: typeof GENERATOR_VERSION;
  startRoom: RoomId;
  goalRoom: RoomId;
  /** Start-room centre, facing the wall of the start room's lowest door id. */
  spawn: Spawn;
  /** Sorted by id; doors sorted by id; furniture `[]` in CP04. */
  rooms: RoomDTO[];
  meta: LevelMeta;
}

/** Validator check ids (V7 and V8 arrive in CP05). */
export type CheckId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V9' | 'V10';

/** One problem found by the validator. */
export interface ValidationIssue {
  check: CheckId;
  message: string;
  room?: RoomId;
}

/** Thrown when a seed code cannot be parsed or names an unsupported generator version. */
export class InvalidSeedError extends Error {
  override readonly name = 'InvalidSeedError';
  constructor(
    readonly input: string,
    readonly reason: string,
  ) {
    super(`Invalid seed code '${input}': ${reason}`);
  }
}

/** Thrown when every attempt (up to {@link MAX_ATTEMPTS}) failed. */
export class GenerationError extends Error {
  override readonly name = 'GenerationError';
  constructor(
    readonly seed: string,
    /** Why each attempt failed, in order. */
    readonly failures: readonly string[],
  ) {
    super(`Could not generate a valid level for ${seed} in ${failures.length} attempts`);
  }
}

/** Maximum attempts per seed before {@link GenerationError}. */
export const MAX_ATTEMPTS = 64;
