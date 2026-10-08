/**
 * Canonical JSON and the level hash (CP04 T6).
 *
 * Canonical JSON: object keys sorted at every level, no whitespace, `undefined` fields
 * omitted, numbers as `JSON.stringify` writes them (generator numbers are exact multiples of
 * 0.25, plus the spawn yaw constants). Array order is kept: callers sort rooms, doors and
 * furniture by id before hashing.
 */
import type { Level } from '../types.js';
import { sha256Hex, utf8 } from './sha256.js';

/** JSON-compatible value. */
export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json | undefined };

/**
 * Serialises a value as canonical JSON.
 *
 * @throws TypeError for non-finite numbers.
 */
export function canonicalJson(value: Json): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: non-finite number ${value}`);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${(value as readonly Json[]).map((v) => canonicalJson(v)).join(',')}]`;
  }
  const obj = value as { readonly [k: string]: Json | undefined };
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k] as Json)}`).join(',')}}`;
}

/** The fields of a level that the hash covers (everything a player receives). */
export type HashedLevel = Pick<
  Level,
  'seed' | 'difficulty' | 'generatorVersion' | 'startRoom' | 'goalRoom' | 'spawn' | 'rooms'
>;

/** SHA-256 hex of the canonical JSON of `{ seed, difficulty, generatorVersion, startRoom, goalRoom, spawn, rooms }`. */
export function levelHash(level: HashedLevel): string {
  const hashed = {
    seed: level.seed,
    difficulty: level.difficulty,
    generatorVersion: level.generatorVersion,
    startRoom: level.startRoom,
    goalRoom: level.goalRoom,
    spawn: level.spawn,
    rooms: level.rooms,
  };
  return sha256Hex(utf8(canonicalJson(hashed)));
}
