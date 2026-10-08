/**
 * The construction steps of one attempt (CP04 T3, steps 1–10), adapted to PD9: a sealed
 * door is never an arrival door. Each step draws from its own stream
 * `topology#<attempt>/<step>`, so changing one step never shifts another step's numbers.
 *
 * Construction invariants (T2), with d = assigned depth and L the goal depth:
 *   1. every link u → v has d(v) ≤ d(u) + 1;
 *   2. every room with d < L links to some room at d + 1;
 *   3. every room with d ≥ 1 is linked from some room at d − 1.
 * Steps 6a–6c establish 2 and 3; every later step only creates links that keep 1.
 *
 * Exact counts: self-links, sealed doors and long back links (target depth ≤ d − 3) are made
 * only in step 7. Reciprocation skips self-links, pairing joins different rooms at most one
 * layer apart, and step 10 sends back links only 1–2 layers back.
 */
import type { Difficulty, RoomType } from '@ogm/shared';
import {
  DIFFICULTY_TABLE,
  OPEN_MAX,
  ROOM_TYPES,
  ROOM_TYPE_ORDER,
  type DifficultyParams,
  type Range,
} from '../difficulty/table.js';
import type { Sfc32 } from '../prng/index.js';
import { placeDoors } from './doors.js';
import {
  AttemptFailed,
  Draft,
  allFreeSlots,
  enterable,
  freeSlots,
  isFree,
  pickArrival,
  pickTarget,
  SystematicChance,
  type TDoor,
  type TLink,
  type TRoom,
} from './model.js';

/**
 * How free choices are steered toward the table's asymmetric-share range (ADR-0005). The
 * reciprocal probability alone would put easy houses above 25 % one-way links too often and
 * spread medium ones across both ends of 30–60 %.
 */
export interface Steering {
  /**
   * Easy: arrange layers and door counts for few forced one-way links, keep arrival doors
   * free for reciprocation, cover with rooms that still lack a forward link, and send
   * progress links to rooms with an unused free door.
   */
  reciprocityFriendly: boolean;
  /** Put sealed doors, self-links and long back links on the slots least able to pair. */
  specialsOnLeastPairable: boolean;
}

/** Steering per difficulty. */
export const STEERING: Readonly<Record<Difficulty, Steering>> = {
  easy: { reciprocityFriendly: true, specialsOnLeastPairable: true },
  medium: { reciprocityFriendly: false, specialsOnLeastPairable: true },
  hard: { reciprocityFriendly: false, specialsOnLeastPairable: false },
};

/** Streams for the steps of one attempt. */
export type StepRng = (step: number) => Sfc32;

/** How many extra values an open-ended range (max = OPEN_MAX) may draw above its minimum. */
export const OPEN_RANGE_SPAN = 3;

/** Draws from a table range; open-ended ranges draw from min…min + OPEN_RANGE_SPAN. */
function drawCount(rng: Sfc32, r: Range): number {
  return rng.int(r.min, r.max >= OPEN_MAX ? r.min + OPEN_RANGE_SPAN : r.max);
}

/** Builds the full link graph of one attempt. */
export function buildTopology(difficulty: Difficulty, rngOf: StepRng): Draft {
  const p = DIFFICULTY_TABLE[difficulty];
  const steering = STEERING[difficulty];
  const draft = new Draft();

  // ---------------------------------------------------------------- 1. parameters
  const r1 = rngOf(1);
  const N = r1.int(p.rooms.min, p.rooms.max);
  draft.L = r1.int(p.solutionLength.min, p.solutionLength.max);
  const L = draft.L;
  // Spine: t0 (start) … tL (goal). Decoys: t(L+1) … t(N−1). Twins: the first decoys.
  const r3 = rngOf(3);
  draft.twins = r3.int(p.twins.min, p.twins.max);
  for (let idx = 0; idx < N; idx++) {
    draft.rooms.push({
      idx,
      type: 'living',
      layer: idx <= L ? idx : -1,
      doorCount: 0,
      widthU: 0,
      depthU: 0,
      doors: [],
      twinOf: null,
      isOriginal: false,
    });
  }
  const twins = draft.rooms.slice(L + 1, L + 1 + draft.twins);
  if (twins.length !== draft.twins) throw new AttemptFailed('not enough decoys for the twins');

  // ---------------------------------------------------------------- 2. types
  assignTypes(rngOf(2), draft, new Set(twins.map((t) => t.idx)));

  // ---------------------------------------------------------------- 3. twins
  // Originals: distinct spine rooms other than the goal (the goal is unique).
  const originals = r3.shuffle(draft.rooms.slice(0, L)).slice(0, twins.length);
  twins.forEach((twin, i) => {
    // `originals` has one entry per twin: every table row has L ≥ its maximum twin count.
    const original = originals[i] as TRoom;
    twin.twinOf = original.idx;
    twin.type = original.type;
    original.isOriginal = true;
  });

  // ---------------------------------------------------------------- 5a. door counts
  const r5 = rngOf(5);
  for (const room of draft.rooms) {
    if (room.twinOf !== null) continue;
    // Start has at least 2 doors.
    const min = room.idx === 0 ? Math.max(2, p.doorsPerRoom.min) : p.doorsPerRoom.min;
    let c = r5.int(min, p.doorsPerRoom.max);
    if (room.type === 'hallway') c = Math.min(4, c + 1);
    room.doorCount = c;
  }
  for (const twin of twins) twin.doorCount = draft.room(twin.twinOf ?? 0).doorCount;

  // ---------------------------------------------------------------- 4. depths
  assignDepths(rngOf(4), draft, steering.reciprocityFriendly ? p : null);

  // ---------------------------------------------------------------- 5b. footprints and doors
  for (const room of draft.rooms) {
    if (room.twinOf !== null) continue;
    const t = ROOM_TYPES[room.type];
    room.widthU = 2 * r5.int(t.width.min / 2, t.width.max / 2);
    room.depthU = 2 * r5.int(t.depth.min / 2, t.depth.max / 2);
    room.doors = placeDoors(r5, room.widthU, room.depthU, room.doorCount);
  }
  for (const twin of twins) {
    const o = draft.room(twin.twinOf ?? 0);
    twin.widthU = o.widthU;
    twin.depthU = o.depthU;
    twin.doors = o.doors.map((d) => ({ ...d, link: null, sealed: false, arrivals: 0 }));
  }

  // ---------------------------------------------------------------- 6. mandatory links
  mandatoryLinks(rngOf(6), draft, steering.reciprocityFriendly);

  // ---------------------------------------------------------------- 7. specials
  specials(rngOf(7), draft, difficulty);

  // ---------------------------------------------------------------- 8. reciprocation
  const r8 = new SystematicChance(rngOf(8), p.reciprocalPerMille);
  for (const { from, to } of draft.links.slice()) {
    if (from.room === to.room) continue;
    const back = draft.door(to);
    if (!isFree(back)) continue;
    if (draft.room(from.room).layer > draft.room(to.room).layer + 1) continue;
    if (r8.next()) draft.link(to, from);
  }

  // ---------------------------------------------------------------- 9. pairing
  pairing(rngOf(9), draft, p.reciprocalPerMille);

  // ---------------------------------------------------------------- 10. remaining slots
  const r10 = rngOf(10);
  const w = p.remainingWeights;
  for (const slot of allFreeSlots(draft)) {
    const d = draft.room(slot.room).layer;
    const targets = (pred: (r: TRoom) => boolean): TRoom[] =>
      draft.rooms.filter((r) => r.idx !== slot.room && pred(r) && enterable(r).length > 0);
    const kinds = [
      targets((r) => r.layer === d - 1 || r.layer === d - 2),
      targets((r) => r.layer === d),
      targets((r) => r.layer === d + 1),
    ];
    const weights = [w.back, w.lateral, w.forward].map((x, i) =>
      (kinds[i]?.length ?? 0) > 0 ? x : 0,
    );
    if (weights.every((x) => x === 0)) throw new AttemptFailed(`no target for t${slot.room}`);
    // weighted() returns an index of `kinds`, and the chosen kind is non-empty.
    const room = r10.pick(kinds[r10.weighted(weights)] as TRoom[]);
    const door = r10.pick(enterable(room));
    draft.link(slot, { room: room.idx, door: door.id });
  }
  return draft;
}

/**
 * Step 9: each remaining free slot, with probability `perMille`, pairs with another free slot
 * of a different room at most one layer away, and both directions are linked.
 *
 * Slots are visited most-constrained first (fewest possible partners; ties by room, then
 * door), and the partner is drawn among the candidates with the fewest partners of their
 * own. This greedy matching leaves far fewer slots without any partner than visiting in
 * room order, and those slots would become one-way links in step 10.
 */
function pairing(rng: Sfc32, draft: Draft, perMille: number): void {
  const decide = new SystematicChance(rng, perMille);
  const canPair = (a: TLink, b: TLink): boolean =>
    a.room !== b.room && Math.abs(draft.room(a.room).layer - draft.room(b.room).layer) <= 1;
  const partnersOf = (slot: TLink, free: readonly TLink[]): TLink[] =>
    free.filter((s) => canPair(slot, s));
  const visited = new Set<string>();
  const key = (s: TLink): string => `${s.room}.${s.door}`;
  for (;;) {
    const free = allFreeSlots(draft);
    const pending = free.filter((s) => !visited.has(key(s)));
    if (pending.length === 0) return;
    // Most constrained first; allFreeSlots() order breaks ties (room, then door).
    let slot = pending[0] as TLink;
    let fewest = partnersOf(slot, free).length;
    for (const s of pending) {
      const n = partnersOf(s, free).length;
      if (n < fewest) {
        slot = s;
        fewest = n;
      }
    }
    visited.add(key(slot));
    if (fewest === 0 || !decide.next()) continue;
    const partners = partnersOf(slot, free);
    const counts = partners.map((s) => partnersOf(s, free).length);
    const least = Math.min(...counts);
    const other = rng.pick(partners.filter((_, i) => counts[i] === least));
    visited.add(key(other));
    draft.link(slot, other);
    draft.link(other, slot);
  }
}

/** Step 2: every type at least once among non-twin rooms; start is living or hallway. */
function assignTypes(rng: Sfc32, draft: Draft, twinIdx: ReadonlySet<number>): void {
  const start = draft.room(0);
  start.type = rng.pick(['living', 'hallway'] as const);
  const rest = rng.shuffle(draft.rooms.filter((r) => r.idx !== 0 && !twinIdx.has(r.idx)));
  const missing: RoomType[] = ROOM_TYPE_ORDER.filter((t) => t !== start.type);
  if (rest.length < missing.length) throw new AttemptFailed('too few rooms for every type');
  const weights = ROOM_TYPE_ORDER.map((t) => ROOM_TYPES[t].weight);
  rest.forEach((room, i) => {
    // Index of ROOM_TYPE_ORDER from weighted(); `missing[i]` exists while i < missing.length.
    room.type =
      i < missing.length
        ? (missing[i] as RoomType)
        : (ROOM_TYPE_ORDER[rng.weighted(weights)] as RoomType);
  });
}

/**
 * Reciprocity-friendly steering (step 4, easy): adjusts decoy layers and door counts (within the table's range) to
 * reduce the links that are forced to be one-way. The estimate uses layer sizes and door
 * totals only, for layer k with n rooms and D doors:
 *   F(k)  = max(n(k), n(k+1))            forward links out of layer k (k < L)
 *   R(k)  = min(F(k−1), D(k) − F(k))     arrivals that can be answered by a back link
 *   lost  = F(k−1) − R(k)                arrivals that stay one-way (funnels)
 *   free  = D(k) − F(k) − R(k)           slots left for pairing
 * plus the free slots of the start and goal that their single neighbour layer cannot pair,
 * plus one when the total of free slots is odd, plus the forward links whose reciprocation
 * draw will say no. The objective is that estimate as a share of all doors (the asymmetric
 * share). Deterministic steepest descent: the best single change wins (ties: room index,
 * then layer or count order); stops at a minimum.
 */
function easeOneWayLinks(draft: Draft, doorRange: Range, reciprocalPerMille: number): void {
  const L = draft.L;
  /** Estimated one-way links (per mille of a link) and estimated links. */
  const estimate = (): { oneWay: number; links: number } => {
    const n: number[] = [];
    const D: number[] = [];
    for (let k = 0; k <= L; k++) {
      const layer = draft.layer(k);
      n.push(layer.length);
      D.push(layer.reduce((s, r) => s + r.doorCount, 0));
    }
    const at = (xs: number[], k: number): number => xs[k] ?? 0;
    const F = (k: number): number => (k < L ? Math.max(at(n, k), at(n, k + 1)) : 0);
    let lost = 0;
    let total = 0;
    let forward = 0;
    const free: number[] = [];
    for (let k = 0; k <= L; k++) {
      const incoming = k > 0 ? F(k - 1) : 0;
      forward += F(k);
      const R = Math.max(0, Math.min(incoming, at(D, k) - F(k)));
      lost += incoming - R;
      const f = Math.max(0, at(D, k) - F(k) - R);
      free.push(f);
      total += f;
    }
    const ends =
      Math.max(0, at(free, 0) - at(free, 1)) + Math.max(0, at(free, L) - at(free, L - 1));
    // Forced one-way links, plus forward links whose reciprocation draw says no.
    const oneWay = 1000 * (lost + ends + (total % 2)) + (1000 - reciprocalPerMille) * forward;
    return { oneWay, links: D.reduce((a, b) => a + b, 0) };
  };
  /** True when share a is lower than share b (cross-multiplied, integers only). */
  const lower = (a: ReturnType<typeof estimate>, b: ReturnType<typeof estimate>): boolean =>
    a.oneWay * b.links < b.oneWay * a.links;
  const adjustable = draft.rooms.filter((r) => r.twinOf === null && !r.isOriginal);
  const countRange = (r: TRoom): Range => {
    const min = r.idx === 0 ? Math.max(2, doorRange.min) : doorRange.min;
    const max = r.type === 'hallway' ? Math.min(4, doorRange.max + 1) : doorRange.max;
    return { min: r.type === 'hallway' ? Math.min(max, min + 1) : min, max };
  };
  for (let guard = 0; guard < 8 * draft.rooms.length; guard++) {
    let bestCost = estimate();
    let apply: (() => void) | null = null;
    for (const room of draft.rooms) {
      if (room.idx > L) {
        const home = room.layer;
        for (let k = 1; k <= L - 1; k++) {
          if (k === home) continue;
          room.layer = k;
          const c = estimate();
          if (lower(c, bestCost)) {
            bestCost = c;
            apply = () => (room.layer = k);
          }
        }
        room.layer = home;
      }
      if (adjustable.includes(room)) {
        const home = room.doorCount;
        const range = countRange(room);
        for (const c of [home - 1, home + 1]) {
          if (c < range.min || c > range.max) continue;
          room.doorCount = c;
          const v = estimate();
          if (lower(v, bestCost)) {
            bestCost = v;
            apply = () => (room.doorCount = c);
          }
        }
        room.doorCount = home;
      }
    }
    if (apply === null) return;
    apply();
  }
}

/**
 * Step 4: decoys get depths 1…L−1 with triangular weights favouring the middle, then the
 * layers are rebalanced until layer capacity holds for every k < L:
 *   slots(k) ≥ |layer k+1| + |layer k|.
 * A short layer first gains doors (rooms that are neither twins nor originals, up to 4);
 * otherwise a decoy moves from layer k+1 to the layer with the most spare capacity.
 */
function assignDepths(rng: Sfc32, draft: Draft, ease: DifficultyParams | null): void {
  const L = draft.L;
  const layers: number[] = [];
  const weights: number[] = [];
  for (let k = 1; k <= L - 1; k++) {
    layers.push(k);
    weights.push(Math.min(k, L - k));
  }
  for (const room of draft.rooms) {
    // weighted() returns an index of `layers`.
    if (room.layer < 0) room.layer = layers[rng.weighted(weights)] as number;
  }

  if (ease !== null) easeOneWayLinks(draft, ease.doorsPerRoom, ease.reciprocalPerMille);

  const slots = (k: number): number => draft.layer(k).reduce((s, r) => s + r.doorCount, 0);
  const demand = (k: number): number => draft.layer(k + 1).length + draft.layer(k).length;
  const spare = (k: number): number => slots(k) - demand(k);

  for (let guard = 0; guard < 4 * draft.rooms.length; guard++) {
    let k = 0;
    while (k < L && spare(k) >= 0) k++;
    if (k === L) return;

    const growable = draft
      .layer(k)
      .filter((r) => r.twinOf === null && !r.isOriginal && r.doorCount < 4);
    if (growable.length > 0) {
      rng.pick(growable).doorCount++;
      continue;
    }
    const movable = draft.layer(k + 1).filter((r) => r.idx > L);
    let best = -1;
    let bestSpare = 0;
    for (let j = 1; j <= L - 1; j++) {
      if (j === k + 1) continue;
      const s = spare(j - 1);
      if (s > bestSpare) {
        best = j;
        bestSpare = s;
      }
    }
    if (movable.length === 0 || best < 0) break;
    rng.pick(movable).layer = best;
  }
  throw new AttemptFailed('layer capacity could not be balanced');
}

/** Step 6: spine, coverage and progress links. */
function mandatoryLinks(rng: Sfc32, draft: Draft, friendly: boolean): void {
  const preferFreeSlot = friendly;
  const L = draft.L;
  const slotOf = (room: TRoom): TDoor => {
    const free = freeSlots(room);
    if (free.length === 0) throw new AttemptFailed(`t${room.idx} has no free slot`);
    // Keep arrival doors free where possible, so step 8 can reciprocate their links.
    const quiet = friendly ? free.filter((d) => d.arrivals === 0) : [];
    return rng.pick(quiet.length > 0 ? quiet : free);
  };
  const linkTo = (from: TRoom, to: TRoom): void => {
    const s = slotOf(from);
    const t = pickArrival(rng, to, preferFreeSlot);
    draft.link({ room: from.idx, door: s.id }, { room: to.idx, door: t.id });
  };

  // a. spine
  for (let k = 0; k < L; k++) linkTo(draft.room(k), draft.room(k + 1));

  // b. coverage: each decoy is linked from the parent with the most free slots (ties by index).
  // Reciprocity-friendly: parents without a forward link come first, so fewer progress links are
  // needed later (each one is an extra arrival in the next layer).
  const hasForward = (r: TRoom): boolean =>
    r.doors.some((d) => d.link !== null && draft.room(d.link.room).layer === r.layer + 1);
  const decoys = draft.rooms.slice(L + 1).sort((a, b) => a.layer - b.layer || a.idx - b.idx);
  for (const decoy of decoys) {
    const parents = draft
      .layer(decoy.layer - 1)
      .filter((r) => freeSlots(r).length > 0)
      .sort(
        (a, b) =>
          (friendly ? Number(hasForward(a)) - Number(hasForward(b)) : 0) ||
          freeSlots(b).length - freeSlots(a).length ||
          a.idx - b.idx,
      );
    const parent = parents[0];
    if (parent === undefined)
      throw new AttemptFailed(`no parent with a free slot for t${decoy.idx}`);
    linkTo(parent, decoy);
  }

  // c. progress: every room below the goal has a forward link.
  for (const room of draft.rooms) {
    if (room.layer >= L) continue;
    if (!hasForward(room)) {
      const next = draft.layer(room.layer + 1);
      linkTo(room, friendly ? pickTarget(rng, next, true) : rng.pick(next));
    }
  }
}

/**
 * The slots among `options` with the fewest possible pairing partners (free slots of other
 * rooms at most one layer away). Specials use these first: such slots would otherwise end up
 * as one-way links in step 10, so the asymmetric share stays near the table's range.
 */
function leastPairable(draft: Draft, all: readonly TLink[]): TLink[] {
  // Keep arrival doors free where possible (step 8 reciprocates their links).
  const quiet = all.filter((o) => draft.door(o).arrivals === 0);
  const options = quiet.length > 0 ? quiet : all;
  const free = allFreeSlots(draft);
  const score = options.map((o) => {
    const layer = draft.room(o.room).layer;
    return free.filter((f) => f.room !== o.room && Math.abs(draft.room(f.room).layer - layer) <= 1)
      .length;
  });
  const best = Math.min(...score);
  return options.filter((_, i) => score[i] === best);
}

/** Step 7: sealed doors, self-links and long back links, each an exact drawn count. */
function specials(rng: Sfc32, draft: Draft, difficulty: Difficulty): void {
  const p = DIFFICULTY_TABLE[difficulty];
  const sealed = drawCount(rng, p.sealedDoors);
  const selfLinks = drawCount(rng, p.selfLinks);
  const longBack = drawCount(rng, p.longBackLinks);
  const { reciprocityFriendly: friendly, specialsOnLeastPairable } = STEERING[difficulty];
  const choose = (options: TLink[]): TLink =>
    rng.pick(specialsOnLeastPairable ? leastPairable(draft, options) : options);

  // Sealed (PD9): only a free slot that nothing arrives at, and nothing will (enterable()
  // and pickArrival() skip sealed doors). At most one sealed door per room, so no room is
  // mostly closed doors.
  for (let i = 0; i < sealed; i++) {
    const options = allFreeSlots(draft).filter(
      (s) => draft.door(s).arrivals === 0 && !draft.room(s.room).doors.some((d) => d.sealed),
    );
    if (options.length === 0) throw new AttemptFailed('no door left to seal');
    draft.door(choose(options)).sealed = true;
  }

  // Self-links: to another, enterable door of the same room.
  for (let i = 0; i < selfLinks; i++) {
    const options = allFreeSlots(draft).filter(
      (s) => enterable(draft.room(s.room)).filter((d) => d.id !== s.door).length > 0,
    );
    if (options.length === 0) throw new AttemptFailed('no slot for a self-link');
    const s = choose(options);
    const room = draft.room(s.room);
    draft.link(s, { room: s.room, door: pickArrival(rng, room, friendly, s.door).id });
  }

  // Long back links: target depth ≤ source depth − 3.
  const farTargets = (s: TLink): TRoom[] => {
    const d = draft.room(s.room).layer;
    return draft.rooms.filter((r) => r.layer <= d - 3 && enterable(r).length > 0);
  };
  for (let i = 0; i < longBack; i++) {
    const options = allFreeSlots(draft).filter((s) => farTargets(s).length > 0);
    if (options.length === 0) throw new AttemptFailed('no slot for a long back link');
    const s = choose(options);
    const target = rng.pick(farTargets(s));
    draft.link(s, { room: target.idx, door: pickArrival(rng, target, friendly).id });
  }
}
