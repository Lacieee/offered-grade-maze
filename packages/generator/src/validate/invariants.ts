/**
 * The three construction invariants (CP04 T2) checked on a level's assigned depths. Used by
 * property tests and the CLI; the validator proves their consequences on the real graph.
 */
import type { Level } from '../types.js';

/** Returns a message per broken invariant; empty when all three hold. */
export function checkDepthInvariants(level: Level): string[] {
  const out: string[] = [];
  const depth = level.meta.depth;
  const L = depth[level.goalRoom];
  if (L === undefined) return [`goal room ${level.goalRoom} has no depth`];
  if (depth[level.startRoom] !== 0) out.push('start room depth is not 0');
  const hasForward = new Set<string>();
  const covered = new Set<string>();
  for (const room of level.rooms) {
    const du = depth[room.id];
    if (du === undefined) {
      out.push(`room ${room.id} has no depth`);
      continue;
    }
    if (du === L && room.id !== level.goalRoom) out.push(`room ${room.id} shares the goal depth`);
    for (const door of room.doors) {
      if (door.link === null) continue;
      const dv = depth[door.link.room];
      if (dv === undefined) continue;
      if (dv > du + 1) out.push(`1: ${room.id}.${door.id} skips ahead (${du} → ${dv})`);
      if (dv === du + 1) {
        hasForward.add(room.id);
        covered.add(door.link.room);
      }
    }
  }
  for (const room of level.rooms) {
    const d = depth[room.id];
    if (d === undefined) continue;
    if (d < L && !hasForward.has(room.id)) out.push(`2: room ${room.id} has no forward link`);
    if (d >= 1 && !covered.has(room.id))
      out.push(`3: room ${room.id} has no link from depth ${d - 1}`);
  }
  return out;
}
