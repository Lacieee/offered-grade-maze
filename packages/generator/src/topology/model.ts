/**
 * Internal working model of one generation attempt. Everything is in grid units
 * (1 unit = 0.25 m, integers) and rooms are addressed by temporary index (`t00…`).
 */
import type { RoomType, Wall } from '@ogm/shared';
import type { Sfc32 } from '../prng/index.js';

/** Target of a link: temporary room index and door index. */
export interface TLink {
  room: number;
  door: number;
}

/** A door during generation. */
export interface TDoor {
  /** Door index, `d<id>` in the output; placement order. */
  id: number;
  wall: Wall;
  /** Offset from the wall centre in units. */
  offset: number;
  link: TLink | null;
  /** Sealed doors never get a link and never receive one (PD9). */
  sealed: boolean;
  /** Number of links that arrive at this door. */
  arrivals: number;
}

/** A room during generation. */
export interface TRoom {
  idx: number;
  type: RoomType;
  /** Assigned depth (layer). */
  layer: number;
  doorCount: number;
  /** Interior size in units (even: 0.5 m snap). */
  widthU: number;
  depthU: number;
  doors: TDoor[];
  /** Index of the spine room this twin copies, or null. */
  twinOf: number | null;
  /** True when some twin copies this room (its door count is then fixed). */
  isOriginal: boolean;
}

/** One link in creation order. */
export interface TLinkRecord {
  from: TLink;
  to: TLink;
}

/** Thrown inside an attempt when a step cannot complete; the attempt is retried. */
export class AttemptFailed extends Error {
  override readonly name = 'AttemptFailed';
}

/** Mutable state of one attempt. */
export class Draft {
  readonly rooms: TRoom[] = [];
  readonly links: TLinkRecord[] = [];
  /** Solution length L; the goal is the room at index L, the start index 0. */
  L = 0;
  /** Twin count. */
  twins = 0;

  /** Room by index. */
  room(idx: number): TRoom {
    const r = this.rooms[idx];
    if (r === undefined) throw new AttemptFailed(`no room t${idx}`);
    return r;
  }

  /** Door by link target. */
  door(at: TLink): TDoor {
    const d = this.room(at.room).doors[at.door];
    if (d === undefined) throw new AttemptFailed(`no door t${at.room}.d${at.door}`);
    return d;
  }

  /** Rooms at a layer, in index order. */
  layer(k: number): TRoom[] {
    return this.rooms.filter((r) => r.layer === k);
  }

  /** Adds the link `from → to`. */
  link(from: TLink, to: TLink): void {
    const src = this.door(from);
    const dst = this.door(to);
    if (src.link !== null || src.sealed) throw new AttemptFailed('link from a used slot');
    if (dst.sealed) throw new AttemptFailed('link into a sealed door');
    if (from.room === to.room && from.door === to.door) throw new AttemptFailed('door to itself');
    src.link = { room: to.room, door: to.door };
    dst.arrivals++;
    this.links.push({ from: { ...from }, to: { ...to } });
  }
}

/** True when the door has no outgoing link and is not sealed. */
export function isFree(d: TDoor): boolean {
  return d.link === null && !d.sealed;
}

/** Free slots of a room, in door order. */
export function freeSlots(r: TRoom): TDoor[] {
  return r.doors.filter(isFree);
}

/** Doors of a room that may receive a link (not sealed), in door order. */
export function enterable(r: TRoom): TDoor[] {
  return r.doors.filter((d) => !d.sealed);
}

/** All free slots of the house, rooms by index then doors by id. */
export function allFreeSlots(draft: Draft): TLink[] {
  const out: TLink[] = [];
  for (const r of draft.rooms) for (const d of freeSlots(r)) out.push({ room: r.idx, door: d.id });
  return out;
}

/**
 * Chooses the arrival door in `room` (CP04 T3 step 6): random, preferring doors not yet
 * used as an arrival and, when `preferFreeSlot`, doors whose own slot is still free. Never a
 * sealed door (PD9) and never `exclude`.
 */
export function pickArrival(
  rng: Sfc32,
  room: TRoom,
  preferFreeSlot: boolean,
  exclude: number | null = null,
): TDoor {
  const all = enterable(room).filter((d) => d.id !== exclude);
  const unused = all.filter((d) => d.arrivals === 0);
  const tiers = [preferFreeSlot ? unused.filter(isFree) : [], unused, all];
  for (const tier of tiers) if (tier.length > 0) return rng.pick(tier);
  throw new AttemptFailed(`no enterable door in t${room.idx}`);
}

/**
 * Quality of a room as a link target: 0 when it has an enterable door nothing arrives at yet
 * whose slot is free (when `preferFreeSlot`), 1 for an unused enterable door, 2 otherwise.
 */
export function arrivalTier(room: TRoom, preferFreeSlot: boolean): number {
  const unused = enterable(room).filter((d) => d.arrivals === 0);
  if (preferFreeSlot && unused.some(isFree)) return 0;
  return unused.length > 0 ? 1 : 2;
}

/** A random room among `rooms` with the best {@link arrivalTier}. */
export function pickTarget(rng: Sfc32, rooms: readonly TRoom[], preferFreeSlot: boolean): TRoom {
  const enterableRooms = rooms.filter((r) => enterable(r).length > 0);
  if (enterableRooms.length === 0) throw new AttemptFailed('no enterable target room');
  const tiers = enterableRooms.map((r) => arrivalTier(r, preferFreeSlot));
  const best = Math.min(...tiers);
  return rng.pick(enterableRooms.filter((_, i) => tiers[i] === best));
}

/**
 * Systematic sampling of yes/no decisions: each call is "yes" with probability
 * perMille / 1000, like `rng.chance(perMille)`, but the number of yeses over n calls is always
 * ⌊n·p⌋ or ⌈n·p⌉. A random start (0…999) gives every call exactly the stated marginal
 * probability. Used for reciprocation and pairing, where binomial noise on small houses would
 * push the asymmetric share outside the table's range far more often.
 */
export class SystematicChance {
  private acc: number;

  constructor(
    rng: Sfc32,
    private readonly perMille: number,
  ) {
    this.acc = rng.int(0, 999);
  }

  /** The next decision. */
  next(): boolean {
    this.acc += this.perMille;
    if (this.acc >= 1000) {
      this.acc -= 1000;
      return true;
    }
    return false;
  }
}
