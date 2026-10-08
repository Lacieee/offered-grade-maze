/**
 * Door placement in grid units (CP04 T3 step 5). Integer maths only.
 *
 * In metres: a door is 1.0 m wide, its edge stays ≥ 0.5 m from each corner and ≥ 0.6 m from
 * any other door on the same wall. In units (0.25 m): half width 2, margin 2, so
 * |offset| ≤ wallUnits / 2 − 4; two centres need |Δ| ≥ 6.4 units, i.e. 5·|Δ| ≥ 32.
 */
import { WALLS, type Wall } from '@ogm/shared';
import type { Sfc32 } from '../prng/index.js';
import { AttemptFailed, type TDoor } from './model.js';

/** Interior wall length in units (N/S span the width, E/W the depth). */
export function wallUnits(widthU: number, depthU: number, wall: Wall): number {
  return wall === 'N' || wall === 'S' ? widthU : depthU;
}

/** Largest |offset| in units on a wall of `lengthU` units (lengths are even). */
export function maxOffsetUnits(lengthU: number): number {
  return lengthU / 2 - 4;
}

/** True when two door centres on one wall are far enough apart (≥ 1.6 m). */
export function spacedEnough(a: number, b: number): boolean {
  return 5 * Math.abs(a - b) >= 32;
}

/** Valid integer offsets for a new door on `wall`, ascending. */
export function validOffsets(
  widthU: number,
  depthU: number,
  wall: Wall,
  existing: readonly TDoor[],
): number[] {
  const max = maxOffsetUnits(wallUnits(widthU, depthU, wall));
  const others = existing.filter((d) => d.wall === wall).map((d) => d.offset);
  const out: number[] = [];
  // Start at 0 − max, not −max: no negative zero when max is 0.
  for (let o = 0 - max; o <= max; o++) {
    if (others.every((x) => spacedEnough(o, x))) out.push(o);
  }
  return out;
}

/**
 * Places `count` doors: each picks a wall weighted by its length (among walls with room
 * left), then a uniformly random valid offset. Door ids follow placement order.
 */
export function placeDoors(rng: Sfc32, widthU: number, depthU: number, count: number): TDoor[] {
  const doors: TDoor[] = [];
  for (let id = 0; id < count; id++) {
    const options = WALLS.map((wall) => ({
      wall,
      offsets: validOffsets(widthU, depthU, wall, doors),
    }));
    const weights = options.map((o) =>
      o.offsets.length > 0 ? wallUnits(widthU, depthU, o.wall) : 0,
    );
    if (weights.every((w) => w === 0)) {
      throw new AttemptFailed(`no room for door ${id} in a ${widthU}×${depthU} room`);
    }
    // weighted() returns an index into `options`.
    const choice = options[rng.weighted(weights)] as (typeof options)[number];
    doors.push({
      id,
      wall: choice.wall,
      offset: rng.pick(choice.offsets),
      link: null,
      sealed: false,
      arrivals: 0,
    });
  }
  return doors;
}
